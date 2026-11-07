"""3D Scene Planning agent (design §6.2, Phase 5) and AI 3D-asset generation jobs.

The model only chooses among catalogue options; its output is converted into a SceneSpec,
then validated against real asset parts / generator registry before being saved as a draft.
Model generation is never started automatically — it costs credits, so a teacher triggers it.
"""

import json
import logging
import re
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError, ConflictError, NotFoundError
from app.integrations.interfaces import (
    ProviderPermanentError,
    ProviderTaskStatus,
    ProviderTransientError,
    ReferencePassage,
    ThreeDTask,
)
from app.integrations.three_d import get_three_d_provider
from app.modules.ai_engine.models import AIUsageRecord
from app.modules.ai_engine.prompting import teacher_instructions
from app.modules.ai_engine.prompts import SCENE_PLANNING
from app.modules.ai_engine.schemas import ScenePlanLLM
from app.modules.ai_engine.validation import OutputRejectedError
from app.modules.chapters.models import Chapter
from app.modules.courses.models import Course
from app.modules.lessons.content import LessonContent
from app.modules.lessons.models import Lesson
from app.modules.operations import audit
from app.modules.operations.jobs import JobType
from app.modules.operations.models import Job
from app.modules.operations.runner import (
    PendingJobError,
    PermanentJobError,
    TransientJobError,
    create_job,
    dispatch,
    handler,
)
from app.modules.three_d.assets_service import (
    get_asset_for,
    register_version_bytes,
    relevance,
)
from app.modules.three_d.contracts import SceneSpec
from app.modules.three_d.models import ReviewStatus, ThreeDAsset, ThreeDAssetVersion
from app.modules.three_d.procedural import GENERATORS
from app.modules.three_d.scenes_service import (
    SceneInvalidError,
    save_ai_scene,
    usable_assets_for_course,
)
from app.modules.users.models import User

log = logging.getLogger(__name__)

CATALOGUE_MARKER = "CATALOGUE_JSON:"
_ID = re.compile(r"[^a-z0-9_]+")


def _ident(raw: str, prefix: str) -> str:
    s = _ID.sub("_", raw.lower()).strip("_")[:56]
    return s if s[:1].isalpha() else f"{prefix}_{s}".rstrip("_")


def lesson_passages(lesson: Lesson) -> list[ReferencePassage]:
    content = LessonContent.model_validate(lesson.content_json)
    return [
        ReferencePassage(f"lesson:{lesson.id}", i, i, f"{sec.title}\n\n{sec.body_markdown}")
        for i, sec in enumerate(content.sections, start=1)
        if sec.body_markdown.strip()
    ]


def build_catalogue(
    db: Session, course: Course, lesson_text: str, limit: int = 15
) -> dict[str, Any]:
    pairs = usable_assets_for_course(db, course)
    pairs.sort(key=lambda p: -relevance(lesson_text, p[0]))
    return {
        "assets": [
            {
                "id": a.slug,
                "version": v.version_number,
                "name": a.name,
                "description": a.description[:300],
                "subject": a.subject,
                "parts": v.metadata_json.get("node_names", [])[:80],
            }
            for a, v in pairs[:limit]
        ],
        "generators": [
            {
                "name": g.name,
                "description": g.description,
                "params": {
                    k: {"type": p.kind.__name__, "min": p.lo, "max": p.hi}
                    for k, p in g.params.items()
                },
                "parts": g.components({k: p.hi for k, p in g.params.items() if p.hi is not None}),
            }
            for g in GENERATORS.values()
        ],
    }


def convert_plan(
    plan: ScenePlanLLM, catalogue: dict[str, Any], lesson_title: str
) -> tuple[SceneSpec | None, dict[str, Any]]:
    """Return (scene spec or None, suggestion info). Raises OutputRejectedError."""
    info: dict[str, Any] = {"decision": plan.decision, "rationale": plan.rationale[:1000]}
    title = (plan.title.strip() or f"Explore: {lesson_title}")[:200]
    if plan.decision == "generate_asset":
        prompt = plan.generation_prompt.strip()[:500]
        if not prompt:
            raise OutputRejectedError("INVALID_OUTPUT", "Generation suggested without a prompt.")
        info["generation_prompt"] = prompt
        info["suggested_name"] = title
        return None, info
    if plan.decision == "none":
        return None, info

    available: list[str]
    base: dict[str, Any] = {
        "schema_version": "1.0",
        "scene_id": f"scene_{secrets.token_hex(4)}",
        "title": title,
        "controls": ["rotate", "zoom", "select_component"],
    }
    if plan.decision == "reuse_asset":
        asset = next((a for a in catalogue["assets"] if a["id"] == plan.asset_id), None)
        if asset is None:
            raise OutputRejectedError(
                "UNKNOWN_ASSET", "The plan referenced a model not in the catalogue."
            )
        available = list(asset["parts"])
        base["asset_refs"] = [{"asset_id": asset["id"], "version": asset["version"]}]
        base["camera"] = {"preset": "three_quarter", "min_distance": 2, "max_distance": 12}
    else:
        gen = GENERATORS.get(plan.generator)
        if gen is None:
            raise OutputRejectedError(
                "UNKNOWN_GENERATOR", "The plan referenced an unknown generator."
            )
        params: dict[str, float | int | bool] = {}
        for p in plan.generator_params:
            spec = gen.params.get(p.name)
            if spec is None:
                continue
            if spec.kind is bool:
                params[p.name] = bool(p.value)
            else:
                v = round(p.value)
                if spec.lo is not None and spec.hi is not None:
                    v = int(min(spec.hi, max(spec.lo, v)))
                params[p.name] = v
        available = gen.components(params)
        base["procedural"] = [{"generator": gen.name, "params": params}]
        big = gen.name == "solar_system"
        base["camera"] = {
            "preset": "three_quarter",
            "min_distance": 4 if big else 2,
            "max_distance": 60 if big else 20,
        }
        base["controls"] = ["rotate", "zoom", "pan", "select_component"]

    chosen = [c for c in plan.components if c.mesh_name in available]
    if not chosen:  # fall back to every part, unlabeled explanations
        chosen_rows = [(n, n.replace("_", " ").capitalize(), "") for n in available[:40]]
        info.setdefault("warnings", []).append("No valid parts were chosen; all parts included.")
    else:
        chosen_rows = [
            (c.mesh_name, c.label.strip()[:200] or c.mesh_name, c.explanation.strip())
            for c in chosen[:40]
        ]
    components, explanations, seen = [], {}, set()
    for mesh, label, text in chosen_rows:
        cid = _ident(mesh, "part")
        if cid in seen:
            continue
        seen.add(cid)
        comp: dict[str, Any] = {
            "component_id": cid,
            "mesh_name": mesh,
            "label": label,
            "actions": ["highlight", "show_explanation"],
        }
        if text:
            ref = f"exp_{cid}"[:64]
            explanations[ref] = text[:2000]
            comp["explanation_ref"] = ref
        components.append(comp)
    base["components"] = components
    base["explanations"] = explanations
    try:
        return SceneSpec.model_validate(base), info
    except ValueError as exc:
        raise OutputRejectedError("INVALID_OUTPUT", "The planned scene failed validation.") from exc


@handler(JobType.SCENE_PLANNING)
def plan_scene(db: Session, job: Job) -> dict[str, Any]:
    from app.modules.ai_engine.workflows import _call, _record, _rejected

    lesson = db.get(Lesson, job.target_id)
    if lesson is None:
        raise PermanentJobError("LESSON_MISSING", "The lesson no longer exists.")
    chapter = db.get(Chapter, lesson.chapter_id)
    assert chapter is not None
    course = db.get(Course, chapter.course_id)
    assert course is not None
    passages = lesson_passages(lesson)
    text = " ".join(p.text for p in passages)
    catalogue = build_catalogue(db, course, f"{lesson.title} {text}")
    content = LessonContent.model_validate(lesson.content_json)
    candidates = "\n".join(
        f"- {v.concept} ({v.visualization_type}): {v.learning_reason}"
        for v in content.visualization_candidates
    )
    task = (
        f"Lesson: {lesson.title}\nChapter: {chapter.title}\n"
        f"Visualization candidates:\n{candidates or '- none listed'}\n"
        f"{teacher_instructions(chapter.ai_instructions)}\n\n"
        f"{CATALOGUE_MARKER}\n{json.dumps(catalogue)}"
    )
    plan, usage = _call(db, job, SCENE_PLANNING, task, passages, ScenePlanLLM)
    try:
        spec, info = convert_plan(plan, catalogue, lesson.title)
    except OutputRejectedError as exc:
        raise _rejected(exc) from exc
    if spec is not None:
        try:
            scene = save_ai_scene(db, lesson, course, spec, info["rationale"], job.requested_by)
        except SceneInvalidError as exc:
            raise PermanentJobError(
                "INVALID_OUTPUT", "The planned scene did not validate."
            ) from exc
        info["scene_id"] = str(scene.id)
    _record(
        db,
        job,
        usage,
        SCENE_PLANNING,
        kind="scene_plan",
        target_type="lesson",
        target_id=lesson.id,
        output={"plan": plan.model_dump(), **info},
        validation={},
        status="applied" if spec else "proposed",
    )
    db.commit()
    return info


# ------------------------------------------------------------------ generation


class GenerationBudgetError(AppError):
    status_code = 429
    code = "THREE_D_BUDGET_EXCEEDED"
    message = "Your daily 3D model generation limit has been reached."


def check_generation_budget(db: Session, user: User) -> None:
    since = datetime.now(UTC) - timedelta(days=1)
    used = (
        db.scalar(
            select(func.count(Job.id)).where(
                Job.requested_by == user.id,
                Job.job_type == JobType.THREE_D_ASSET_GENERATION,
                Job.created_at >= since,
            )
        )
        or 0
    )
    if used >= get_settings().three_d_max_generations_per_user_per_day:
        raise GenerationBudgetError()


def start_generation(
    db: Session,
    user: User,
    asset: ThreeDAsset,
    prompt: str,
    provider: str | None = None,
    lesson_id: uuid.UUID | None = None,
) -> Job:
    """Start a 3D generation. With `lesson_id` the finished model is saved straight into that
    lesson as a draft scene (Chapter Studio "Generate new")."""
    check_generation_budget(db, user)
    job = create_job(
        db,
        job_type=JobType.THREE_D_ASSET_GENERATION,
        target_type="three_d_asset",
        target_id=asset.id,
        requested_by=user.id,
        school_id=asset.owner_school_id,
        input_snapshot={
            "prompt": prompt,
            "provider": provider,
            "lesson_id": str(lesson_id) if lesson_id else None,
        },
    )
    audit.record(
        db,
        action="asset.generation_requested",
        resource_type="three_d_asset",
        resource_id=asset.id,
        actor_user_id=user.id,
    )
    db.commit()
    dispatch(job.id)
    db.refresh(job)
    return job


@handler(JobType.THREE_D_ASSET_GENERATION)
def generate_asset(db: Session, job: Job) -> dict[str, Any]:
    asset = db.get(ThreeDAsset, job.target_id)
    if asset is None:
        raise PermanentJobError("ASSET_MISSING", "The asset no longer exists.")
    try:
        provider = get_three_d_provider(job.input_snapshot.get("provider"))
    except ValueError as exc:
        raise PermanentJobError("PROVIDER_UNAVAILABLE", str(exc)) from exc
    job.provider = provider.name
    try:
        if job.provider_task_id is None:
            # Persist the provider task id BEFORE polling so retries never create (and bill) twice.
            task = provider.create_task(
                prompt=job.input_snapshot["prompt"], idempotency_key=str(job.id)
            )
            job.provider_task_id = task.provider_task_id
            db.commit()
        task = provider.get_task(job.provider_task_id)
    except ProviderTransientError as exc:
        raise TransientJobError(str(exc)) from exc
    except ProviderPermanentError as exc:
        raise PermanentJobError("PROVIDER_ERROR", str(exc)) from exc
    if task.status in {ProviderTaskStatus.PENDING, ProviderTaskStatus.RUNNING}:
        raise PendingJobError("Model generation is still running.")
    if task.status == ProviderTaskStatus.FAILED:
        raise PermanentJobError("GENERATION_FAILED", task.error_code or "Generation failed.")
    result = _store_output(
        db, job, asset, provider_name=provider.name, task=task, data=_fetch(provider, task)
    )
    lesson_id = job.input_snapshot.get("lesson_id")
    if lesson_id:
        result["scene_id"] = _save_into_lesson(db, job, asset, uuid.UUID(str(lesson_id)))
        result["lesson_id"] = str(lesson_id)
    return result


def asset_scene_spec(asset: ThreeDAsset, version: ThreeDAssetVersion) -> SceneSpec:
    """A scene showing every named part of a library model, with its descriptions
    (server-side twin of the frontend's specFromAsset)."""
    meta = version.metadata_json
    info = {p.get("name"): p for p in meta.get("parts", []) if isinstance(p, dict)}
    components, explanations, seen = [], {}, set()
    for mesh in meta.get("node_names", [])[:120]:
        cid = _ident(mesh, "part")
        while cid in seen:
            cid = f"{cid}_x"[:64]
        seen.add(cid)
        p = info.get(mesh, {})
        comp: dict[str, Any] = {
            "component_id": cid,
            "mesh_name": mesh,
            "label": (str(p.get("label") or "") or mesh.replace("_", " ")).strip()[:200],
            "actions": ["highlight", "show_explanation"],
        }
        text = str(p.get("description") or "").strip()
        if text:
            ref = f"exp_{cid}"[:64]
            explanations[ref] = text[:2000]
            comp["explanation_ref"] = ref
        components.append(comp)
    return SceneSpec.model_validate(
        {
            "schema_version": "1.0",
            "scene_id": f"lesson_{asset.slug}"[:64],
            "title": asset.name[:200],
            "asset_refs": [{"asset_id": asset.slug, "version": version.version_number}],
            "camera": {"preset": "three_quarter", "min_distance": 2, "max_distance": 12},
            "components": components,
            "controls": ["rotate", "zoom", "select_component"],
            "explanations": explanations,
        }
    )


def _save_into_lesson(
    db: Session, job: Job, asset: ThreeDAsset, lesson_id: uuid.UUID
) -> str | None:
    """Save the finished model into the lesson it was generated for, as a DRAFT scene.

    The teacher generated it for their own lesson, so the model is approved on their behalf;
    the part descriptions stay marked as AI drafts to review, and nothing is published."""
    lesson = db.get(Lesson, lesson_id)
    chapter = db.get(Chapter, lesson.chapter_id) if lesson else None
    course = db.get(Course, chapter.course_id) if chapter else None
    version = db.scalar(
        select(ThreeDAssetVersion).where(
            ThreeDAssetVersion.asset_id == asset.id,
            ThreeDAssetVersion.version_number == asset.latest_version,
        )
    )
    if lesson is None or course is None or version is None:
        return None
    try:
        asset.review_status = ReviewStatus.APPROVED
        asset.reviewed_by = job.requested_by
        asset.reviewed_at = datetime.now(UTC)
        scene = save_ai_scene(
            db,
            lesson,
            course,
            asset_scene_spec(asset, version),
            "Generated for this lesson in the Chapter Studio.",
            job.requested_by,
        )
        audit.record(
            db,
            action="asset.saved_into_lesson",
            resource_type="three_d_asset",
            resource_id=asset.id,
            actor_user_id=job.requested_by,
            metadata={"lesson_id": str(lesson.id), "scene_id": str(scene.id)},
        )
        db.commit()
        return str(scene.id)
    except Exception:  # the model is saved in the library either way
        db.rollback()
        log.warning(
            "could not add generated asset %s to lesson %s", asset.id, lesson_id, exc_info=True
        )
        return None


def _fetch(provider: Any, task: ThreeDTask) -> bytes:
    try:
        data: bytes = provider.fetch_output(task, get_settings().asset_max_bytes)
    except ProviderTransientError as exc:
        raise TransientJobError(str(exc)) from exc
    except ProviderPermanentError as exc:
        raise PermanentJobError("PROVIDER_ERROR", str(exc)) from exc
    return data


def _store_output(
    db: Session,
    job: Job,
    asset: ThreeDAsset,
    *,
    provider_name: str,
    task: ThreeDTask,
    data: bytes,
) -> dict[str, Any]:
    from app.integrations.storage import get_storage
    from app.modules.three_d.assets_service import GLB_MIME, InvalidAssetError, versions

    n = max((v.version_number for v in versions(db, asset.id)), default=0) + 1
    v = ThreeDAssetVersion(
        asset_id=asset.id,
        version_number=n,
        file_size_bytes=len(data),
        storage_key=f"assets/{asset.id}/v{n}/model.glb",
    )
    db.add(v)
    try:
        register_version_bytes(asset, v, data)
    except InvalidAssetError as exc:
        raise PermanentJobError("INVALID_MODEL", f"Provider output rejected: {exc}") from exc
    if task.part_metadata:  # labels/descriptions → explanations when a scene is created
        parts = [
            {**p, "source": "ai", "reviewed": False} if p.get("description") else dict(p)
            for p in task.part_metadata
        ]
        v.metadata_json = {**v.metadata_json, "parts": parts}
    get_storage().put_bytes(v.storage_key, data, GLB_MIME)
    # Every part should have a description for students: AI writes the missing ones as drafts
    # for the teacher to review in the 3D library (best effort; never fails the generation).
    from app.modules.ai_engine.part_descriptions import fill_missing_quietly

    fill_missing_quietly(db, asset, v, job)
    u = task.llm_usage  # LLM-backed providers report tokens; vendors report credits
    db.add(
        AIUsageRecord(
            job_id=job.id,
            course_id=None,
            provider=u.provider if u else provider_name,
            model=u.model if u else "3d",
            provider_request_id=(u.provider_request_id if u else None) or task.provider_task_id,
            input_tokens=u.input_tokens if u else 0,
            output_tokens=u.output_tokens if u else 0,
            credits_used=task.credits_used,
        )
    )
    audit.record(
        db,
        action="asset.generated",
        resource_type="three_d_asset",
        resource_id=asset.id,
        actor_user_id=job.requested_by,
        metadata={"provider": provider_name, "version": n},
    )
    db.commit()
    return {
        "asset_id": str(asset.id),
        "version": n,
        "review_status": asset.review_status,
        "node_names": v.metadata_json.get("node_names", []),
    }


def get_generation_asset(db: Session, user: User, asset_id: uuid.UUID) -> ThreeDAsset:
    asset = get_asset_for(db, user, asset_id, manage=True)
    if asset is None:
        raise NotFoundError()
    return asset


# ------------------------------------------------- 3D library "In progress" list
ACTIVE_STATUSES = ("queued", "processing", "retrying", "validating")


def list_generation_jobs(db: Session, user: User) -> list[dict[str, Any]]:
    """The teacher's 3D generations that are running, plus recent results: failures from the
    last 24 h (to retry) and models finished in the last 10 minutes (shown as "ready")."""
    now = datetime.now(UTC)
    jobs = db.scalars(
        select(Job)
        .where(
            Job.requested_by == user.id,
            Job.job_type == JobType.THREE_D_ASSET_GENERATION,
            Job.created_at >= now - timedelta(days=1),
        )
        .order_by(Job.created_at.desc())
        .limit(30)
    )
    out: list[dict[str, Any]] = []
    seen: set[uuid.UUID] = set()
    for j in jobs:  # newest first: only a model's latest attempt counts (a retry replaces it)
        if j.target_id in seen:
            continue
        seen.add(j.target_id)
        if (j.result or {}).get("dismissed"):
            continue
        recent_done = (
            j.status == "completed"
            and j.finished_at is not None
            and j.finished_at >= now - timedelta(minutes=10)
        )
        if j.status not in ACTIVE_STATUSES and j.status != "failed" and not recent_done:
            continue
        asset = db.get(ThreeDAsset, j.target_id)
        if asset is None:  # deleted from the library meanwhile
            continue
        snap = j.input_snapshot or {}
        out.append(
            {
                "job_id": j.id,
                "asset_id": asset.id,
                "asset_name": asset.name,
                "provider": snap.get("provider") or j.provider or get_settings().three_d_provider,
                "status": j.status,
                "error_message": j.error_message if j.status == "failed" else None,
                "created_at": j.created_at,
                "finished_at": j.finished_at,
                "prompt_preview": str(snap.get("prompt", ""))[:200],
                "has_model": asset.latest_version > 0,
                "lesson_id": snap.get("lesson_id"),
                "lesson_title": _lesson_title(db, snap.get("lesson_id")),
                "scene_id": (j.result or {}).get("scene_id"),
            }
        )
    return out


def dismiss_generation(db: Session, user: User, job_id: uuid.UUID) -> None:
    """Hide a finished/failed generation from "In progress". A failed build's empty library
    entry (no model file) is removed with it."""
    job = db.get(Job, job_id)
    if (
        job is None
        or job.requested_by != user.id
        or job.job_type != JobType.THREE_D_ASSET_GENERATION
    ):
        raise NotFoundError()
    if job.status in ACTIVE_STATUSES:
        raise ConflictError("This model is still being generated.")
    job.result = {**(job.result or {}), "dismissed": True}
    asset = db.get(ThreeDAsset, job.target_id)
    if asset is not None and asset.latest_version == 0 and asset.created_by == user.id:
        db.delete(asset)
    db.commit()


def _lesson_title(db: Session, lesson_id: Any) -> str | None:
    if not lesson_id:
        return None
    lesson = db.get(Lesson, uuid.UUID(str(lesson_id)))
    return lesson.title if lesson else None


def retry_generation(db: Session, user: User, asset_id: uuid.UUID) -> Job:
    """Run the last generation of this library entry again (same prompt and generator)."""
    asset = get_asset_for(db, user, asset_id, manage=True)
    if asset is None:
        raise NotFoundError()
    last = db.scalar(
        select(Job)
        .where(
            Job.job_type == JobType.THREE_D_ASSET_GENERATION,
            Job.target_id == asset.id,
            Job.requested_by == user.id,
        )
        .order_by(Job.created_at.desc())
        .limit(1)
    )
    if last is None:
        raise NotFoundError("This model was not generated, so there is nothing to retry.")
    if last.status in ACTIVE_STATUSES:
        raise ConflictError("This model is still being generated.")
    snap = last.input_snapshot or {}
    lesson = snap.get("lesson_id")
    return start_generation(
        db,
        user,
        asset,
        str(snap["prompt"]),
        snap.get("provider"),
        uuid.UUID(str(lesson)) if lesson else None,
    )
