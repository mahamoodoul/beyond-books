"""3D viewer: an in-depth AI study card for one part of a 3D-library model.

Cards are cached in the asset version's metadata (`insights[part]`), so each part is explained
once per model version: later views (and other teachers who can see the model) get it instantly.
"""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError, NotFoundError
from app.integrations.interfaces import ProviderPermanentError, ProviderTransientError
from app.modules.ai_engine.llm import get_llm_provider
from app.modules.ai_engine.models import AIUsageRecord
from app.modules.ai_engine.prompts import PART_DEEP_DIVE
from app.modules.ai_engine.schemas import PartDeepDiveLLM
from app.modules.operations.jobs import JobType
from app.modules.operations.models import Job
from app.modules.operations.runner import (
    PermanentJobError,
    TransientJobError,
    create_job,
    dispatch,
    handler,
)
from app.modules.three_d.models import ThreeDAsset, ThreeDAssetVersion
from app.modules.users.models import User

TEXT_LIMIT = 1500


class DeepDiveBudgetError(AppError):
    status_code = 429
    code = "DEEP_DIVE_BUDGET_EXCEEDED"
    message = "Your daily limit for in-depth part explanations has been reached."


def _latest(db: Session, asset: ThreeDAsset) -> ThreeDAssetVersion:
    v = db.scalar(
        select(ThreeDAssetVersion).where(
            ThreeDAssetVersion.asset_id == asset.id,
            ThreeDAssetVersion.version_number == asset.latest_version,
        )
    )
    if v is None:
        raise NotFoundError("This model has no file yet.")
    return v


def _check_budget(db: Session, user: User) -> None:
    since = datetime.now(UTC) - timedelta(days=1)
    used = (
        db.scalar(
            select(func.count(Job.id)).where(
                Job.requested_by == user.id,
                Job.job_type == JobType.PART_DEEP_DIVE,
                Job.created_at >= since,
            )
        )
        or 0
    )
    if used >= 10 * get_settings().three_d_max_generations_per_user_per_day:
        raise DeepDiveBudgetError()


def start_deep_dive(db: Session, user: User, asset_id: uuid.UUID, part: str) -> Job:
    from app.modules.three_d.assets_service import get_asset_for

    asset = get_asset_for(db, user, asset_id, manage=False)
    version = _latest(db, asset)
    if part not in version.metadata_json.get("node_names", []):
        raise NotFoundError("That part is not in this model.")
    cached = (version.metadata_json.get("insights") or {}).get(part)
    if not cached:
        _check_budget(db, user)  # cached cards are free and never count
    job = create_job(
        db,
        job_type=JobType.PART_DEEP_DIVE,
        target_type="three_d_asset",
        target_id=asset.id,
        requested_by=user.id,
        input_snapshot={"part": part, "version": version.version_number},
    )
    db.commit()
    dispatch(job.id)
    db.refresh(job)
    return job


def _clip(text: str) -> str:
    return text.strip()[:TEXT_LIMIT]


def clean_card(out: PartDeepDiveLLM, parts: set[str], part: str) -> dict[str, Any]:
    connections = [
        {"part": c.part.strip(), "relationship": _clip(c.relationship)}
        for c in out.connections
        if c.part.strip() in parts and c.part.strip() != part and c.relationship.strip()
    ][:4]
    card = {
        "summary": _clip(out.summary),
        "structure": _clip(out.structure),
        "function": _clip(out.function),
        "connections": connections,
        "analogy": _clip(out.analogy),
        "misconception": _clip(out.misconception),
        "fact": _clip(out.fact),
        "check_question": _clip(out.check_question),
        "check_answer": _clip(out.check_answer),
    }
    if not card["summary"] or not card["function"]:
        raise PermanentJobError("EMPTY_OUTPUT", "The AI did not write a usable explanation.")
    return card


def _task(asset: ThreeDAsset, version: ThreeDAssetVersion, part: str) -> str:
    meta = version.metadata_json
    labels = {p.get("name"): p for p in meta.get("parts", []) if isinstance(p, dict)}
    info = labels.get(part, {})
    others = [n for n in meta.get("node_names", []) if n != part]
    return "\n".join(
        [
            f"Model: {asset.name}",
            f"Build brief (context): {asset.description[:3000]}",
            f"Selected part: {part}",
            f"Label: {info.get('label') or part.replace('_', ' ')}",
            f"Short description: {info.get('description') or '-'}",
            f"Other parts: {', '.join(others[:80])}",
        ]
    )


@handler(JobType.PART_DEEP_DIVE)
def deep_dive(db: Session, job: Job) -> dict[str, Any]:
    asset = db.get(ThreeDAsset, job.target_id)
    if asset is None:
        raise PermanentJobError("ASSET_MISSING", "The model no longer exists.")
    part = str(job.input_snapshot["part"])
    version = _latest(db, asset)
    meta = dict(version.metadata_json)
    insights: dict[str, Any] = dict(meta.get("insights") or {})
    if part in insights:
        return {"part": part, "card": insights[part], "cached": True}

    provider = get_llm_provider()
    job.provider = provider.name
    try:
        result = provider.generate_structured(
            system_prompt=PART_DEEP_DIVE.system,
            task=_task(asset, version, part),
            references=[],
            output_schema=PartDeepDiveLLM,
            prompt_version=PART_DEEP_DIVE.ref,
            max_output_tokens=get_settings().llm_max_output_tokens,
        )
    except ProviderTransientError as exc:
        raise TransientJobError(str(exc)) from exc
    except ProviderPermanentError as exc:
        raise PermanentJobError("PROVIDER_ERROR", str(exc)) from exc
    card = clean_card(result.output, set(meta.get("node_names", [])), part)
    card["prompt_version"] = PART_DEEP_DIVE.ref
    insights[part] = card
    version.metadata_json = {**meta, "insights": insights}  # reassign: JSON column change
    u = result.usage
    job.provider_task_id = u.provider_request_id
    db.add(
        AIUsageRecord(
            job_id=job.id,
            course_id=None,
            provider=u.provider,
            model=u.model,
            provider_request_id=u.provider_request_id,
            input_tokens=u.input_tokens,
            output_tokens=u.output_tokens,
        )
    )
    return {"part": part, "card": card, "cached": False}


# ------------------------------------------------------------------ guided tour
def start_tour(db: Session, user: User, asset_id: uuid.UUID) -> Job:
    """Guided-tour narration for the whole model (cached in `tour` like the part cards)."""
    from app.modules.three_d.assets_service import get_asset_for

    asset = get_asset_for(db, user, asset_id, manage=False)
    version = _latest(db, asset)
    if not version.metadata_json.get("node_names"):
        raise NotFoundError("This model has no parts.")
    if not version.metadata_json.get("tour"):
        _check_budget(db, user)
    job = create_job(
        db,
        job_type=JobType.MODEL_TOUR,
        target_type="three_d_asset",
        target_id=asset.id,
        requested_by=user.id,
        input_snapshot={"version": version.version_number},
    )
    db.commit()
    dispatch(job.id)
    db.refresh(job)
    return job


def _tour_task(asset: ThreeDAsset, version: ThreeDAssetVersion) -> str:
    meta = version.metadata_json
    info = {p.get("name"): p for p in meta.get("parts", []) if isinstance(p, dict)}
    lines = [
        f"Main topic (model): {asset.name}",
        f"Build brief (context): {asset.description[:3000]}",
        "Parts:",
    ]
    for n in meta.get("node_names", [])[:120]:
        p = info.get(n, {})
        lines.append(
            f"- {n} ({p.get('label') or n.replace('_', ' ')}): {p.get('description') or '-'}"
        )
    return "\n".join(lines)


def clean_tour(out: Any, parts: list[str]) -> dict[str, Any]:
    """Keep real parts once each in the AI's order; parts it skipped are appended at the end."""
    steps, seen = [], set()
    for s in out.steps:
        name = s.part.strip()
        if name in parts and name not in seen and s.connection.strip():
            seen.add(name)
            steps.append({"part": name, "connection": _clip(s.connection)})
    steps += [{"part": n, "connection": ""} for n in parts if n not in seen]
    if not out.intro.strip() and not any(s["connection"] for s in steps):
        raise PermanentJobError("EMPTY_OUTPUT", "The AI did not write a usable tour.")
    return {"intro": _clip(out.intro), "steps": steps}


@handler(JobType.MODEL_TOUR)
def model_tour(db: Session, job: Job) -> dict[str, Any]:
    from app.modules.ai_engine.prompts import MODEL_TOUR
    from app.modules.ai_engine.schemas import ModelTourLLM

    asset = db.get(ThreeDAsset, job.target_id)
    if asset is None:
        raise PermanentJobError("ASSET_MISSING", "The model no longer exists.")
    version = _latest(db, asset)
    meta = dict(version.metadata_json)
    if meta.get("tour"):
        return {"tour": meta["tour"], "cached": True}
    provider = get_llm_provider()
    job.provider = provider.name
    try:
        result = provider.generate_structured(
            system_prompt=MODEL_TOUR.system,
            task=_tour_task(asset, version),
            references=[],
            output_schema=ModelTourLLM,
            prompt_version=MODEL_TOUR.ref,
            max_output_tokens=get_settings().llm_max_output_tokens,
        )
    except ProviderTransientError as exc:
        raise TransientJobError(str(exc)) from exc
    except ProviderPermanentError as exc:
        raise PermanentJobError("PROVIDER_ERROR", str(exc)) from exc
    tour = clean_tour(result.output, list(meta.get("node_names", [])))
    tour["prompt_version"] = MODEL_TOUR.ref
    version.metadata_json = {**meta, "tour": tour}  # reassign: JSON column change
    u = result.usage
    job.provider_task_id = u.provider_request_id
    db.add(
        AIUsageRecord(
            job_id=job.id,
            course_id=None,
            provider=u.provider,
            model=u.model,
            provider_request_id=u.provider_request_id,
            input_tokens=u.input_tokens,
            output_tokens=u.output_tokens,
        )
    )
    return {"tour": tour, "cached": False}
