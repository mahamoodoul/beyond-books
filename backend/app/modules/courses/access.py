"""Course-level authorization. Every course-scoped object (documents, chapters, lessons, jobs)
resolves its course and goes through here."""

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.authz import school_role
from app.core.errors import NotFoundError, PermissionDeniedError
from app.modules.courses.models import Course, CourseEnrollment, CourseStatus
from app.modules.organizations.models import SchoolRole
from app.modules.users.models import User


@dataclass(frozen=True)
class CourseAccess:
    course: Course
    can_manage: bool


def can_manage_course(db: Session, user: User, course: Course) -> bool:
    if course.created_by == user.id:
        return True
    return (
        course.school_id is not None
        and school_role(db, user.id, course.school_id) == SchoolRole.SCHOOL_ADMIN
    )


def is_enrolled(db: Session, user_id: uuid.UUID, course_id: uuid.UUID) -> bool:
    return (
        db.scalar(
            select(CourseEnrollment.id).where(
                CourseEnrollment.course_id == course_id,
                CourseEnrollment.student_id == user_id,
                CourseEnrollment.status == "active",
            )
        )
        is not None
    )


def resolve_course_access(db: Session, user: User, course_id: uuid.UUID) -> CourseAccess:
    course = db.get(Course, course_id)
    if course is None:
        raise NotFoundError()
    if can_manage_course(db, user, course):
        return CourseAccess(course, True)
    if course.status == CourseStatus.PUBLISHED and is_enrolled(db, user.id, course.id):
        return CourseAccess(course, False)
    raise NotFoundError()


def get_course_for(db: Session, user: User, course_id: uuid.UUID, *, manage: bool) -> Course:
    access = resolve_course_access(db, user, course_id)
    if manage and not access.can_manage:
        raise PermissionDeniedError()
    return access.course
