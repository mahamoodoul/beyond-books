"""Give the fixed demo logins access to every course. Local databases only; safe to repeat.

  - creates the two accounts behind the login page's demo buttons if they are missing;
  - teacher: school admin of every school that has courses, and courses without a school move
    into the demo school, so the normal school-admin rule gives full control of all of them;
  - student: enrolled in every published course (drafts stay hidden from students by design).

Courses created later need another run. Not part of the automatic seed on purpose: on a public
deployment it would hand the shared demo teacher control of real teachers' courses.

    cd backend && EDU3D_ENV_FILE=.env .venv/bin/python ../scripts/grant_demo_access.py
"""

import argparse

import course_seed  # puts the backend on sys.path and registers every model
from app.core.config import get_settings
from app.database.session import session_factory
from app.modules.courses.models import Course, CourseEnrollment, CourseStatus
from app.modules.organizations.models import School, SchoolMembership, SchoolRole
from sqlalchemy import select

TEACHER = ("teacher@example.com", "teacher-demo-123")
STUDENT = ("student@example.com", "student-demo-123")
DEMO_SCHOOL = "Beyond Books Demo School"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--force", action="store_true", help="run outside a local environment"
    )
    args = ap.parse_args()
    env = get_settings().environment
    if env != "local" and not args.force:
        print(f"Refusing to run in environment {env!r} (use --force if you are sure).")
        return 1

    db = session_factory()()
    try:
        teacher_id = course_seed._ensure_account(db, *TEACHER, "teacher")
        student_id = course_seed._ensure_account(db, *STUDENT, "student")
        courses = list(
            db.scalars(select(Course).where(Course.status != CourseStatus.ARCHIVED))
        )

        school = db.scalar(select(School).where(School.name == DEMO_SCHOOL))
        if school is None:
            raise SystemExit(
                f"School {DEMO_SCHOOL!r} not found; run scripts/seed_students.py first."
            )
        for course in courses:
            if course.school_id is None:
                course.school_id = school.id
                print(f"moved into {DEMO_SCHOOL}: {course.title}")

        for school_id in {c.school_id for c in courses}:
            member = db.scalar(
                select(SchoolMembership).where(
                    SchoolMembership.school_id == school_id,
                    SchoolMembership.user_id == teacher_id,
                )
            )
            if member is None:
                member = SchoolMembership(
                    school_id=school_id, user_id=teacher_id, role=""
                )
                db.add(member)
            member.role = SchoolRole.SCHOOL_ADMIN
            member.status = "active"

        published = [c for c in courses if c.status == CourseStatus.PUBLISHED]
        for course in published:
            enrollment = db.scalar(
                select(CourseEnrollment).where(
                    CourseEnrollment.course_id == course.id,
                    CourseEnrollment.student_id == student_id,
                )
            )
            if enrollment is None:
                db.add(CourseEnrollment(course_id=course.id, student_id=student_id))
            else:
                enrollment.status = "active"
        db.commit()
        print(f"{TEACHER[0]}: full control of {len(courses)} courses")
        print(f"{STUDENT[0]}: enrolled in {len(published)} published courses")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
