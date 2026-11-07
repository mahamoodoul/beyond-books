import uuid

from fastapi import APIRouter, Response, status

from app.core.deps import DB, CurrentUser
from app.modules.progress import service
from app.modules.progress.schemas import (
    CourseOutline,
    CourseProgressSummary,
    EventBatch,
    EventResult,
    LessonProgressOut,
    ProgressUpdate,
    StudentProgressRow,
)

router = APIRouter(tags=["progress"])


@router.get("/courses/{course_id}/outline", response_model=CourseOutline)
def outline(course_id: uuid.UUID, user: CurrentUser, db: DB) -> CourseOutline:
    return service.outline(db, user, course_id)


@router.post("/lessons/{lesson_id}/progress", response_model=LessonProgressOut | None)
def set_progress(
    lesson_id: uuid.UUID, body: ProgressUpdate, user: CurrentUser, db: DB, response: Response
) -> LessonProgressOut | None:
    p = service.set_lesson_progress(db, user, lesson_id, body.status)
    if p is None:
        response.status_code = status.HTTP_204_NO_CONTENT
        return None
    return LessonProgressOut(lesson_id=p.lesson_id, status=p.status, completed_at=p.completed_at)


@router.post("/learning-events", response_model=EventResult)
def events(body: EventBatch, user: CurrentUser, db: DB) -> EventResult:
    return EventResult(recorded=service.record_events(db, user, body.events))


@router.get("/students/me/progress", response_model=list[CourseProgressSummary])
def my_progress(user: CurrentUser, db: DB) -> list[CourseProgressSummary]:
    return service.my_progress(db, user)


@router.get("/courses/{course_id}/progress", response_model=list[StudentProgressRow])
def course_progress(course_id: uuid.UUID, user: CurrentUser, db: DB) -> list[StudentProgressRow]:
    return service.course_progress(db, user, course_id)
