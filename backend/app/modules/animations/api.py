import uuid

from fastapi import APIRouter, status
from pydantic import BaseModel, Field

from app.core.deps import DB, CurrentUser
from app.modules.animations import service
from app.modules.animations.service import AnimationOut
from app.modules.three_d.contracts import AnimationSpec

router = APIRouter(tags=["animations"])


class AnimationCreate(BaseModel):
    spec: AnimationSpec


class AnimationUpdate(BaseModel):
    expected_version: int = Field(ge=1)
    spec: AnimationSpec


@router.post(
    "/scenes/{scene_id}/animations",
    response_model=AnimationOut,
    status_code=status.HTTP_201_CREATED,
)
def create(scene_id: uuid.UUID, body: AnimationCreate, user: CurrentUser, db: DB) -> AnimationOut:
    return service.create(db, user, scene_id, body.spec)


@router.get("/scenes/{scene_id}/animations", response_model=list[AnimationOut])
def list_animations(scene_id: uuid.UUID, user: CurrentUser, db: DB) -> list[AnimationOut]:
    return service.list_for_scene(db, user, scene_id)


@router.patch("/animations/{animation_id}", response_model=AnimationOut)
def update(
    animation_id: uuid.UUID, body: AnimationUpdate, user: CurrentUser, db: DB
) -> AnimationOut:
    return service.update(db, user, animation_id, body.expected_version, body.spec)


@router.delete("/animations/{animation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(animation_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    service.delete(db, user, animation_id)
