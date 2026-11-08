"""Local-only helper for the device check: issues ordinary login sessions (the same as signing
in) for the test teacher and student, and lists the page ids to visit. Prints JSON.

Run with the backend's virtualenv from the backend folder:
    cd backend && .venv/bin/python ../tools/device-check/mint_sessions.py
Refuses to run unless EDU3D_ENVIRONMENT is local/development/test.
"""

from __future__ import annotations

import json
import os
import sys

from sqlalchemy import select

from app.core.config import get_settings
from app.core.deps import ACCESS_COOKIE
from app.database.session import session_factory
from app.modules.assessments.models import Assessment
from app.modules.authentication.service import _issue
from app.modules.chapters.models import Chapter
from app.modules.labs.service import list_labs
from app.modules.lessons.models import Lesson
from app.modules.three_d.scenes_service import student_studio_scenes
from app.modules.users.models import User

TEACHER = os.environ.get("DEVICE_CHECK_TEACHER", "teacher@gmail.com")
STUDENT = os.environ.get("DEVICE_CHECK_STUDENT", "student@gmail.com")


def main() -> None:
    env = get_settings().environment
    if env not in ("local", "development", "test"):
        sys.exit(f"Refusing to mint sessions in environment {env!r}.")
    db = session_factory()()
    out: dict[str, object] = {"cookie": ACCESS_COOKIE}
    users = {}
    for role, email in (("teacher", TEACHER), ("student", STUDENT)):
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            sys.exit(f"No user {email}; run make seed-courses first.")
        users[role] = user
        out[f"{role}_token"] = _issue(db, user, "device-check").access_token
    db.commit()

    student = users["student"]
    labs = list_labs(db, student)
    out["labs"] = [{"id": str(lab.id), "kind": lab.kind, "title": lab.title} for lab in labs]
    scenes = student_studio_scenes(db, student)
    out["scene"] = str(scenes[0].scene_id) if scenes else None
    out["lesson"] = str(scenes[0].lesson_id) if scenes else None
    if out["lesson"] is None:
        lesson = db.scalar(select(Lesson).where(Lesson.status == "published").limit(1))
        out["lesson"] = str(lesson.id) if lesson else None
    quiz = db.scalar(
        select(Assessment)
        .join(Chapter, Chapter.id == Assessment.chapter_id)
        .where(Assessment.status == "published", Chapter.status == "published")
        .limit(1)
    )
    out["assessment"] = str(quiz.id) if quiz else None
    print(json.dumps(out))


if __name__ == "__main__":
    main()
