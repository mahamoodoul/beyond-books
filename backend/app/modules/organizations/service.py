import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.authz import require_school_role
from app.core.errors import ConflictError, NotFoundError
from app.modules.operations import audit
from app.modules.organizations.models import School, SchoolMembership, SchoolRole
from app.modules.users.models import AccountType, User
from app.modules.users.repository import get_by_email


def create_school(db: Session, user: User, name: str, slug: str) -> tuple[School, SchoolRole]:
    if db.scalar(select(School.id).where(School.slug == slug)):
        raise ConflictError("A school with this slug already exists.")
    school = School(name=name, slug=slug)
    db.add(school)
    db.flush()
    db.add(SchoolMembership(school_id=school.id, user_id=user.id, role=SchoolRole.SCHOOL_ADMIN))
    audit.record(
        db,
        action="school.create",
        resource_type="school",
        resource_id=school.id,
        actor_user_id=user.id,
        school_id=school.id,
    )
    db.commit()
    return school, SchoolRole.SCHOOL_ADMIN


def list_my_schools(db: Session, user: User) -> list[tuple[School, SchoolRole]]:
    rows = db.execute(
        select(School, SchoolMembership.role)
        .join(SchoolMembership, SchoolMembership.school_id == School.id)
        .where(SchoolMembership.user_id == user.id, SchoolMembership.status == "active")
        .order_by(School.name)
    ).all()
    return [(s, SchoolRole(r)) for s, r in rows]


def get_school(db: Session, user: User, school_id: uuid.UUID) -> tuple[School, SchoolRole]:
    role = require_school_role(db, user, school_id)
    school = db.get(School, school_id)
    if school is None:
        raise NotFoundError()
    return school, role


def list_members(
    db: Session, user: User, school_id: uuid.UUID
) -> list[tuple[User, SchoolMembership]]:
    require_school_role(db, user, school_id, SchoolRole.SCHOOL_ADMIN, SchoolRole.TEACHER)
    rows = db.execute(
        select(User, SchoolMembership)
        .join(SchoolMembership, SchoolMembership.user_id == User.id)
        .where(SchoolMembership.school_id == school_id)
        .order_by(User.display_name)
    ).all()
    return [(u, m) for u, m in rows]


def add_member(
    db: Session, actor: User, school_id: uuid.UUID, email: str, role: SchoolRole
) -> tuple[User, SchoolMembership]:
    require_school_role(db, actor, school_id, SchoolRole.SCHOOL_ADMIN)
    target = get_by_email(db, email)
    if target is None:
        raise NotFoundError("No account exists for this email. Ask the person to register first.")
    if role == SchoolRole.STUDENT and target.account_type != AccountType.STUDENT:
        raise ConflictError("Only student accounts can join as students.")
    if role != SchoolRole.STUDENT and target.account_type != AccountType.TEACHER:
        raise ConflictError("Student accounts can only join as students.")
    existing = db.scalar(
        select(SchoolMembership).where(
            SchoolMembership.school_id == school_id, SchoolMembership.user_id == target.id
        )
    )
    if existing:
        raise ConflictError("This person is already a member of the school.")
    membership = SchoolMembership(school_id=school_id, user_id=target.id, role=role)
    db.add(membership)
    audit.record(
        db,
        action="school.member_add",
        resource_type="school",
        resource_id=school_id,
        actor_user_id=actor.id,
        school_id=school_id,
        metadata={"member_id": str(target.id), "role": role},
    )
    db.commit()
    return target, membership
