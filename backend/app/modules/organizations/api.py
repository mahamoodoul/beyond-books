import uuid

from fastapi import APIRouter, status

from app.core.deps import DB, CurrentUser, Teacher
from app.modules.organizations import service
from app.modules.organizations.schemas import (
    SchoolCreate,
    SchoolMemberAdd,
    SchoolMemberOut,
    SchoolOut,
)
from app.modules.users.schemas import UserSummary

router = APIRouter(prefix="/schools", tags=["schools"])


def _out(school: object, role: object) -> SchoolOut:
    out = SchoolOut.model_validate(school)
    return out.model_copy(update={"my_role": role})


@router.post("", response_model=SchoolOut, status_code=status.HTTP_201_CREATED)
def create_school(body: SchoolCreate, user: Teacher, db: DB) -> SchoolOut:
    return _out(*service.create_school(db, user, body.name, body.slug))


@router.get("", response_model=list[SchoolOut])
def list_schools(user: CurrentUser, db: DB) -> list[SchoolOut]:
    return [_out(s, r) for s, r in service.list_my_schools(db, user)]


@router.get("/{school_id}", response_model=SchoolOut)
def get_school(school_id: uuid.UUID, user: CurrentUser, db: DB) -> SchoolOut:
    return _out(*service.get_school(db, user, school_id))


@router.get("/{school_id}/members", response_model=list[SchoolMemberOut])
def list_members(school_id: uuid.UUID, user: CurrentUser, db: DB) -> list[SchoolMemberOut]:
    return [
        SchoolMemberOut(user=UserSummary.model_validate(u), role=m.role, joined_at=m.joined_at)
        for u, m in service.list_members(db, user, school_id)
    ]


@router.post(
    "/{school_id}/members", response_model=SchoolMemberOut, status_code=status.HTTP_201_CREATED
)
def add_member(
    school_id: uuid.UUID, body: SchoolMemberAdd, user: CurrentUser, db: DB
) -> SchoolMemberOut:
    u, m = service.add_member(db, user, school_id, body.email, body.role)
    return SchoolMemberOut(user=UserSummary.model_validate(u), role=m.role, joined_at=m.joined_at)
