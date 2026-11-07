"""Student progress and learning evidence (design §15 Phase 7)."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.modules.chapters.models import Chapter, PublishStatus
from app.modules.courses.access import get_course_for, resolve_course_access
from app.modules.courses.models import Course, CourseEnrollment, CourseStatus
from app.modules.lessons.models import Lesson
from app.modules.lessons.service import get_lesson
from app.modules.progress.models import ChapterProgress, LearningEvent, LessonProgress
from app.modules.progress.schemas import (
    CourseOutline,
    CourseProgressSummary,
    EventIn,
    OutlineChapter,
    OutlineLesson,
    StudentProgressRow,
)
from app.modules.three_d.models import ThreeDScene
from app.modules.users.models import User


def _visible_lessons(db: Session, course_id: uuid.UUID) -> list[tuple[Chapter, Lesson]]:
    rows = db.execute(
        select(Chapter, Lesson)
        .join(Lesson, Lesson.chapter_id == Chapter.id)
        .where(
            Chapter.course_id == course_id,
            Chapter.status == PublishStatus.PUBLISHED,
            Lesson.published_version.is_not(None),
        )
        .order_by(Chapter.position, Lesson.position)
    ).all()
    return [(c, lesson) for c, lesson in rows]


def _progress_map(
    db: Session, user_id: uuid.UUID, course_id: uuid.UUID
) -> dict[uuid.UUID, LessonProgress]:
    return {
        p.lesson_id: p
        for p in db.scalars(
            select(LessonProgress).where(
                LessonProgress.user_id == user_id, LessonProgress.course_id == course_id
            )
        )
    }


def _course_of_lesson(db: Session, lesson: Lesson) -> tuple[Chapter, uuid.UUID]:
    chapter = db.get(Chapter, lesson.chapter_id)
    assert chapter is not None
    return chapter, chapter.course_id


def _student_lesson(db: Session, user: User, lesson_id: uuid.UUID) -> tuple[Lesson, Chapter, bool]:
    """Authorize via the lesson rules; return (lesson, chapter, is_manager)."""
    get_lesson(db, user, lesson_id)  # raises unless visible to the user
    lesson = db.get(Lesson, lesson_id)
    assert lesson is not None
    chapter, course_id = _course_of_lesson(db, lesson)
    return lesson, chapter, resolve_course_access(db, user, course_id).can_manage


def _update_chapter(db: Session, user_id: uuid.UUID, chapter: Chapter) -> None:
    lesson_ids = set(
        db.scalars(
            select(Lesson.id).where(
                Lesson.chapter_id == chapter.id, Lesson.published_version.is_not(None)
            )
        )
    )
    done = (
        set(
            db.scalars(
                select(LessonProgress.lesson_id).where(
                    LessonProgress.user_id == user_id,
                    LessonProgress.lesson_id.in_(lesson_ids),
                    LessonProgress.status == "completed",
                )
            )
        )
        if lesson_ids
        else set()
    )
    cp = db.scalar(
        select(ChapterProgress).where(
            ChapterProgress.user_id == user_id, ChapterProgress.chapter_id == chapter.id
        )
    )
    if cp is None:
        cp = ChapterProgress(user_id=user_id, chapter_id=chapter.id, course_id=chapter.course_id)
        db.add(cp)
    complete = bool(lesson_ids) and lesson_ids <= done
    cp.status = "completed" if complete else "in_progress"
    cp.completed_at = cp.completed_at or (datetime.now(UTC) if complete else None)
    if not complete:
        cp.completed_at = None


def set_lesson_progress(
    db: Session, user: User, lesson_id: uuid.UUID, status: str
) -> LessonProgress | None:
    lesson, chapter, manager = _student_lesson(db, user, lesson_id)
    if manager:
        return None  # teacher previews are not learning evidence
    now = datetime.now(UTC)
    p = db.scalar(
        select(LessonProgress).where(
            LessonProgress.user_id == user.id, LessonProgress.lesson_id == lesson.id
        )
    )
    if p is None:
        p = LessonProgress(user_id=user.id, lesson_id=lesson.id, course_id=chapter.course_id)
        db.add(p)
    p.last_activity_at = now
    if status == "completed":
        p.status, p.completed_at = "completed", p.completed_at or now
    elif p.status != "completed":
        p.status = "in_progress"
    db.flush()
    _update_chapter(db, user.id, chapter)
    db.commit()
    return p


def record_events(db: Session, user: User, events: list[EventIn]) -> int:
    recorded = 0
    cache: dict[uuid.UUID, tuple[uuid.UUID, bool]] = {}
    for e in events:
        if e.lesson_id not in cache:
            lesson, chapter, manager = _student_lesson(db, user, e.lesson_id)
            cache[e.lesson_id] = (chapter.course_id, manager)
        course_id, manager = cache[e.lesson_id]
        if manager:
            continue
        if e.scene_id is not None:
            scene = db.get(ThreeDScene, e.scene_id)
            if scene is None or scene.lesson_id != e.lesson_id or scene.published_spec is None:
                raise NotFoundError("Unknown scene for this lesson.")
        payload = {
            k: v
            for k, v in (("component_id", e.component_id), ("animation_id", e.animation_id))
            if v
        }
        db.add(
            LearningEvent(
                user_id=user.id,
                course_id=course_id,
                lesson_id=e.lesson_id,
                scene_id=e.scene_id,
                event_type=e.event_type,
                payload=payload,
            )
        )
        recorded += 1
    db.commit()
    return recorded


def outline(db: Session, user: User, course_id: uuid.UUID) -> CourseOutline:
    access = resolve_course_access(db, user, course_id)
    course = access.course
    progress = {} if access.can_manage else _progress_map(db, user.id, course.id)
    q = select(Chapter).where(Chapter.course_id == course.id).order_by(Chapter.position)
    if not access.can_manage:
        q = q.where(Chapter.status == PublishStatus.PUBLISHED)
    chapters: list[OutlineChapter] = []
    total = completed = 0
    next_lesson: uuid.UUID | None = None
    for ch in db.scalars(q):
        lq = select(Lesson).where(Lesson.chapter_id == ch.id).order_by(Lesson.position)
        if not access.can_manage:
            lq = lq.where(Lesson.published_version.is_not(None))
        lessons = []
        for lesson in db.scalars(lq):
            p = progress.get(lesson.id)
            state = p.status if p else "not_started"
            total += 1
            completed += state == "completed"
            if next_lesson is None and state != "completed":
                next_lesson = lesson.id
            lessons.append(
                OutlineLesson(
                    id=lesson.id,
                    title=lesson.title,
                    position=lesson.position,
                    published=lesson.published_version is not None,
                    progress=state,
                )
            )
        states = {lesson.progress for lesson in lessons}
        ch_state = (
            "completed"
            if lessons and states == {"completed"}
            else "not_started"
            if states <= {"not_started"}
            else "in_progress"
        )
        chapters.append(
            OutlineChapter(
                id=ch.id,
                title=ch.title,
                description=ch.description,
                position=ch.position,
                published=ch.status == PublishStatus.PUBLISHED,
                progress=ch_state,
                lessons=lessons,
            )
        )
    return CourseOutline(
        course_id=course.id,
        title=course.title,
        can_manage=access.can_manage,
        completed_lessons=completed,
        total_lessons=total,
        next_lesson_id=next_lesson,
        chapters=chapters,
    )


def my_progress(db: Session, user: User) -> list[CourseProgressSummary]:
    courses = db.scalars(
        select(Course)
        .join(CourseEnrollment, CourseEnrollment.course_id == Course.id)
        .where(
            CourseEnrollment.student_id == user.id,
            CourseEnrollment.status == "active",
            Course.status == CourseStatus.PUBLISHED,
        )
        .order_by(Course.title)
    )
    out = []
    for c in courses:
        o = outline(db, user, c.id)
        last = db.scalar(
            select(func.max(LessonProgress.last_activity_at)).where(
                LessonProgress.user_id == user.id, LessonProgress.course_id == c.id
            )
        )
        out.append(
            CourseProgressSummary(
                course_id=c.id,
                title=c.title,
                completed_lessons=o.completed_lessons,
                total_lessons=o.total_lessons,
                last_activity_at=last,
                next_lesson_id=o.next_lesson_id,
            )
        )
    return out


def course_progress(db: Session, user: User, course_id: uuid.UUID) -> list[StudentProgressRow]:
    course = get_course_for(db, user, course_id, manage=True)
    lesson_ids = [lesson.id for _, lesson in _visible_lessons(db, course.id)]
    students = db.scalars(
        select(User)
        .join(CourseEnrollment, CourseEnrollment.student_id == User.id)
        .where(CourseEnrollment.course_id == course.id, CourseEnrollment.status == "active")
        .order_by(User.display_name)
    )
    rows = []
    for s in students:
        done = (
            db.scalar(
                select(func.count(LessonProgress.id)).where(
                    LessonProgress.user_id == s.id,
                    LessonProgress.lesson_id.in_(lesson_ids),
                    LessonProgress.status == "completed",
                )
            )
            if lesson_ids
            else 0
        )
        chapters_done = (
            db.scalar(
                select(func.count(ChapterProgress.id)).where(
                    ChapterProgress.user_id == s.id,
                    ChapterProgress.course_id == course.id,
                    ChapterProgress.status == "completed",
                )
            )
            or 0
        )
        last = db.scalar(
            select(func.max(LessonProgress.last_activity_at)).where(
                LessonProgress.user_id == s.id, LessonProgress.course_id == course.id
            )
        )
        rows.append(
            StudentProgressRow(
                student_id=s.id,
                display_name=s.display_name,
                email=s.email,
                completed_lessons=done or 0,
                total_lessons=len(lesson_ids),
                completed_chapters=chapters_done,
                last_activity_at=last,
            )
        )
    return rows
