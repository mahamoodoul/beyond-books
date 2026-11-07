"""Course chapters: AI proposes splitting one complex chapter into 2-5 smaller chapters.

Same review gate as the course outline: the proposal is returned to the teacher, who edits and
applies it. Applying inserts the new chapters right after the original and can remove the
original (only when it has no lessons or quizzes yet).
"""

import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError
from app.modules.ai_engine import retrieval
from app.modules.ai_engine.prompts import CHAPTER_SPLIT
from app.modules.ai_engine.schemas import OutlineLLM
from app.modules.ai_engine.validation import OutputRejectedError, convert_outline
from app.modules.chapters.models import Chapter, LearningObjective
from app.modules.chapters.schemas import ChapterSourceRef
from app.modules.chapters.service import check_doc_refs, get_chapter_for
from app.modules.documents.models import DocumentStatus, SourceDocument
from app.modules.operations import audit
from app.modules.operations.jobs import JobType
from app.modules.operations.models import Job
from app.modules.operations.runner import PermanentJobError, handler
from app.modules.users.models import User


def start_split(db: Session, user: User, chapter_id: uuid.UUID) -> Job:
    from app.modules.ai_engine.service import _start
    from app.modules.courses.access import get_course_for

    chapter = get_chapter_for(db, user, chapter_id, manage=True)
    course = get_course_for(db, user, chapter.course_id, manage=True)
    return _start(db, user, course, JobType.CHAPTER_SPLIT, "chapter", chapter.id)


@handler(JobType.CHAPTER_SPLIT)
def split_chapter(db: Session, job: Job) -> dict[str, Any]:
    from app.modules.ai_engine.workflows import _call, _chapter_task, _record, _rejected

    chapter = db.get(Chapter, job.target_id)
    if chapter is None:
        raise PermanentJobError("CHAPTER_MISSING", "The chapter no longer exists.")
    found = retrieval.for_chapter(db, chapter)
    task = (
        _chapter_task(db, chapter)
        + "\nSplit this chapter into 2-5 smaller chapters, using only its pages below."
    )
    out, usage = _call(db, job, CHAPTER_SPLIT, task, found.passages, OutlineLLM)
    page_counts = {
        str(d.id): d.page_count or 0
        for d in db.scalars(
            select(SourceDocument).where(
                SourceDocument.course_id == chapter.course_id,
                SourceDocument.processing_status == DocumentStatus.READY,
            )
        )
    }
    try:
        proposal, report = convert_outline(out, found.passages, page_counts)
    except OutputRejectedError as exc:
        raise _rejected(exc) from exc
    if len(proposal["chapters"]) < 2:
        raise PermanentJobError("NOTHING_TO_SPLIT", "The AI found only one topic in this chapter.")
    _record(
        db,
        job,
        usage,
        CHAPTER_SPLIT,
        kind="chapter_split",
        target_type="chapter",
        target_id=chapter.id,
        output=proposal,
        validation=report.as_dict(),
        status="proposed",
    )
    db.commit()
    return {"chapters": proposal["chapters"], **report.as_dict()}


def _has_content(db: Session, chapter: Chapter) -> bool:
    from app.modules.assessments.models import Assessment
    from app.modules.lessons.models import Lesson

    lessons = db.scalar(select(func.count(Lesson.id)).where(Lesson.chapter_id == chapter.id))
    quizzes = db.scalar(
        select(func.count(Assessment.id)).where(Assessment.chapter_id == chapter.id)
    )
    return bool(lessons or quizzes)


def apply_split(
    db: Session,
    user: User,
    chapter_id: uuid.UUID,
    chapters: list[dict[str, Any]],
    *,
    remove_original: bool,
) -> list[Chapter]:
    original = get_chapter_for(db, user, chapter_id, manage=True)
    if remove_original and _has_content(db, original):
        raise ConflictError(
            "This chapter already has lessons or quizzes. Keep it, or move them first."
        )
    refs = {
        ChapterSourceRef.model_validate(r).document_id for ch in chapters for r in ch["source_refs"]
    }
    check_doc_refs(db, original.course_id, refs)
    siblings = list(
        db.scalars(
            select(Chapter)
            .where(Chapter.course_id == original.course_id)
            .order_by(Chapter.position)
        )
    )
    before = [c for c in siblings if c.position <= original.position and c.id != original.id]
    after = [c for c in siblings if c.position > original.position]
    created: list[Chapter] = []
    for ch in chapters:
        new = Chapter(
            course_id=original.course_id,
            title=ch["title"],
            description=ch["description"],
            position=0,  # renumbered below
            source_refs=[
                ChapterSourceRef.model_validate(r).model_dump(mode="json")
                for r in ch["source_refs"]
            ],
            ai_instructions=original.ai_instructions,
        )
        db.add(new)
        db.flush()
        for j, text in enumerate(ch["objectives"], start=1):
            db.add(LearningObjective(chapter_id=new.id, objective_text=text, position=j))
        created.append(new)
    keep = [] if remove_original else [original]
    for i, c in enumerate([*before, *keep, *created, *after], start=1):
        c.position = i
    if remove_original:
        db.delete(original)
    audit.record(
        db,
        action="chapter.split",
        resource_type="chapter",
        resource_id=original.id,
        actor_user_id=user.id,
        metadata={"into": len(created), "removed_original": remove_original},
    )
    db.commit()
    return created
