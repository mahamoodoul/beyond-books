import uuid

from fastapi import APIRouter, status

from app.core.authz import get_classroom_for
from app.core.deps import DB, CurrentUser
from app.modules.classrooms import service
from app.modules.classrooms.models import Classroom
from app.modules.classrooms.schemas import (
    ClassroomCreate,
    ClassroomMemberAdd,
    ClassroomMemberOut,
    ClassroomOut,
)
from app.modules.users.schemas import UserSummary

router = APIRouter(tags=["classrooms"])


@router.post("/classrooms", response_model=ClassroomOut, status_code=status.HTTP_201_CREATED)
def create_classroom(body: ClassroomCreate, user: CurrentUser, db: DB) -> Classroom:
    return service.create_classroom(db, user, body.school_id, body.name, body.academic_year)


@router.get("/schools/{school_id}/classrooms", response_model=list[ClassroomOut])
def list_classrooms(school_id: uuid.UUID, user: CurrentUser, db: DB) -> list[Classroom]:
    return service.list_school_classrooms(db, user, school_id)


@router.get("/classrooms/{classroom_id}", response_model=ClassroomOut)
def get_classroom(classroom_id: uuid.UUID, user: CurrentUser, db: DB) -> Classroom:
    return get_classroom_for(db, user, classroom_id, manage=False)


@router.get("/classrooms/{classroom_id}/members", response_model=list[ClassroomMemberOut])
def list_members(classroom_id: uuid.UUID, user: CurrentUser, db: DB) -> list[ClassroomMemberOut]:
    return [
        ClassroomMemberOut(user=UserSummary.model_validate(u), role=m.membership_role)
        for u, m in service.list_members(db, user, classroom_id)
    ]


@router.post(
    "/classrooms/{classroom_id}/members",
    response_model=ClassroomMemberOut,
    status_code=status.HTTP_201_CREATED,
)
def add_member(
    classroom_id: uuid.UUID, body: ClassroomMemberAdd, user: CurrentUser, db: DB
) -> ClassroomMemberOut:
    u, m = service.add_member(db, user, classroom_id, body.email, body.role)
    return ClassroomMemberOut(user=UserSummary.model_validate(u), role=m.membership_role)
