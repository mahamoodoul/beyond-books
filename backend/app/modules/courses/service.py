import uuid

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.authz import get_classroom_for, require_school_role, school_role
from app.core.errors import ConflictError, NotFoundError
from app.modules.classrooms.models import ClassroomMembership, ClassroomRole
from app.modules.courses.access import get_course_for
from app.modules.courses.models import Course, CourseEnrollment, CourseStatus
from app.modules.courses.schemas import CourseCreate, CourseUpdate
from app.modules.operations import audit
from app.modules.organizations.models import SchoolMembership, SchoolRole
from app.modules.users.models import AccountType, User
from app.modules.users.repository import get_by_email


def create_course(db: Session, user: User, body: CourseCreate) -> Course:
    if body.school_id:
        require_school_role(db, user, body.school_id, SchoolRole.SCHOOL_ADMIN, SchoolRole.TEACHER)
    from app.modules.join_codes.service import new_code

    course = Course(created_by=user.id, join_code=new_code(db), **body.model_dump())
    db.add(course)
    db.flush()
    audit.record(
        db,
        action="course.create",
        resource_type="course",
        resource_id=course.id,
        actor_user_id=user.id,
        school_id=course.school_id,
    )
    db.commit()
    return course


def list_courses(db: Session, user: User) -> list[tuple[Course, bool]]:
    if user.account_type == AccountType.TEACHER:
        admin_schools = select(SchoolMembership.school_id).where(
            SchoolMembership.user_id == user.id,
            SchoolMembership.role == SchoolRole.SCHOOL_ADMIN,
            SchoolMembership.status == "active",
        )
        rows = db.scalars(
            select(Course)
            .where(or_(Course.created_by == user.id, Course.school_id.in_(admin_schools)))
            .where(Course.status != CourseStatus.ARCHIVED)
            .order_by(Course.updated_at.desc())
        )
        return [(c, True) for c in rows]
    rows = db.scalars(
        select(Course)
        .join(CourseEnrollment, CourseEnrollment.course_id == Course.id)
        .where(
            CourseEnrollment.student_id == user.id,
            CourseEnrollment.status == "active",
            Course.status == CourseStatus.PUBLISHED,
        )
        .order_by(Course.title)
    )
    return [(c, False) for c in rows]


def update_course(db: Session, user: User, course_id: uuid.UUID, body: CourseUpdate) -> Course:
    course = get_course_for(db, user, course_id, manage=True)
    changes = body.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(course, k, v)
    if "status" in changes:
        audit.record(
            db,
            action=f"course.status.{changes['status']}",
            resource_type="course",
            resource_id=course.id,
            actor_user_id=user.id,
            school_id=course.school_id,
        )
    db.commit()
    return course


def _enroll_one(db: Session, course: Course, student: User, classroom_id: uuid.UUID | None) -> bool:
    if student.account_type != AccountType.STUDENT:
        raise ConflictError("Only student accounts can be enrolled.")
    if course.school_id and school_role(db, student.id, course.school_id) != SchoolRole.STUDENT:
        raise NotFoundError("This student is not a member of the course's school.")
    existing = db.scalar(
        select(CourseEnrollment).where(
            CourseEnrollment.course_id == course.id, CourseEnrollment.student_id == student.id
        )
    )
    if existing:
        if existing.status == "active":
            return False
        existing.status = "active"
        return True
    db.add(CourseEnrollment(course_id=course.id, student_id=student.id, classroom_id=classroom_id))
    return True


def enroll(
    db: Session,
    user: User,
    course_id: uuid.UUID,
    student_email: str | None,
    classroom_id: uuid.UUID | None,
) -> tuple[int, int]:
    course = get_course_for(db, user, course_id, manage=True)
    students: list[User]
    if student_email:
        student = get_by_email(db, student_email)
        if student is None:
            raise NotFoundError("No student account exists for this email.")
        students = [student]
    else:
        assert classroom_id is not None
        classroom = get_classroom_for(db, user, classroom_id, manage=True)
        if course.school_id != classroom.school_id:
            raise ConflictError("The classroom belongs to a different school than the course.")
        students = list(
            db.scalars(
                select(User)
                .join(ClassroomMembership, ClassroomMembership.user_id == User.id)
                .where(
                    ClassroomMembership.classroom_id == classroom_id,
                    ClassroomMembership.membership_role == ClassroomRole.STUDENT,
                    ClassroomMembership.status == "active",
                )
            )
        )
    added = sum(_enroll_one(db, course, s, classroom_id) for s in students)
    audit.record(
        db,
        action="course.enroll",
        resource_type="course",
        resource_id=course.id,
        actor_user_id=user.id,
        school_id=course.school_id,
        metadata={"added": added, "classroom_id": str(classroom_id or "")},
    )
    db.commit()
    return added, len(students) - added


def list_students(
    db: Session, user: User, course_id: uuid.UUID
) -> list[tuple[User, CourseEnrollment]]:
    get_course_for(db, user, course_id, manage=True)
    rows = db.execute(
        select(User, CourseEnrollment)
        .join(CourseEnrollment, CourseEnrollment.student_id == User.id)
        .where(CourseEnrollment.course_id == course_id, CourseEnrollment.status == "active")
        .order_by(User.display_name)
    ).all()
    return [(u, e) for u, e in rows]


def unenroll(db: Session, user: User, course_id: uuid.UUID, student_id: uuid.UUID) -> None:
    course = get_course_for(db, user, course_id, manage=True)
    enrollment = db.scalar(
        select(CourseEnrollment).where(
            CourseEnrollment.course_id == course_id, CourseEnrollment.student_id == student_id
        )
    )
    if enrollment is None:
        raise NotFoundError()
    enrollment.status = "removed"
    audit.record(
        db,
        action="course.unenroll",
        resource_type="course",
        resource_id=course.id,
        actor_user_id=user.id,
        school_id=course.school_id,
        metadata={"student_id": str(student_id)},
    )
    db.commit()
