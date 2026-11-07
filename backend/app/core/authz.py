"""Central object-level authorization helpers (design §12 "Authorization").

Rule of thumb: if the caller may not even know a resource exists, raise NotFoundError
(prevents ID enumeration / IDOR probing). If they can see it but not change it, raise
PermissionDeniedError.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError, PermissionDeniedError
from app.modules.classrooms.models import Classroom, ClassroomMembership, ClassroomRole
from app.modules.organizations.models import SchoolMembership, SchoolRole
from app.modules.users.models import User


def school_role(db: Session, user_id: uuid.UUID, school_id: uuid.UUID) -> SchoolRole | None:
    role = db.scalar(
        select(SchoolMembership.role).where(
            SchoolMembership.school_id == school_id,
            SchoolMembership.user_id == user_id,
            SchoolMembership.status == "active",
        )
    )
    return SchoolRole(role) if role else None


def require_school_role(
    db: Session, user: User, school_id: uuid.UUID, *allowed: SchoolRole
) -> SchoolRole:
    role = school_role(db, user.id, school_id)
    if role is None:
        raise NotFoundError()
    if allowed and role not in allowed:
        raise PermissionDeniedError()
    return role


def classroom_role(
    db: Session, user_id: uuid.UUID, classroom_id: uuid.UUID
) -> ClassroomRole | None:
    role = db.scalar(
        select(ClassroomMembership.membership_role).where(
            ClassroomMembership.classroom_id == classroom_id,
            ClassroomMembership.user_id == user_id,
            ClassroomMembership.status == "active",
        )
    )
    return ClassroomRole(role) if role else None


def get_classroom_for(
    db: Session, user: User, classroom_id: uuid.UUID, *, manage: bool
) -> Classroom:
    """Return the classroom if `user` may view it (or manage it when manage=True)."""
    classroom = db.get(Classroom, classroom_id)
    if classroom is None:
        raise NotFoundError()
    s_role = school_role(db, user.id, classroom.school_id)
    c_role = classroom_role(db, user.id, classroom.id)
    can_manage = s_role == SchoolRole.SCHOOL_ADMIN or c_role == ClassroomRole.TEACHER
    can_view = can_manage or c_role == ClassroomRole.STUDENT
    if not can_view:
        raise NotFoundError()
    if manage and not can_manage:
        raise PermissionDeniedError()
    return classroom
