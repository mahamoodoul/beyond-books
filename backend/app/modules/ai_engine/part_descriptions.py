"""3D library: AI writes the missing student-facing descriptions of a model's parts.

Runs automatically after a model is generated or uploaded, and on demand ("Write missing with
AI"). AI-written texts are stored with `source: "ai", reviewed: false`, shown to the teacher as
drafts in the 3D library, and marked reviewed when the teacher edits them or approves the model.
"""

import logging
import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.integrations.interfaces import (
    LLMUsage,
    ProviderPermanentError,
    ProviderTransientError,
)
from app.modules.ai_engine.llm import get_llm_provider
from app.modules.ai_engine.models import AIUsageRecord
from app.modules.ai_engine.prompts import PART_DESCRIPTIONS
from app.modules.ai_engine.schemas import PartDescriptionsLLM
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

log = logging.getLogger(__name__)
MAX_PARTS = 120


def missing_parts(meta: dict[str, Any]) -> list[str]:
    described = {
        p.get("name")
        for p in meta.get("parts", [])
        if isinstance(p, dict) and str(p.get("description") or "").strip()
    }
    return [n for n in meta.get("node_names", [])[:MAX_PARTS] if n not in described]


def _task(asset: ThreeDAsset, meta: dict[str, Any], missing: list[str]) -> str:
    info = {p.get("name"): p for p in meta.get("parts", []) if isinstance(p, dict)}
    lines = [
        f"Model: {asset.name}",
        f"Build brief (context): {asset.description[:3000]}",
        "All parts:",
    ]
    for n in meta.get("node_names", [])[:MAX_PARTS]:
        p = info.get(n, {})
        lines.append(
            f"- {n} ({p.get('label') or n.replace('_', ' ')}): {p.get('description') or '-'}"
        )
    lines.append(f"Needs a description: {', '.join(missing)}")
    return "\n".join(lines)


def merge_descriptions(
    meta: dict[str, Any], out: PartDescriptionsLLM, missing: list[str]
) -> tuple[list[dict[str, Any]], int]:
    """Fill only parts that are still missing a description; never overwrite teacher text."""
    wanted = set(missing)
    parts = [dict(p) for p in meta.get("parts", []) if isinstance(p, dict)]
    by_name = {p.get("name"): p for p in parts}
    written = 0
    for d in out.parts:
        name, text = d.name.strip(), d.description.strip()[:2000]
        if name not in wanted or not text:
            continue
        entry = by_name.get(name)
        if entry is None:
            entry = {"name": name, "label": name.replace("_", " ")}
            parts.append(entry)
            by_name[name] = entry
        if not str(entry.get("label") or "").strip():
            entry["label"] = d.label.strip()[:200] or name.replace("_", " ")
        entry.update(description=text, source="ai", reviewed=False)
        wanted.discard(name)
        written += 1
    return parts, written


def fill_missing(db: Session, asset: ThreeDAsset, version: ThreeDAssetVersion, job: Job) -> int:
    """Write descriptions for undescribed parts of `version`; records usage on `job`."""
    meta = dict(version.metadata_json)
    missing = missing_parts(meta)
    if not missing:
        return 0
    provider = get_llm_provider()
    result = provider.generate_structured(
        system_prompt=PART_DESCRIPTIONS.system,
        task=_task(asset, meta, missing),
        references=[],
        output_schema=PartDescriptionsLLM,
        prompt_version=PART_DESCRIPTIONS.ref,
        max_output_tokens=get_settings().llm_max_output_tokens,
    )
    parts, written = merge_descriptions(meta, result.output, missing)
    version.metadata_json = {**meta, "parts": parts}  # reassign: JSON column change
    _usage(db, job, result.usage)
    return written


def _usage(db: Session, job: Job, u: LLMUsage) -> None:
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


def fill_missing_quietly(
    db: Session, asset: ThreeDAsset, version: ThreeDAssetVersion, job: Job
) -> None:
    """After a model is generated: best effort, never fails the generation itself."""
    try:
        fill_missing(db, asset, version, job)
    except Exception:  # noqa: BLE001 - descriptions can be written later from the library
        log.warning("could not write part descriptions for asset %s", asset.id, exc_info=True)


def start_part_descriptions(db: Session, user: User, asset_id: uuid.UUID) -> Job:
    from app.modules.three_d.assets_service import get_asset_for

    asset = get_asset_for(db, user, asset_id, manage=True)
    job = create_job(
        db,
        job_type=JobType.PART_DESCRIPTIONS,
        target_type="three_d_asset",
        target_id=asset.id,
        requested_by=user.id,
        input_snapshot={"version": asset.latest_version},
    )
    db.commit()
    dispatch(job.id)
    db.refresh(job)
    return job


@handler(JobType.PART_DESCRIPTIONS)
def write_part_descriptions(db: Session, job: Job) -> dict[str, Any]:
    from app.modules.ai_engine.part_deep_dive import _latest

    asset = db.get(ThreeDAsset, job.target_id)
    if asset is None:
        raise PermanentJobError("ASSET_MISSING", "The model no longer exists.")
    version = _latest(db, asset)
    job.provider = get_llm_provider().name
    try:
        written = fill_missing(db, asset, version, job)
    except ProviderTransientError as exc:
        raise TransientJobError(str(exc)) from exc
    except ProviderPermanentError as exc:
        raise PermanentJobError("PROVIDER_ERROR", str(exc)) from exc
    return {"written": written, "missing": len(missing_parts(version.metadata_json))}
