import uuid

from fastapi import APIRouter, status

from app.core.deps import DB, CurrentUser
from app.modules.chapters import service
from app.modules.chapters.models import Chapter, LearningObjective
from app.modules.chapters.schemas import (
    ChapterCreate,
    ChapterDetail,
    ChapterOut,
    ChapterUpdate,
    ObjectiveIn,
    ObjectiveOut,
)

router = APIRouter(tags=["chapters"])


@router.post(
    "/courses/{course_id}/chapters", response_model=ChapterOut, status_code=status.HTTP_201_CREATED
)
def create_chapter(course_id: uuid.UUID, body: ChapterCreate, user: CurrentUser, db: DB) -> Chapter:
    return service.create_chapter(db, user, course_id, body)


@router.get("/courses/{course_id}/chapters", response_model=list[ChapterOut])
def list_chapters(course_id: uuid.UUID, user: CurrentUser, db: DB) -> list[Chapter]:
    return service.list_chapters(db, user, course_id)


@router.get("/chapters/{chapter_id}", response_model=ChapterDetail)
def get_chapter(chapter_id: uuid.UUID, user: CurrentUser, db: DB) -> ChapterDetail:
    chapter = service.get_chapter_for(db, user, chapter_id, manage=False)
    detail = ChapterDetail.model_validate(chapter)
    detail.objectives = [
        ObjectiveOut.model_validate(o) for o in service.list_objectives(db, chapter.id)
    ]
    return detail


@router.patch("/chapters/{chapter_id}", response_model=ChapterOut)
def update_chapter(
    chapter_id: uuid.UUID, body: ChapterUpdate, user: CurrentUser, db: DB
) -> Chapter:
    return service.update_chapter(db, user, chapter_id, body)


@router.delete("/chapters/{chapter_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_chapter(chapter_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    service.delete_chapter(db, user, chapter_id)


@router.put("/chapters/{chapter_id}/objectives", response_model=list[ObjectiveOut])
def replace_objectives(
    chapter_id: uuid.UUID, body: list[ObjectiveIn], user: CurrentUser, db: DB
) -> list[LearningObjective]:
    return service.replace_objectives(db, user, chapter_id, body)
