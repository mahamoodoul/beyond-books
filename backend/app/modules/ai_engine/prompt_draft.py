"""3D library: the LLM turns a teacher's topic into an in-depth build brief for a 3D model.

The brief is returned to the teacher for review and editing; it is then sent to a 3D provider
(e.g. "blender") as the generation prompt. Nothing is generated or stored as an asset here.
"""

import re
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.integrations.interfaces import ProviderPermanentError, ProviderTransientError
from app.modules.ai_engine.llm import get_llm_provider
from app.modules.ai_engine.models import AIUsageRecord
from app.modules.ai_engine.prompts import THREE_D_PROMPT_DRAFT
from app.modules.ai_engine.schemas import PromptDraftLLM
from app.modules.operations import audit
from app.modules.operations.jobs import JobType
from app.modules.operations.models import Job
from app.modules.operations.runner import (
    PermanentJobError,
    TransientJobError,
    create_job,
    dispatch,
    handler,
)
from app.modules.three_d.models import ThreeDPromptDraft
from app.modules.users.models import User

MAX_PARTS = 40
_NAME = re.compile(r"[^a-z0-9_]+")


class PromptDraftBudgetError(AppError):
    status_code = 429
    code = "PROMPT_DRAFT_BUDGET_EXCEEDED"
    message = "Your daily limit for AI-written 3D prompts has been reached."


def _check_budget(db: Session, user: User) -> None:
    since = datetime.now(UTC) - timedelta(days=1)
    used = (
        db.scalar(
            select(func.count(Job.id)).where(
                Job.requested_by == user.id,
                Job.job_type == JobType.THREE_D_PROMPT_DRAFT,
                Job.created_at >= since,
            )
        )
        or 0
    )
    # Drafting is far cheaper than generating, so allow several drafts per generation.
    if used >= 4 * get_settings().three_d_max_generations_per_user_per_day:
        raise PromptDraftBudgetError()


def start_prompt_draft(
    db: Session,
    user: User,
    *,
    topic: str,
    subject: str | None,
    level: str | None,
    focus: str | None,
) -> Job:
    _check_budget(db, user)
    job = create_job(
        db,
        job_type=JobType.THREE_D_PROMPT_DRAFT,
        target_type="user",
        target_id=user.id,
        requested_by=user.id,
        input_snapshot={"topic": topic, "subject": subject, "level": level, "focus": focus},
    )
    audit.record(
        db,
        action="ai.three_d_prompt_draft.requested",
        resource_type="user",
        resource_id=user.id,
        actor_user_id=user.id,
    )
    db.commit()
    dispatch(job.id)
    db.refresh(job)
    return job


def _task(snapshot: dict[str, Any]) -> str:
    lines = [f"Topic: {snapshot['topic']}"]
    for key, label in (("subject", "Subject"), ("level", "Audience level"), ("focus", "Focus")):
        if snapshot.get(key):
            lines.append(f"{label}: {snapshot[key]}")
    return "\n".join(lines)


def clean_draft(out: PromptDraftLLM) -> dict[str, Any]:
    parts, seen = [], set()
    for p in out.parts[:MAX_PARTS]:
        name = _NAME.sub("_", p.name.strip().lower()).strip("_")[:40]
        if not name or name in seen:
            continue
        seen.add(name)
        parts.append(
            {
                "name": name,
                "label": (p.label.strip() or name.replace("_", " "))[:200],
                "description": p.description.strip()[:1000],
            }
        )
    prompt = out.prompt.strip()
    if len(prompt) < 20:
        raise PermanentJobError("EMPTY_OUTPUT", "The AI did not write a usable prompt.")
    return {"title": out.title.strip()[:200] or "3D model", "prompt": prompt[:8000], "parts": parts}


@handler(JobType.THREE_D_PROMPT_DRAFT)
def draft_prompt(db: Session, job: Job) -> dict[str, Any]:
    provider = get_llm_provider()
    job.provider = provider.name
    try:
        result = provider.generate_structured(
            system_prompt=THREE_D_PROMPT_DRAFT.system,
            task=_task(job.input_snapshot),
            references=[],
            output_schema=PromptDraftLLM,
            prompt_version=THREE_D_PROMPT_DRAFT.ref,
            max_output_tokens=get_settings().llm_max_output_tokens,
        )
    except ProviderTransientError as exc:
        raise TransientJobError(str(exc)) from exc
    except ProviderPermanentError as exc:
        raise PermanentJobError("PROVIDER_ERROR", str(exc)) from exc
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
    draft = clean_draft(result.output)
    snap = job.input_snapshot
    saved = ThreeDPromptDraft(  # saved so the teacher can reuse and edit it later
        user_id=job.requested_by,
        topic=str(snap["topic"])[:200],
        subject=snap.get("subject"),
        level=snap.get("level"),
        focus=snap.get("focus"),
        title=draft["title"],
        prompt=draft["prompt"],
        parts=draft["parts"],
    )
    db.add(saved)
    db.flush()
    return {**draft, "draft_id": str(saved.id), "prompt_version": THREE_D_PROMPT_DRAFT.ref}


# ------------------------------------------------------------ saved prompt drafts
def list_drafts(db: Session, user: User, topic: str | None) -> list[ThreeDPromptDraft]:
    q = select(ThreeDPromptDraft).where(ThreeDPromptDraft.user_id == user.id)
    if topic and topic.strip():
        q = q.where(func.lower(ThreeDPromptDraft.topic).contains(topic.strip().lower()))
    return list(db.scalars(q.order_by(ThreeDPromptDraft.updated_at.desc()).limit(50)))


def _own(db: Session, user: User, draft_id: uuid.UUID) -> ThreeDPromptDraft:
    from app.core.errors import NotFoundError

    d = db.get(ThreeDPromptDraft, draft_id)
    if d is None or d.user_id != user.id:
        raise NotFoundError()
    return d


def update_draft(
    db: Session, user: User, draft_id: uuid.UUID, *, title: str | None, prompt: str | None
) -> ThreeDPromptDraft:
    d = _own(db, user, draft_id)
    if title is not None and title.strip():
        d.title = title.strip()[:200]
    if prompt is not None and prompt.strip():
        d.prompt = prompt.strip()[:8000]
    d.edited = True
    db.commit()
    return d


def delete_draft(db: Session, user: User, draft_id: uuid.UUID) -> None:
    db.delete(_own(db, user, draft_id))
    db.commit()
