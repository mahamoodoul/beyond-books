"""Lesson reader "Explain with AI": a student selects 1-3 words, the AI explains them in the
context of the sentence, and a few openly licensed images (Wikimedia Commons) are found.

The sentence is looked up in the lesson the student may read (never taken from the client), so
the AI only ever sees lesson text. Answers are reused for the same words in the same lesson, and
new ones count towards a daily per-user limit.
"""

import re
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError, NotFoundError
from app.integrations.images import search_images
from app.integrations.interfaces import ProviderPermanentError, ProviderTransientError
from app.modules.ai_engine.llm import get_llm_provider
from app.modules.ai_engine.models import AIUsageRecord
from app.modules.ai_engine.prompts import SELECTION_EXPLAIN
from app.modules.ai_engine.schemas import SelectionExplainLLM
from app.modules.operations.jobs import JobStatus, JobType
from app.modules.operations.models import Job
from app.modules.operations.runner import (
    PermanentJobError,
    TransientJobError,
    create_job,
    dispatch,
    handler,
)
from app.modules.users.models import User

MAX_WORDS = 3
MAX_CHARS = 60
MAX_PER_USER_PER_DAY = 40
CACHE_DAYS = 30


class InvalidSelectionError(AppError):
    status_code = 422
    code = "INVALID_SELECTION"
    message = "Select 1 to 3 words from the lesson."


class SelectionBudgetError(AppError):
    status_code = 429
    code = "EXPLAIN_SELECTION_BUDGET_EXCEEDED"
    message = "You have reached today's limit for AI explanations. Try again tomorrow."


def _norm(text: str) -> str:
    text = re.sub(r"^\s*([-*+]|\d+[.)])\s+", "", text, flags=re.M)  # list markers
    return re.sub(r"\s+", " ", re.sub(r"[*_`#>\[\]()]", "", text)).strip()


def _find_context(content: dict[str, Any], words: str) -> tuple[str, str] | None:
    """(section title, sentence) in the lesson that contains the selected words."""
    needle = words.lower()
    for section in content.get("sections") or []:
        for line in str(section.get("body_markdown", "")).splitlines():
            for sentence in re.split(r"(?<=[.!?])\s+", _norm(line)):
                if needle in sentence.lower():
                    return str(section.get("title", "")), sentence[:600]
        if needle in str(section.get("title", "")).lower():
            return str(section.get("title", "")), str(section.get("title", ""))
    for point in content.get("summary") or []:
        if needle in _norm(str(point)).lower():
            return "Summary", _norm(str(point))[:600]
    return None


def start_selection_explain(db: Session, user: User, lesson_id: uuid.UUID, text: str) -> Job:
    from app.modules.lessons.service import get_lesson

    words = _norm(text)
    if not words or len(words) > MAX_CHARS or len(words.split()) > MAX_WORDS:
        raise InvalidSelectionError()
    lesson = get_lesson(db, user, lesson_id)  # 404 unless this user may read the lesson
    found = _find_context(lesson.content.model_dump(), words)
    if found is None:
        raise NotFoundError("Select words from this lesson's text.")
    section, sentence = found
    key = words.lower()

    # Same words in the same lesson explained recently: reuse it (free, instant).
    since_cache = datetime.now(UTC) - timedelta(days=CACHE_DAYS)
    cached = db.scalars(
        select(Job)
        .where(
            Job.job_type == JobType.SELECTION_EXPLAIN,
            Job.target_id == lesson_id,
            Job.status == JobStatus.COMPLETED,
            Job.created_at >= since_cache,
        )
        .order_by(Job.created_at.desc())
        .limit(200)
    )
    for job in cached:
        if (job.input_snapshot or {}).get("key") == key and job.result:
            return job

    since = datetime.now(UTC) - timedelta(days=1)
    used = (
        db.scalar(
            select(func.count(Job.id)).where(
                Job.requested_by == user.id,
                Job.job_type == JobType.SELECTION_EXPLAIN,
                Job.created_at >= since,
            )
        )
        or 0
    )
    if used >= MAX_PER_USER_PER_DAY:
        raise SelectionBudgetError()
    job = create_job(
        db,
        job_type=JobType.SELECTION_EXPLAIN,
        target_type="lesson",
        target_id=lesson_id,
        requested_by=user.id,
        input_snapshot={
            "key": key,
            "words": words,
            "lesson_title": lesson.title,
            "section": section,
            "sentence": sentence,
        },
    )
    db.commit()
    dispatch(job.id)
    db.refresh(job)
    return job


def _clip(text: str, limit: int = 1200) -> str:
    return text.strip()[:limit]


@handler(JobType.SELECTION_EXPLAIN)
def explain_selection(db: Session, job: Job) -> dict[str, Any]:
    snap = job.input_snapshot or {}
    words = str(snap.get("words", ""))
    task = "\n".join(
        [
            f"Lesson: {snap.get('lesson_title', '')}",
            f"Section: {snap.get('section', '')}",
            f"Sentence: {snap.get('sentence', '')}",
            f"Selected words: {words}",
        ]
    )
    provider = get_llm_provider()
    job.provider = provider.name
    try:
        result = provider.generate_structured(
            system_prompt=SELECTION_EXPLAIN.system,
            task=task,
            references=[],
            output_schema=SelectionExplainLLM,
            prompt_version=SELECTION_EXPLAIN.ref,
            max_output_tokens=min(4000, get_settings().llm_max_output_tokens),
        )
    except ProviderTransientError as exc:
        raise TransientJobError(str(exc)) from exc
    except ProviderPermanentError as exc:
        raise PermanentJobError("PROVIDER_ERROR", str(exc)) from exc
    out = result.output
    card: dict[str, Any] = {
        "title": _clip(out.title, 120) or words,
        "explanation": _clip(out.explanation),
        "in_this_lesson": _clip(out.in_this_lesson, 600),
        "key_points": [_clip(p, 300) for p in out.key_points if p.strip()][:4],
        "analogy": _clip(out.analogy, 400),
        "image_query": _clip(out.image_query, 80) or words,
    }
    if not card["explanation"]:
        raise PermanentJobError("EMPTY_OUTPUT", "The AI did not write a usable explanation.")
    images = search_images(str(card["image_query"])) or search_images(words)
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
    return {
        "words": words,
        "sentence": snap.get("sentence", ""),
        "card": card,
        "images": images,
        "prompt_version": SELECTION_EXPLAIN.ref,
    }
