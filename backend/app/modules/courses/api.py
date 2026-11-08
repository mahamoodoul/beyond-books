import uuid

from fastapi import APIRouter, status

from app.core.deps import DB, CurrentUser, Teacher
from app.modules.courses import service
from app.modules.courses.access import resolve_course_access
from app.modules.courses.models import Course
from app.modules.courses.schemas import (
    CourseCreate,
    CourseOut,
    CourseUpdate,
    EnrollmentOut,
    EnrollRequest,
    EnrollResult,
)
from app.modules.users.schemas import UserSummary

router = APIRouter(prefix="/courses", tags=["courses"])


def _out(course: Course, can_manage: bool) -> CourseOut:
    out = CourseOut.model_validate(course)
    return out.model_copy(
        update={"can_manage": can_manage, "join_code": out.join_code if can_manage else None}
    )


@router.post("", response_model=CourseOut, status_code=status.HTTP_201_CREATED)
def create_course(body: CourseCreate, user: Teacher, db: DB) -> CourseOut:
    return _out(service.create_course(db, user, body), True)


@router.get("", response_model=list[CourseOut])
def list_courses(user: CurrentUser, db: DB) -> list[CourseOut]:
    return [_out(c, m) for c, m in service.list_courses(db, user)]


@router.get("/{course_id}", response_model=CourseOut)
def get_course(course_id: uuid.UUID, user: CurrentUser, db: DB) -> CourseOut:
    access = resolve_course_access(db, user, course_id)
    return _out(access.course, access.can_manage)


@router.patch("/{course_id}", response_model=CourseOut)
def update_course(course_id: uuid.UUID, body: CourseUpdate, user: CurrentUser, db: DB) -> CourseOut:
    return _out(service.update_course(db, user, course_id, body), True)


@router.post("/{course_id}/enrollments", response_model=EnrollResult)
def enroll(course_id: uuid.UUID, body: EnrollRequest, user: CurrentUser, db: DB) -> EnrollResult:
    added, existing = service.enroll(db, user, course_id, body.student_email, body.classroom_id)
    return EnrollResult(enrolled=added, already_enrolled=existing)


@router.get("/{course_id}/students", response_model=list[EnrollmentOut])
def list_students(course_id: uuid.UUID, user: CurrentUser, db: DB) -> list[EnrollmentOut]:
    return [
        EnrollmentOut(
            student=UserSummary.model_validate(u),
            classroom_id=e.classroom_id,
            enrolled_at=e.enrolled_at,
        )
        for u, e in service.list_students(db, user, course_id)
    ]


@router.delete("/{course_id}/enrollments/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
def unenroll(course_id: uuid.UUID, student_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    service.unenroll(db, user, course_id, student_id)
