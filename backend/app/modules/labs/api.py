import uuid

from fastapi import APIRouter, status

from app.core.deps import DB, CurrentUser, Teacher
from app.modules.labs import service
from app.modules.labs.schemas import (
    LabCreate,
    LabKindOut,
    LabOut,
    LabSummary,
    LabUpdate,
    SessionPut,
    SessionResult,
    StudentSessionRow,
)

router = APIRouter(tags=["labs"])


@router.get("/labs/kinds", response_model=list[LabKindOut])
def lab_kinds(user: CurrentUser) -> list[LabKindOut]:
    """The kinds of lab that can be created, with their default settings and choices."""
    return service.lab_kinds()


@router.post("/labs", response_model=LabOut, status_code=status.HTTP_201_CREATED)
def create_standalone_lab(body: LabCreate, user: Teacher, db: DB) -> LabOut:
    """Create a lab, optionally in a course (body.course_id); without one it is standalone and,
    once published, open to the students of your courses and schools."""
    lab = service.create_lab(db, user, body.course_id, body)
    return service.to_out(db, user, lab, True)


@router.post(
    "/courses/{course_id}/labs", response_model=LabOut, status_code=status.HTTP_201_CREATED
)
def create_lab(course_id: uuid.UUID, body: LabCreate, user: Teacher, db: DB) -> LabOut:
    """Create a lab in a course you manage (draft until published)."""
    lab = service.create_lab(db, user, course_id, body)
    return service.to_out(db, user, lab, True)


@router.get("/labs", response_model=list[LabOut])
def list_labs(user: CurrentUser, db: DB) -> list[LabOut]:
    """Teachers: labs in their courses. Students: published labs in their courses."""
    return service.list_labs(db, user)


@router.get("/chapters/{chapter_id}/labs", response_model=list[LabSummary])
def chapter_labs(chapter_id: uuid.UUID, user: CurrentUser, db: DB) -> list[LabSummary]:
    return service.list_for_chapter(db, user, chapter_id)


@router.get("/labs/{lab_id}", response_model=LabOut)
def get_lab(lab_id: uuid.UUID, user: CurrentUser, db: DB) -> LabOut:
    return service.get_lab(db, user, lab_id)


@router.patch("/labs/{lab_id}", response_model=LabOut)
def update_lab(lab_id: uuid.UUID, body: LabUpdate, user: Teacher, db: DB) -> LabOut:
    lab = service.update_lab(db, user, lab_id, body)
    return service.to_out(db, user, lab, True)


@router.delete("/labs/{lab_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lab(lab_id: uuid.UUID, user: Teacher, db: DB) -> None:
    service.delete_lab(db, user, lab_id)


@router.put("/labs/{lab_id}/session", response_model=SessionResult)
def put_session(lab_id: uuid.UUID, body: SessionPut, user: CurrentUser, db: DB) -> SessionResult:
    """Save the student's current state and get its evaluation. Teachers trying the lab get
    the evaluation back without anything being stored."""
    return service.put_session(db, user, lab_id, body.state)


@router.get("/labs/{lab_id}/sessions", response_model=list[StudentSessionRow])
def lab_sessions(lab_id: uuid.UUID, user: Teacher, db: DB) -> list[StudentSessionRow]:
    """Every student's latest state for this lab, most recent activity first."""
    return service.list_sessions(db, user, lab_id)
