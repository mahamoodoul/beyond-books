import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.modules.chapters.models import Chapter, LearningObjective, PublishStatus
from app.modules.chapters.schemas import ChapterCreate, ChapterUpdate, ObjectiveIn
from app.modules.courses.access import CourseAccess, get_course_for, resolve_course_access
from app.modules.documents.models import SourceDocument
from app.modules.operations import audit
from app.modules.users.models import User


def chapter_access(db: Session, user: User, chapter_id: uuid.UUID) -> tuple[Chapter, CourseAccess]:
    chapter = db.get(Chapter, chapter_id)
    if chapter is None:
        raise NotFoundError()
    access = resolve_course_access(db, user, chapter.course_id)
    if not access.can_manage and chapter.status != PublishStatus.PUBLISHED:
        raise NotFoundError()
    return chapter, access


def get_chapter_for(db: Session, user: User, chapter_id: uuid.UUID, *, manage: bool) -> Chapter:
    chapter, access = chapter_access(db, user, chapter_id)
    if manage and not access.can_manage:
        get_course_for(db, user, chapter.course_id, manage=True)  # raises 403
    return chapter


def check_doc_refs(db: Session, course_id: uuid.UUID, doc_ids: set[uuid.UUID]) -> None:
    """Source refs may only point at documents of the same course (no cross-course leakage)."""
    if not doc_ids:
        return
    found = set(
        db.scalars(
            select(SourceDocument.id).where(
                SourceDocument.id.in_(doc_ids), SourceDocument.course_id == course_id
            )
        )
    )
    if found != doc_ids:
        raise NotFoundError("A referenced source document was not found in this course.")


def _next_position(db: Session, course_id: uuid.UUID) -> int:
    current = db.scalar(select(func.max(Chapter.position)).where(Chapter.course_id == course_id))
    return (current or 0) + 1


def create_chapter(db: Session, user: User, course_id: uuid.UUID, body: ChapterCreate) -> Chapter:
    course = get_course_for(db, user, course_id, manage=True)
    check_doc_refs(db, course.id, {r.document_id for r in body.source_refs})
    chapter = Chapter(
        course_id=course.id,
        title=body.title,
        description=body.description,
        position=_next_position(db, course.id),
        source_refs=[r.model_dump(mode="json") for r in body.source_refs],
    )
    db.add(chapter)
    db.commit()
    return chapter


def list_chapters(db: Session, user: User, course_id: uuid.UUID) -> list[Chapter]:
    access = resolve_course_access(db, user, course_id)
    q = select(Chapter).where(Chapter.course_id == course_id).order_by(Chapter.position)
    if not access.can_manage:
        q = q.where(Chapter.status == PublishStatus.PUBLISHED)
    return list(db.scalars(q))


def _reorder(db: Session, chapter: Chapter, new_position: int) -> None:
    siblings = list(
        db.scalars(
            select(Chapter)
            .where(Chapter.course_id == chapter.course_id, Chapter.id != chapter.id)
            .order_by(Chapter.position)
        )
    )
    new_position = min(new_position, len(siblings) + 1)
    siblings.insert(new_position - 1, chapter)
    for i, c in enumerate(siblings, start=1):
        c.position = i


def update_chapter(db: Session, user: User, chapter_id: uuid.UUID, body: ChapterUpdate) -> Chapter:
    chapter = get_chapter_for(db, user, chapter_id, manage=True)
    changes = body.model_dump(exclude_unset=True)
    if changes.get("ai_instructions") is None:
        changes.pop("ai_instructions", None)
    else:
        changes["ai_instructions"] = changes["ai_instructions"].strip()
    if "position" in changes:
        _reorder(db, chapter, changes.pop("position"))
    if body.source_refs is not None:
        check_doc_refs(db, chapter.course_id, {r.document_id for r in body.source_refs})
        changes["source_refs"] = [r.model_dump(mode="json") for r in body.source_refs]
    for k, v in changes.items():
        setattr(chapter, k, v)
    if changes:
        chapter.version += 1
    if "status" in changes:
        audit.record(
            db,
            action=f"chapter.status.{changes['status']}",
            resource_type="chapter",
            resource_id=chapter.id,
            actor_user_id=user.id,
        )
    db.commit()
    return chapter


def delete_chapter(db: Session, user: User, chapter_id: uuid.UUID) -> None:
    chapter = get_chapter_for(db, user, chapter_id, manage=True)
    course_id = chapter.course_id
    db.delete(chapter)
    db.flush()
    for i, c in enumerate(
        db.scalars(
            select(Chapter).where(Chapter.course_id == course_id).order_by(Chapter.position)
        ),
        start=1,
    ):
        c.position = i
    audit.record(
        db,
        action="chapter.delete",
        resource_type="chapter",
        resource_id=chapter_id,
        actor_user_id=user.id,
    )
    db.commit()


def list_objectives(db: Session, chapter_id: uuid.UUID) -> list[LearningObjective]:
    return list(
        db.scalars(
            select(LearningObjective)
            .where(LearningObjective.chapter_id == chapter_id)
            .order_by(LearningObjective.position)
        )
    )


def replace_objectives(
    db: Session, user: User, chapter_id: uuid.UUID, objectives: list[ObjectiveIn]
) -> list[LearningObjective]:
    chapter = get_chapter_for(db, user, chapter_id, manage=True)
    db.execute(delete(LearningObjective).where(LearningObjective.chapter_id == chapter.id))
    for i, o in enumerate(objectives, start=1):
        db.add(
            LearningObjective(
                chapter_id=chapter.id, objective_text=o.text, position=i, source_refs=o.source_refs
            )
        )
    db.commit()
    return list_objectives(db, chapter.id)
