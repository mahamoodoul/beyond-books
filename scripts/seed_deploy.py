"""Load the shared demo data into a deployment's database (idempotent, no AI calls).

Runs at API start when EDU3D_SEED_DEMO_DATA=true (on by default in docker-compose.coolify.yml)
and locally with `make seed-demo`. Safe to repeat: whatever is already there is skipped.

  1. the shared courses (seeds/courses) for the demo teacher, with their PDFs and 3D models;
  2. the demo student, enrolled in those courses;
  3. demo students with a few weeks of activity, so the teacher's analytics have data.

The accounts default to the ones behind the login page's "Use the demo account" buttons:

  SEED_TEACHER_EMAIL / SEED_TEACHER_PASSWORD   teacher@example.com / teacher-demo-123
  SEED_STUDENT_EMAIL / SEED_STUDENT_PASSWORD   student@example.com / student-demo-123
                                               (SEED_STUDENT_EMAIL=none: no demo student)
  SEED_DEMO_STUDENTS                           50 analytics students (0 = none)

A password is only used when its account is created and needs 12+ characters.

    cd backend && .venv/bin/python ../scripts/seed_deploy.py      # or: make seed-demo
"""

import os
import sys

import course_seed  # puts the backend on sys.path and registers every model
import seed_students
from app.database.session import session_factory


def _env(name: str, default: str) -> str:
    return (os.environ.get(name) or default).strip()


def main() -> int:
    teacher = _env("SEED_TEACHER_EMAIL", "teacher@example.com")
    teacher_password = _env("SEED_TEACHER_PASSWORD", "teacher-demo-123")
    student = _env("SEED_STUDENT_EMAIL", "student@example.com")
    student_password = _env("SEED_STUDENT_PASSWORD", "student-demo-123")
    if student.lower() == "none":
        student = ""
    try:
        count = max(0, int(_env("SEED_DEMO_STUDENTS", "50")))
    except ValueError:
        count = 50

    # Report and carry on: a seeding problem must never stop the API from starting.
    print(f"[seed] shared courses for {teacher}; demo student: {student or 'none'}", flush=True)
    try:
        course_seed.load(teacher, teacher_password, student or None, student_password)
    except (Exception, SystemExit) as exc:
        print(f"[seed] courses not loaded: {exc}", file=sys.stderr, flush=True)
        return 1

    if count:
        print(f"[seed] {count} demo students with activity", flush=True)
        db = session_factory()()
        try:
            seed_students.run(db, teacher, count)
        except (Exception, SystemExit) as exc:
            db.rollback()
            print(f"[seed] demo students not added: {exc}", file=sys.stderr, flush=True)
            return 1
        finally:
            db.close()
    print("[seed] demo data ready", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
