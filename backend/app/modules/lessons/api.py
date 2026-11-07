import uuid

from fastapi import APIRouter, status

from app.core.deps import DB, CurrentUser
from app.modules.lessons import service
from app.modules.lessons.schemas import (
    LessonCreate,
    LessonOut,
    LessonSummary,
    LessonUpdate,
    LessonVersionOut,
)

router = APIRouter(tags=["lessons"])


@router.post(
    "/chapters/{chapter_id}/lessons", response_model=LessonOut, status_code=status.HTTP_201_CREATED
)
def create_lesson(
    chapter_id: uuid.UUID, body: LessonCreate, user: CurrentUser, db: DB
) -> LessonOut:
    return service.to_out(service.create_lesson(db, user, chapter_id, body))


@router.get("/chapters/{chapter_id}/lessons", response_model=list[LessonSummary])
def list_lessons(chapter_id: uuid.UUID, user: CurrentUser, db: DB) -> list[LessonSummary]:
    return service.list_lessons(db, user, chapter_id)


@router.get("/lessons/{lesson_id}", response_model=LessonOut)
def get_lesson(lesson_id: uuid.UUID, user: CurrentUser, db: DB) -> LessonOut:
    return service.get_lesson(db, user, lesson_id)


@router.patch("/lessons/{lesson_id}", response_model=LessonOut)
def update_lesson(lesson_id: uuid.UUID, body: LessonUpdate, user: CurrentUser, db: DB) -> LessonOut:
    return service.to_out(service.update_lesson(db, user, lesson_id, body))


@router.post("/lessons/{lesson_id}/publish", response_model=LessonOut)
def publish(lesson_id: uuid.UUID, user: CurrentUser, db: DB) -> LessonOut:
    return service.to_out(service.publish_lesson(db, user, lesson_id))


@router.post("/lessons/{lesson_id}/unpublish", response_model=LessonOut)
def unpublish(lesson_id: uuid.UUID, user: CurrentUser, db: DB) -> LessonOut:
    return service.to_out(service.unpublish_lesson(db, user, lesson_id))


@router.delete("/lessons/{lesson_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lesson(lesson_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    service.delete_lesson(db, user, lesson_id)


@router.get("/lessons/{lesson_id}/versions", response_model=list[LessonVersionOut])
def list_versions(lesson_id: uuid.UUID, user: CurrentUser, db: DB) -> list[LessonVersionOut]:
    return [
        LessonVersionOut(
            version_number=v.version_number,
            title=v.title,
            change_source=v.change_source,
            created_at=v.created_at,
        )
        for v in service.list_versions(db, user, lesson_id)
    ]
