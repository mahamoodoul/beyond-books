import uuid

from fastapi import APIRouter, Query, Request

from app.core.deps import DB, CurrentUser, Teacher
from app.core.rate_limit import check_join_lookup_rate
from app.modules.join_codes import service
from app.modules.join_codes.schemas import Affiliations, JoinPreview, JoinRequest, JoinResult

router = APIRouter(tags=["join-codes"])


@router.get("/join-codes", response_model=JoinPreview)
def preview_code(
    request: Request, db: DB, code: str = Query(min_length=16, max_length=24)
) -> JoinPreview:
    """What a school or course code unlocks. Public, so the sign-up form can show it before
    the account exists; rate limited per IP."""
    check_join_lookup_rate(request.client.host if request.client else "?")
    return service.lookup(db, code)


@router.post("/users/me/join", response_model=JoinResult)
def join_with_code(body: JoinRequest, user: CurrentUser, db: DB) -> JoinResult:
    """Join the school or course behind a code with the signed-in account."""
    return service.join(db, user, body.code)


@router.get("/users/me/affiliations", response_model=Affiliations)
def my_affiliations(user: CurrentUser, db: DB) -> Affiliations:
    """The caller's schools (with role) and courses (teaching or enrolled), with the codes the
    caller may share."""
    return service.affiliations(db, user)


@router.post("/schools/{school_id}/join-code", response_model=dict[str, str])
def regenerate_school_code(school_id: uuid.UUID, user: Teacher, db: DB) -> dict[str, str]:
    """Replace the school's code (the old one stops working)."""
    return {"join_code": service.regenerate_school_code(db, user, school_id)}


@router.post("/courses/{course_id}/join-code", response_model=dict[str, str])
def regenerate_course_code(course_id: uuid.UUID, user: Teacher, db: DB) -> dict[str, str]:
    """Replace the course's code (the old one stops working)."""
    return {"join_code": service.regenerate_course_code(db, user, course_id)}
