import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.authz import get_classroom_for, require_school_role, school_role
from app.core.errors import ConflictError, NotFoundError
from app.modules.classrooms.models import Classroom, ClassroomMembership, ClassroomRole
from app.modules.operations import audit
from app.modules.organizations.models import SchoolRole
from app.modules.users.models import User
from app.modules.users.repository import get_by_email


def create_classroom(
    db: Session, user: User, school_id: uuid.UUID, name: str, academic_year: str | None
) -> Classroom:
    require_school_role(db, user, school_id, SchoolRole.SCHOOL_ADMIN, SchoolRole.TEACHER)
    classroom = Classroom(
        school_id=school_id, name=name, academic_year=academic_year, created_by=user.id
    )
    db.add(classroom)
    db.flush()
    db.add(
        ClassroomMembership(
            classroom_id=classroom.id, user_id=user.id, membership_role=ClassroomRole.TEACHER
        )
    )
    audit.record(
        db,
        action="classroom.create",
        resource_type="classroom",
        resource_id=classroom.id,
        actor_user_id=user.id,
        school_id=school_id,
    )
    db.commit()
    return classroom


def list_school_classrooms(db: Session, user: User, school_id: uuid.UUID) -> list[Classroom]:
    role = require_school_role(db, user, school_id)
    query = select(Classroom).where(Classroom.school_id == school_id).order_by(Classroom.name)
    if role != SchoolRole.SCHOOL_ADMIN:
        query = query.join(
            ClassroomMembership, ClassroomMembership.classroom_id == Classroom.id
        ).where(ClassroomMembership.user_id == user.id)
    return list(db.scalars(query))


def list_members(
    db: Session, user: User, classroom_id: uuid.UUID
) -> list[tuple[User, ClassroomMembership]]:
    get_classroom_for(db, user, classroom_id, manage=True)
    rows = db.execute(
        select(User, ClassroomMembership)
        .join(ClassroomMembership, ClassroomMembership.user_id == User.id)
        .where(ClassroomMembership.classroom_id == classroom_id)
        .order_by(User.display_name)
    ).all()
    return [(u, m) for u, m in rows]


def add_member(
    db: Session, actor: User, classroom_id: uuid.UUID, email: str, role: ClassroomRole
) -> tuple[User, ClassroomMembership]:
    classroom = get_classroom_for(db, actor, classroom_id, manage=True)
    target = get_by_email(db, email)
    target_school_role = school_role(db, target.id, classroom.school_id) if target else None
    if target is None or target_school_role is None:
        raise NotFoundError("This person is not a member of the classroom's school.")
    expected = SchoolRole.STUDENT if role == ClassroomRole.STUDENT else None
    if expected and target_school_role != expected:
        raise ConflictError("Only school students can join a classroom as students.")
    if role == ClassroomRole.TEACHER and target_school_role == SchoolRole.STUDENT:
        raise ConflictError("Students cannot be classroom teachers.")
    if db.scalar(
        select(ClassroomMembership.id).where(
            ClassroomMembership.classroom_id == classroom_id,
            ClassroomMembership.user_id == target.id,
        )
    ):
        raise ConflictError("This person is already in the classroom.")
    membership = ClassroomMembership(
        classroom_id=classroom_id, user_id=target.id, membership_role=role
    )
    db.add(membership)
    audit.record(
        db,
        action="classroom.member_add",
        resource_type="classroom",
        resource_id=classroom_id,
        actor_user_id=actor.id,
        school_id=classroom.school_id,
        metadata={"member_id": str(target.id), "role": role},
    )
    db.commit()
    return target, membership
