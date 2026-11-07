"""Publish a whole chapter from the chapter studio in one action.

Publishes, in order: every lesson with content, the 3D scenes of those lessons, every assessment
with questions, the chapter itself and (optionally) the course. Each item goes through its own
module's publish rules (validation, version snapshots, audit). An item that fails its rules is
skipped and reported, never forced through.
"""

import uuid

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.modules.chapters.models import PublishStatus
from app.modules.chapters.service import get_chapter_for
from app.modules.users.models import User


class PublishChapterRequest(BaseModel):
    include_course: bool = False  # also publish the course if it is still a draft


class SkippedItem(BaseModel):
    kind: str  # lesson | scene | assessment
    id: uuid.UUID
    title: str
    reason: str


class PublishChapterResult(BaseModel):
    chapter_status: str
    course_status: str
    lessons_published: int
    scenes_published: int
    assessments_published: int
    skipped: list[SkippedItem]


def publish_chapter(
    db: Session, user: User, chapter_id: uuid.UUID, body: PublishChapterRequest
) -> PublishChapterResult:
    from app.modules.assessments import service as assessments
    from app.modules.assessments.models import Assessment
    from app.modules.courses.models import Course, CourseStatus
    from app.modules.courses.schemas import CourseUpdate
    from app.modules.courses.service import update_course
    from app.modules.lessons.models import Lesson
    from app.modules.lessons.service import publish_lesson
    from app.modules.three_d.models import ThreeDScene
    from app.modules.three_d.scenes_service import publish_scene

    chapter = get_chapter_for(db, user, chapter_id, manage=True)
    skipped: list[SkippedItem] = []
    counts = {"lesson": 0, "scene": 0, "assessment": 0}

    def attempt(kind: str, item_id: uuid.UUID, title: str, publish: object) -> bool:
        try:
            publish(db, user, item_id)  # type: ignore[operator]
        except AppError as exc:
            db.rollback()
            extra = "; ".join(str(d.get("msg", "")) for d in exc.details[:3] if d.get("msg"))
            reason = f"{exc.message} ({extra})" if extra else exc.message
            skipped.append(SkippedItem(kind=kind, id=item_id, title=title, reason=reason))
            return False
        counts[kind] += 1
        return True

    lessons = list(
        db.scalars(select(Lesson).where(Lesson.chapter_id == chapter.id).order_by(Lesson.position))
    )
    live_lessons = [
        (lesson.id, lesson.title)
        for lesson in lessons
        if attempt("lesson", lesson.id, lesson.title, publish_lesson)
    ]
    for lesson_id, _ in live_lessons:
        scenes = db.scalars(
            select(ThreeDScene)
            .where(ThreeDScene.lesson_id == lesson_id)
            .order_by(ThreeDScene.created_at)
        )
        for scene_id, title in [(s.id, s.title) for s in scenes]:
            attempt("scene", scene_id, title, publish_scene)
    quizzes = db.scalars(
        select(Assessment).where(Assessment.chapter_id == chapter.id).order_by(Assessment.title)
    )
    for quiz_id, title in [(a.id, a.title) for a in quizzes]:
        attempt("assessment", quiz_id, title, assessments.publish)

    chapter = get_chapter_for(db, user, chapter_id, manage=True)
    if chapter.status != PublishStatus.PUBLISHED:
        chapter.status = PublishStatus.PUBLISHED
        chapter.version += 1
        from app.modules.operations import audit

        audit.record(
            db,
            action="chapter.status.published",
            resource_type="chapter",
            resource_id=chapter.id,
            actor_user_id=user.id,
        )
        db.commit()
    course = db.get(Course, chapter.course_id)
    assert course is not None
    if body.include_course and course.status == CourseStatus.DRAFT:
        course = update_course(db, user, course.id, CourseUpdate(status=CourseStatus.PUBLISHED))
    return PublishChapterResult(
        chapter_status=chapter.status,
        course_status=course.status,
        lessons_published=counts["lesson"],
        scenes_published=counts["scene"],
        assessments_published=counts["assessment"],
        skipped=skipped,
    )
