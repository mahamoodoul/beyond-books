"""AI job handlers (ADR 0007: plain orchestration, no LangGraph yet).

Each handler: load inputs → retrieve passages → call LLMProvider → validate/convert →
persist as DRAFT (never published) → record output version + usage.
"""

import uuid
from typing import Any

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.integrations.interfaces import (
    LLMUsage,
    ProviderPermanentError,
    ProviderTransientError,
    ReferencePassage,
)
from app.modules.ai_engine import retrieval
from app.modules.ai_engine.llm import get_llm_provider
from app.modules.ai_engine.models import AIOutputVersion, AIUsageRecord
from app.modules.ai_engine.prompts import (
    DOCUMENT_ANALYSIS,
    LESSON_GENERATION,
    SECTION_REGENERATION,
    PromptTemplate,
)
from app.modules.ai_engine.schemas import LessonLLM, OutlineLLM, SectionLLM
from app.modules.ai_engine.validation import (
    OutputRejectedError,
    convert_lesson,
    convert_outline,
    convert_section,
)
from app.modules.chapters.models import Chapter, LearningObjective
from app.modules.documents.models import DocumentStatus, SourceDocument
from app.modules.lessons.content import LessonContent
from app.modules.lessons.models import Lesson
from app.modules.lessons.schemas import LessonCreate
from app.modules.lessons.service import create_lesson, save_new_version
from app.modules.operations import audit
from app.modules.operations.jobs import JobType
from app.modules.operations.models import Job
from app.modules.operations.runner import PermanentJobError, TransientJobError, handler


def _call[T: BaseModel](
    db: Session,
    job: Job,
    prompt: PromptTemplate,
    task: str,
    passages: list[ReferencePassage],
    schema: type[T],
) -> tuple[T, LLMUsage]:
    if not passages:
        raise PermanentJobError(
            "NO_SOURCES", "No extracted source text is available for this task."
        )
    provider = get_llm_provider()
    job.provider = provider.name
    try:
        result = provider.generate_structured(
            system_prompt=prompt.system,
            task=task,
            references=passages,
            output_schema=schema,
            prompt_version=prompt.ref,
            max_output_tokens=get_settings().llm_max_output_tokens,
        )
    except ProviderTransientError as exc:
        raise TransientJobError(str(exc)) from exc
    except ProviderPermanentError as exc:
        raise PermanentJobError("PROVIDER_ERROR", str(exc)) from exc
    job.provider_task_id = result.usage.provider_request_id
    return result.output, result.usage


def _record(
    db: Session,
    job: Job,
    usage: LLMUsage,
    prompt: PromptTemplate,
    *,
    kind: str,
    target_type: str,
    target_id: uuid.UUID,
    output: dict[str, Any],
    validation: dict[str, Any],
    status: str,
) -> AIOutputVersion:
    s = get_settings()
    cost = None
    if s.llm_input_price_per_mtok or s.llm_output_price_per_mtok:
        cost = (
            usage.input_tokens * s.llm_input_price_per_mtok
            + usage.output_tokens * s.llm_output_price_per_mtok
        ) / 1_000_000
    db.add(
        AIUsageRecord(
            job_id=job.id,
            course_id=job.course_id,
            provider=usage.provider,
            model=usage.model,
            provider_request_id=usage.provider_request_id,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            estimated_cost=cost,
            currency="USD" if cost else None,
        )
    )
    assert job.course_id is not None
    version = AIOutputVersion(
        job_id=job.id,
        course_id=job.course_id,
        kind=kind,
        target_type=target_type,
        target_id=target_id,
        prompt_id=prompt.id,
        prompt_version=prompt.version,
        provider=usage.provider,
        model=usage.model,
        output=output,
        validation=validation,
        status=status,
        created_by=job.requested_by,
    )
    db.add(version)
    audit.record(
        db,
        action=f"ai.{kind}.generated",
        resource_type=target_type,
        resource_id=target_id,
        actor_user_id=job.requested_by,
        metadata={"job_id": str(job.id), "prompt": prompt.ref, "model": usage.model},
    )
    return version


def _rejected(exc: OutputRejectedError) -> PermanentJobError:
    return PermanentJobError(exc.code, str(exc))


@handler(JobType.OUTLINE_GENERATION)
def generate_outline(db: Session, job: Job) -> dict[str, Any]:
    assert job.course_id is not None
    found = retrieval.for_outline(db, job.course_id)
    task = "Propose a chapter outline for this course from the reference excerpts."
    if found.truncated:
        task += " Only the beginning of long documents is included; outline what is provided."
    out, usage = _call(db, job, DOCUMENT_ANALYSIS, task, found.passages, OutlineLLM)
    page_counts = {
        str(d.id): d.page_count or 0
        for d in db.scalars(
            select(SourceDocument).where(
                SourceDocument.course_id == job.course_id,
                SourceDocument.processing_status == DocumentStatus.READY,
            )
        )
    }
    try:
        proposal, report = convert_outline(out, found.passages, page_counts)
    except OutputRejectedError as exc:
        raise _rejected(exc) from exc
    if found.truncated:
        report.warnings.append("Long documents were truncated; later pages were not analysed.")
    version = _record(
        db,
        job,
        usage,
        DOCUMENT_ANALYSIS,
        kind="outline",
        target_type="course",
        target_id=job.course_id,
        output=proposal,
        validation=report.as_dict(),
        status="proposed",
    )
    db.commit()
    return {
        "proposal_id": str(version.id),
        "chapters": len(proposal["chapters"]),
        **report.as_dict(),
    }


def _chapter_task(db: Session, chapter: Chapter) -> str:
    objectives = list(
        db.scalars(
            select(LearningObjective.objective_text)
            .where(LearningObjective.chapter_id == chapter.id)
            .order_by(LearningObjective.position)
        )
    )
    lines = [f"Chapter: {chapter.title}"]
    if chapter.description:
        lines.append(f"Description: {chapter.description}")
    if objectives:
        lines.append("Learning objectives:\n" + "\n".join(f"- {o}" for o in objectives))
    return "\n".join(lines)


@handler(JobType.LESSON_GENERATION)
def generate_lesson(db: Session, job: Job) -> dict[str, Any]:
    chapter = db.get(Chapter, job.target_id)
    if chapter is None:
        raise PermanentJobError("CHAPTER_MISSING", "The chapter no longer exists.")
    found = retrieval.for_chapter(db, chapter)
    out, usage = _call(
        db, job, LESSON_GENERATION, _chapter_task(db, chapter), found.passages, LessonLLM
    )
    try:
        title, content, report = convert_lesson(out, found.passages)
    except OutputRejectedError as exc:
        raise _rejected(exc) from exc
    lesson = create_lesson(
        db,
        None,
        chapter.id,
        LessonCreate(title=title, content=content),
        origin="ai",
        chapter_course_id=chapter.course_id,
    )
    _record(
        db,
        job,
        usage,
        LESSON_GENERATION,
        kind="lesson",
        target_type="lesson",
        target_id=lesson.id,
        output=content.model_dump(mode="json"),
        validation={**report.as_dict(), "retrieval": found.strategy},
        status="applied",
    )
    db.commit()
    return {"lesson_id": str(lesson.id), "retrieval": found.strategy, **report.as_dict()}


@handler(JobType.SECTION_REGENERATION)
def regenerate_section(db: Session, job: Job) -> dict[str, Any]:
    lesson = db.get(Lesson, job.target_id)
    if lesson is None:
        raise PermanentJobError("LESSON_MISSING", "The lesson no longer exists.")
    base_version = int(job.input_snapshot["base_version"])
    index = int(job.input_snapshot["section_index"])
    if lesson.version != base_version:
        raise PermanentJobError(
            "LESSON_CHANGED", "The lesson was edited; request regeneration again."
        )
    content = LessonContent.model_validate(lesson.content_json)
    if not 0 <= index < len(content.sections):
        raise PermanentJobError("SECTION_MISSING", "That section no longer exists.")
    chapter = db.get(Chapter, lesson.chapter_id)
    assert chapter is not None
    current = content.sections[index]
    task = "\n".join(
        [
            _chapter_task(db, chapter),
            f"Lesson: {lesson.title}",
            f"Section to rewrite: {current.title}",
            f"Current text:\n{current.body_markdown}",
        ]
    )
    instruction = job.input_snapshot.get("instruction")
    if instruction:
        task += f"\n\nTeacher instruction: {instruction}"
    found = retrieval.for_chapter(db, chapter)
    out, usage = _call(db, job, SECTION_REGENERATION, task, found.passages, SectionLLM)
    try:
        section, report = convert_section(out, found.passages)
    except OutputRejectedError as exc:
        raise _rejected(exc) from exc
    sections = list(content.sections)
    sections[index] = section
    save_new_version(
        db,
        lesson,
        title=None,
        content=content.model_copy(update={"sections": sections}),
        user_id=job.requested_by,
        change_source="ai_section",
    )
    _record(
        db,
        job,
        usage,
        SECTION_REGENERATION,
        kind="section",
        target_type="lesson",
        target_id=lesson.id,
        output=section.model_dump(mode="json"),
        validation=report.as_dict(),
        status="applied",
    )
    db.commit()
    return {"lesson_id": str(lesson.id), "version": lesson.version, **report.as_dict()}
