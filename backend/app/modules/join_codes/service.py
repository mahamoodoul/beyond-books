"""Join codes: 6 characters from an unambiguous alphabet, shown as XXX-XXX. Every school and
course has one. Anyone with the code can see what it unlocks (name only) and join it: a school
code makes a teacher a teacher of the school and a student a student of it; a course code enrols
a student (and adds them to the course's school when it has one) and, for a teacher, joins the
course's school."""

from __future__ import annotations

import re
import secrets
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.authz import require_school_role
from app.core.errors import AppError, ConflictError, NotFoundError
from app.modules.courses.access import can_manage_course
from app.modules.courses.models import Course, CourseEnrollment, CourseStatus
from app.modules.join_codes.schemas import (
    AffiliationCourse,
    Affiliations,
    AffiliationSchool,
    JoinPreview,
    JoinResult,
)
from app.modules.operations import audit
from app.modules.organizations.models import School, SchoolMembership, SchoolRole
from app.modules.users.models import AccountType, User

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # generated codes avoid 0/O and 1/I
CODE_LEN = 16  # 32^16 ≈ 10^24 combinations: unguessable even with the lookup rate limit
VALID = re.compile(r"^[A-Z0-9]{16}$")


class InvalidCodeError(AppError):
    status_code = 400
    code = "INVALID_JOIN_CODE"
    message = "A join code has 16 letters and digits (dashes and spaces are optional)."


def normalise(code: str) -> str:
    """Upper-case letters and digits only: dashes, spaces and case are ignored."""
    return "".join(ch for ch in (code or "").upper() if ch.isalnum() and ch.isascii())


def check_format(code: str) -> str:
    """The normalised code, or InvalidCodeError (400) before any database lookup."""
    c = normalise(code)
    if not VALID.match(c):
        raise InvalidCodeError()
    return c


def pretty(code: str) -> str:
    """ABCD-EFGH-JKLM-NPQR: groups of four, easier to read out and type."""
    c = normalise(code)
    return "-".join(c[i : i + 4] for i in range(0, len(c), 4)) if len(c) == CODE_LEN else c


def new_code(db: Session) -> str:
    """A fresh code not used by any school or course (stored without dashes)."""
    for _ in range(50):
        code = "".join(secrets.choice(ALPHABET) for _ in range(CODE_LEN))
        taken = db.scalar(select(School.id).where(School.join_code == code)) or db.scalar(
            select(Course.id).where(Course.join_code == code)
        )
        if not taken:
            return code
    raise RuntimeError("Could not generate a unique join code.")


def _find(db: Session, code: str) -> School | Course:
    c = check_format(code)
    school = db.scalar(select(School).where(School.join_code == c, School.status == "active"))
    if school is not None:
        return school
    course = db.scalar(
        select(Course).where(Course.join_code == c, Course.status != CourseStatus.ARCHIVED)
    )
    if course is not None:
        return course
    raise NotFoundError("Unknown code. Check it with your teacher and try again.")


def lookup(db: Session, code: str) -> JoinPreview:
    target = _find(db, code)
    if isinstance(target, School):
        return JoinPreview(
            code=pretty(target.join_code or ""),
            kind="school",
            id=target.id,
            name=target.name,
            as_teacher=f"You join {target.name} as a teacher.",
            as_student=f"You join {target.name} as a student.",
        )
    school = db.get(School, target.school_id) if target.school_id else None
    owner = db.get(User, target.created_by)
    student_text = f"You are enrolled in “{target.title}”"
    student_text += f" and join {school.name} as a student." if school else "."
    teacher_text = (
        f"You join {school.name} as a teacher (the course stays {owner.display_name}’s)."
        if school and owner
        else "This is a course code: ask the course owner for a school code to join as a teacher."
    )
    return JoinPreview(
        code=pretty(target.join_code or ""),
        kind="course",
        id=target.id,
        name=target.title,
        school_name=school.name if school else None,
        teacher_name=owner.display_name if owner else None,
        subject=target.subject,
        grade_level=target.grade_level,
        as_teacher=teacher_text,
        as_student=student_text,
    )


def _join_school(db: Session, user: User, school: School, role: SchoolRole) -> bool:
    existing = db.scalar(
        select(SchoolMembership).where(
            SchoolMembership.school_id == school.id, SchoolMembership.user_id == user.id
        )
    )
    if existing is not None:
        if existing.status != "active":
            existing.status = "active"
            return True
        return False
    db.add(SchoolMembership(school_id=school.id, user_id=user.id, role=role))
    audit.record(
        db,
        action="school.join_by_code",
        resource_type="school",
        resource_id=school.id,
        actor_user_id=user.id,
        school_id=school.id,
        metadata={"role": role},
    )
    return True


def _enrol(db: Session, user: User, course: Course) -> bool:
    existing = db.scalar(
        select(CourseEnrollment).where(
            CourseEnrollment.course_id == course.id, CourseEnrollment.student_id == user.id
        )
    )
    if existing is not None:
        if existing.status != "active":
            existing.status = "active"
            return True
        return False
    db.add(CourseEnrollment(course_id=course.id, student_id=user.id))
    audit.record(
        db,
        action="course.join_by_code",
        resource_type="course",
        resource_id=course.id,
        actor_user_id=user.id,
        school_id=course.school_id,
    )
    return True


def apply(db: Session, user: User, preview: JoinPreview) -> JoinResult:
    """Join what the code unlocks. Idempotent: joining twice changes nothing."""
    joined: list[str] = []
    if preview.kind == "school":
        school = db.get(School, preview.id)
        if school is None:
            raise NotFoundError("Unknown code.")
        role = (
            SchoolRole.TEACHER if user.account_type == AccountType.TEACHER else SchoolRole.STUDENT
        )
        if _join_school(db, user, school, role):
            joined.append(f"Joined {school.name} as a {role.value.replace('_', ' ')}.")
        else:
            joined.append(f"Already a member of {school.name}.")
        db.flush()
        return JoinResult(kind="school", name=school.name, joined=joined)
    course = db.get(Course, preview.id)
    if course is None:
        raise NotFoundError("Unknown code.")
    school = db.get(School, course.school_id) if course.school_id else None
    if user.account_type == AccountType.STUDENT:
        if school is not None and _join_school(db, user, school, SchoolRole.STUDENT):
            joined.append(f"Joined {school.name} as a student.")
        if _enrol(db, user, course):
            joined.append(f"Enrolled in “{course.title}”.")
        else:
            joined.append(f"Already enrolled in “{course.title}”.")
    else:
        if school is None:
            raise ConflictError(
                "This is a course code. Teachers join through a school code; ask the course "
                "owner to share the school's code."
            )
        if _join_school(db, user, school, SchoolRole.TEACHER):
            joined.append(f"Joined {school.name} as a teacher.")
        else:
            joined.append(f"Already a member of {school.name}.")
    db.flush()
    return JoinResult(kind="course", name=course.title, joined=joined)


def join(db: Session, user: User, code: str) -> JoinResult:
    result = apply(db, user, lookup(db, code))
    db.commit()
    return result


def regenerate_school_code(db: Session, user: User, school_id: uuid.UUID) -> str:
    require_school_role(db, user, school_id, SchoolRole.SCHOOL_ADMIN, SchoolRole.TEACHER)
    school = db.get(School, school_id)
    if school is None:
        raise NotFoundError()
    school.join_code = new_code(db)
    db.commit()
    return pretty(school.join_code)


def regenerate_course_code(db: Session, user: User, course_id: uuid.UUID) -> str:
    course = db.get(Course, course_id)
    if course is None or not can_manage_course(db, user, course):
        raise NotFoundError()
    course.join_code = new_code(db)
    db.commit()
    return pretty(course.join_code)


def affiliations(db: Session, user: User) -> Affiliations:
    schools = []
    for school, role in db.execute(
        select(School, SchoolMembership.role)
        .join(SchoolMembership, SchoolMembership.school_id == School.id)
        .where(SchoolMembership.user_id == user.id, SchoolMembership.status == "active")
        .order_by(School.name)
    ).all():
        manager = role in (SchoolRole.SCHOOL_ADMIN, SchoolRole.TEACHER)
        schools.append(
            AffiliationSchool(
                id=school.id,
                name=school.name,
                role=str(role).replace("_", " "),
                join_code=pretty(school.join_code) if manager and school.join_code else None,
            )
        )
    courses: list[AffiliationCourse] = []
    if user.account_type == AccountType.TEACHER:
        rows = db.scalars(
            select(Course)
            .where(Course.created_by == user.id, Course.status != CourseStatus.ARCHIVED)
            .order_by(Course.title)
        )
        for c in rows:
            course_school = db.get(School, c.school_id) if c.school_id else None
            courses.append(
                AffiliationCourse(
                    id=c.id,
                    title=c.title,
                    role="teacher",
                    status=c.status,
                    subject=c.subject,
                    school_name=course_school.name if course_school else None,
                    join_code=pretty(c.join_code) if c.join_code else None,
                )
            )
    else:
        rows = db.scalars(
            select(Course)
            .join(CourseEnrollment, CourseEnrollment.course_id == Course.id)
            .where(CourseEnrollment.student_id == user.id, CourseEnrollment.status == "active")
            .order_by(Course.title)
        )
        for c in rows:
            course_school = db.get(School, c.school_id) if c.school_id else None
            courses.append(
                AffiliationCourse(
                    id=c.id,
                    title=c.title,
                    role="student",
                    status=c.status,
                    subject=c.subject,
                    school_name=course_school.name if course_school else None,
                )
            )
    return Affiliations(schools=schools, courses=courses)
