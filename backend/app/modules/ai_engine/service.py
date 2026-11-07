import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError, ConflictError, NotFoundError
from app.modules.ai_engine.models import AIOutputVersion, AIUsageRecord
from app.modules.chapters.models import Chapter, LearningObjective
from app.modules.chapters.schemas import ChapterSourceRef
from app.modules.chapters.service import check_doc_refs, get_chapter_for
from app.modules.courses.access import get_course_for
from app.modules.courses.models import Course
from app.modules.documents.models import DocumentStatus, SourceDocument
from app.modules.lessons.content import LessonContent
from app.modules.lessons.models import Lesson
from app.modules.operations import audit
from app.modules.operations.jobs import JobType
from app.modules.operations.models import Job
from app.modules.operations.runner import create_job, dispatch
from app.modules.users.models import User

AI_JOB_TYPES = (
    JobType.OUTLINE_GENERATION,
    JobType.LESSON_GENERATION,
    JobType.SECTION_REGENERATION,
    JobType.SCENE_PLANNING,
    JobType.ASSESSMENT_GENERATION,
    JobType.ANIMATION_PLANNING,
    JobType.PART_INSIGHT,
    JobType.CHAPTER_SPLIT,
)


class AIBudgetExceededError(AppError):
    status_code = 429
    code = "AI_BUDGET_EXCEEDED"
    message = "The daily AI generation limit for this course has been reached."


class NoSourcesError(AppError):
    status_code = 422
    code = "NO_SOURCES"
    message = "Upload at least one source document and wait for extraction to finish."


def _check_budget(db: Session, course_id: uuid.UUID) -> None:
    since = datetime.now(UTC) - timedelta(days=1)
    count = (
        db.scalar(
            select(func.count(Job.id)).where(
                Job.course_id == course_id, Job.job_type.in_(AI_JOB_TYPES), Job.created_at >= since
            )
        )
        or 0
    )
    if count >= get_settings().ai_max_jobs_per_course_per_day:
        raise AIBudgetExceededError()


def _has_ready_sources(db: Session, course_id: uuid.UUID) -> bool:
    return (
        db.scalar(
            select(SourceDocument.id)
            .where(
                SourceDocument.course_id == course_id,
                SourceDocument.processing_status == DocumentStatus.READY,
            )
            .limit(1)
        )
        is not None
    )


def _start(
    db: Session,
    user: User,
    course: Course,
    job_type: JobType,
    target_type: str,
    target_id: uuid.UUID,
    snapshot: dict[str, Any] | None = None,
) -> Job:
    _check_budget(db, course.id)
    if not _has_ready_sources(db, course.id):
        raise NoSourcesError()
    job = create_job(
        db,
        job_type=job_type,
        target_type=target_type,
        target_id=target_id,
        requested_by=user.id,
        course_id=course.id,
        school_id=course.school_id,
        input_snapshot=snapshot,
    )
    audit.record(
        db,
        action=f"ai.{job_type}.requested",
        resource_type=target_type,
        resource_id=target_id,
        actor_user_id=user.id,
        school_id=course.school_id,
    )
    db.commit()
    dispatch(job.id)
    db.refresh(job)
    return job


def start_outline(db: Session, user: User, course_id: uuid.UUID) -> Job:
    course = get_course_for(db, user, course_id, manage=True)
    return _start(db, user, course, JobType.OUTLINE_GENERATION, "course", course.id)


def start_lesson(db: Session, user: User, chapter_id: uuid.UUID) -> Job:
    chapter = get_chapter_for(db, user, chapter_id, manage=True)
    course = get_course_for(db, user, chapter.course_id, manage=True)
    return _start(db, user, course, JobType.LESSON_GENERATION, "chapter", chapter.id)


def start_section(
    db: Session,
    user: User,
    lesson_id: uuid.UUID,
    index: int,
    expected_version: int,
    instruction: str | None,
) -> Job:
    lesson = db.get(Lesson, lesson_id)
    if lesson is None:
        raise NotFoundError()
    chapter = get_chapter_for(db, user, lesson.chapter_id, manage=True)
    if lesson.version != expected_version:
        raise ConflictError("Save or reload the lesson before regenerating a section.")
    if not 0 <= index < len(LessonContent.model_validate(lesson.content_json).sections):
        raise NotFoundError("Section not found.")
    course = get_course_for(db, user, chapter.course_id, manage=True)
    return _start(
        db,
        user,
        course,
        JobType.SECTION_REGENERATION,
        "lesson",
        lesson.id,
        {"section_index": index, "base_version": lesson.version, "instruction": instruction},
    )


def list_outline_proposals(db: Session, user: User, course_id: uuid.UUID) -> list[AIOutputVersion]:
    get_course_for(db, user, course_id, manage=True)
    return list(
        db.scalars(
            select(AIOutputVersion)
            .where(AIOutputVersion.course_id == course_id, AIOutputVersion.kind == "outline")
            .order_by(AIOutputVersion.created_at.desc())
            .limit(10)
        )
    )


def _proposal_for(db: Session, user: User, proposal_id: uuid.UUID) -> AIOutputVersion:
    proposal = db.get(AIOutputVersion, proposal_id)
    if proposal is None or proposal.kind != "outline":
        raise NotFoundError()
    get_course_for(db, user, proposal.course_id, manage=True)
    if proposal.status != "proposed":
        raise ConflictError("This proposal has already been applied or discarded.")
    return proposal


def apply_outline(
    db: Session, user: User, proposal_id: uuid.UUID, chapters: list[dict[str, Any]]
) -> list[Chapter]:
    """The teacher review gate for outlines: the (edited) chapters the teacher submits are created
    as DRAFT chapters. Nothing is published."""
    proposal = _proposal_for(db, user, proposal_id)
    course_id = proposal.course_id
    refs = {
        ChapterSourceRef.model_validate(r).document_id for ch in chapters for r in ch["source_refs"]
    }
    check_doc_refs(db, course_id, refs)
    start = db.scalar(select(func.max(Chapter.position)).where(Chapter.course_id == course_id)) or 0
    created = []
    for i, ch in enumerate(chapters, start=1):
        chapter = Chapter(
            course_id=course_id,
            title=ch["title"],
            description=ch["description"],
            position=start + i,
            source_refs=[
                ChapterSourceRef.model_validate(r).model_dump(mode="json")
                for r in ch["source_refs"]
            ],
        )
        db.add(chapter)
        db.flush()
        for j, text in enumerate(ch["objectives"], start=1):
            db.add(
                LearningObjective(
                    chapter_id=chapter.id, objective_text=text, position=j, source_refs=[]
                )
            )
        created.append(chapter)
    proposal.status = "applied"
    audit.record(
        db,
        action="ai.outline.applied",
        resource_type="course",
        resource_id=course_id,
        actor_user_id=user.id,
        metadata={"proposal_id": str(proposal.id), "chapters": len(created)},
    )
    db.commit()
    return created


def discard_outline(db: Session, user: User, proposal_id: uuid.UUID) -> None:
    proposal = _proposal_for(db, user, proposal_id)
    proposal.status = "discarded"
    db.commit()


def usage_summary(db: Session, user: User, course_id: uuid.UUID) -> dict[str, Any]:
    get_course_for(db, user, course_id, manage=True)
    row = db.execute(
        select(
            func.count(AIUsageRecord.id),
            func.coalesce(func.sum(AIUsageRecord.input_tokens), 0),
            func.coalesce(func.sum(AIUsageRecord.output_tokens), 0),
            func.sum(AIUsageRecord.estimated_cost),
        ).where(AIUsageRecord.course_id == course_id)
    ).one()
    return {
        "calls": row[0],
        "input_tokens": row[1],
        "output_tokens": row[2],
        "estimated_cost_usd": row[3],
    }


def start_scene_plan(db: Session, user: User, lesson_id: uuid.UUID) -> Job:
    lesson = db.get(Lesson, lesson_id)
    if lesson is None:
        raise NotFoundError()
    chapter = get_chapter_for(db, user, lesson.chapter_id, manage=True)
    course = get_course_for(db, user, chapter.course_id, manage=True)
    if not LessonContent.model_validate(lesson.content_json).sections:
        raise NoSourcesError("Write or generate the lesson content before planning a 3D scene.")
    _check_budget(db, course.id)
    job = create_job(
        db,
        job_type=JobType.SCENE_PLANNING,
        target_type="lesson",
        target_id=lesson.id,
        requested_by=user.id,
        course_id=course.id,
        school_id=course.school_id,
    )
    audit.record(
        db,
        action="ai.scene_planning.requested",
        resource_type="lesson",
        resource_id=lesson.id,
        actor_user_id=user.id,
        school_id=course.school_id,
    )
    db.commit()
    dispatch(job.id)
    db.refresh(job)
    return job
