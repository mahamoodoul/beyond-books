import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import AppError, ConflictError, NotFoundError
from app.modules.chapters.service import chapter_access, check_doc_refs, get_chapter_for
from app.modules.lessons.content import LessonContent
from app.modules.lessons.models import Lesson, LessonVersion
from app.modules.lessons.schemas import LessonCreate, LessonOut, LessonSummary, LessonUpdate
from app.modules.operations import audit
from app.modules.users.models import User


class LessonNotPublishableError(AppError):
    status_code = 422
    code = "LESSON_NOT_PUBLISHABLE"
    message = "The lesson needs at least one section with content before it can be published."


def _snapshot(db: Session, lesson: Lesson, user_id: uuid.UUID | None, change_source: str) -> None:
    db.add(
        LessonVersion(
            lesson_id=lesson.id,
            version_number=lesson.version,
            title=lesson.title,
            content_snapshot=lesson.content_json,
            created_by=user_id,
            change_source=change_source,
        )
    )


def validate_content_refs(db: Session, course_id: uuid.UUID, content: LessonContent) -> None:
    check_doc_refs(db, course_id, {r.document_id for s in content.sections for r in s.source_refs})


def save_new_version(
    db: Session,
    lesson: Lesson,
    *,
    title: str | None,
    content: LessonContent | None,
    user_id: uuid.UUID | None,
    change_source: str,
) -> Lesson:
    if title is not None:
        lesson.title = title
    if content is not None:
        lesson.content_json = content.model_dump(mode="json")
    lesson.version += 1
    _snapshot(db, lesson, user_id, change_source)
    return lesson


def create_lesson(
    db: Session,
    user: User | None,
    chapter_id: uuid.UUID,
    body: LessonCreate,
    *,
    origin: str = "manual",
    chapter_course_id: uuid.UUID | None = None,
) -> Lesson:
    if user is not None:
        chapter = get_chapter_for(db, user, chapter_id, manage=True)
        course_id = chapter.course_id
    else:  # trusted internal caller (AI worker) that already authorized the job
        assert chapter_course_id is not None
        course_id = chapter_course_id
    validate_content_refs(db, course_id, body.content)
    position = (
        db.scalar(select(func.max(Lesson.position)).where(Lesson.chapter_id == chapter_id)) or 0
    ) + 1
    lesson = Lesson(
        chapter_id=chapter_id,
        title=body.title,
        position=position,
        content_json=body.content.model_dump(mode="json"),
        origin=origin,
    )
    db.add(lesson)
    db.flush()
    _snapshot(db, lesson, user.id if user else None, origin)
    db.commit()
    return lesson


def _manage_lesson(db: Session, user: User, lesson_id: uuid.UUID) -> Lesson:
    lesson = db.get(Lesson, lesson_id)
    if lesson is None:
        raise NotFoundError()
    get_chapter_for(db, user, lesson.chapter_id, manage=True)
    return lesson


def _published_snapshot(db: Session, lesson: Lesson) -> LessonVersion | None:
    if lesson.published_version is None:
        return None
    return db.scalar(
        select(LessonVersion).where(
            LessonVersion.lesson_id == lesson.id,
            LessonVersion.version_number == lesson.published_version,
        )
    )


def to_out(lesson: Lesson, *, snapshot: LessonVersion | None = None) -> LessonOut:
    title = snapshot.title if snapshot else lesson.title
    content = snapshot.content_snapshot if snapshot else lesson.content_json
    return LessonOut(
        id=lesson.id,
        chapter_id=lesson.chapter_id,
        title=title,
        position=lesson.position,
        status=lesson.status,
        version=snapshot.version_number if snapshot else lesson.version,
        published_version=lesson.published_version,
        has_unpublished_changes=lesson.published_version != lesson.version,
        origin=lesson.origin,
        content=LessonContent.model_validate(content),
        updated_at=lesson.updated_at,
    )


def to_summary(lesson: Lesson) -> LessonSummary:
    return LessonSummary(
        id=lesson.id,
        title=lesson.title,
        position=lesson.position,
        status=lesson.status,
        version=lesson.version,
        published_version=lesson.published_version,
        has_unpublished_changes=lesson.published_version != lesson.version,
        origin=lesson.origin,
    )


def get_lesson(db: Session, user: User, lesson_id: uuid.UUID) -> LessonOut:
    lesson = db.get(Lesson, lesson_id)
    if lesson is None:
        raise NotFoundError()
    _, access = chapter_access(db, user, lesson.chapter_id)
    if access.can_manage:
        return to_out(lesson)
    snapshot = _published_snapshot(db, lesson)
    if snapshot is None:
        raise NotFoundError()
    return to_out(lesson, snapshot=snapshot)


def list_lessons(db: Session, user: User, chapter_id: uuid.UUID) -> list[LessonSummary]:
    _, access = chapter_access(db, user, chapter_id)
    q = select(Lesson).where(Lesson.chapter_id == chapter_id).order_by(Lesson.position)
    if not access.can_manage:
        q = q.where(Lesson.published_version.is_not(None))
    return [to_summary(lesson) for lesson in db.scalars(q)]


def update_lesson(db: Session, user: User, lesson_id: uuid.UUID, body: LessonUpdate) -> Lesson:
    lesson = _manage_lesson(db, user, lesson_id)
    if body.expected_version != lesson.version:
        raise ConflictError(
            "This lesson was changed by someone else. Reload to see the latest version."
        )
    if body.content is not None:
        chapter = get_chapter_for(db, user, lesson.chapter_id, manage=True)
        validate_content_refs(db, chapter.course_id, body.content)
    if body.title is None and body.content is None:
        return lesson
    save_new_version(
        db, lesson, title=body.title, content=body.content, user_id=user.id, change_source="manual"
    )
    db.commit()
    return lesson


def publish_lesson(db: Session, user: User, lesson_id: uuid.UUID) -> Lesson:
    """The teacher approval gate: only an explicit publish makes content visible to students."""
    lesson = _manage_lesson(db, user, lesson_id)
    content = LessonContent.model_validate(lesson.content_json)
    if not any(s.body_markdown.strip() for s in content.sections):
        raise LessonNotPublishableError()
    lesson.published_version = lesson.version
    lesson.status = "published"
    audit.record(
        db,
        action="lesson.publish",
        resource_type="lesson",
        resource_id=lesson.id,
        actor_user_id=user.id,
        metadata={"version": lesson.version, "origin": lesson.origin},
    )
    db.commit()
    return lesson


def unpublish_lesson(db: Session, user: User, lesson_id: uuid.UUID) -> Lesson:
    lesson = _manage_lesson(db, user, lesson_id)
    lesson.published_version = None
    lesson.status = "draft"
    audit.record(
        db,
        action="lesson.unpublish",
        resource_type="lesson",
        resource_id=lesson.id,
        actor_user_id=user.id,
    )
    db.commit()
    return lesson


def delete_lesson(db: Session, user: User, lesson_id: uuid.UUID) -> None:
    lesson = _manage_lesson(db, user, lesson_id)
    db.delete(lesson)
    audit.record(
        db,
        action="lesson.delete",
        resource_type="lesson",
        resource_id=lesson_id,
        actor_user_id=user.id,
    )
    db.commit()


def list_versions(db: Session, user: User, lesson_id: uuid.UUID) -> list[LessonVersion]:
    lesson = _manage_lesson(db, user, lesson_id)
    return list(
        db.scalars(
            select(LessonVersion)
            .where(LessonVersion.lesson_id == lesson.id)
            .order_by(LessonVersion.version_number.desc())
        )
    )
