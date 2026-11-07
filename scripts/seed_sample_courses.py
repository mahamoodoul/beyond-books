"""Create the four sample courses (sample-courses/*) for a teacher, ready chapter by chapter.

For each course: create it, upload the excerpt PDF, extract the text, let the configured LLM
propose the chapter outline, and apply it as DRAFT chapters (nothing is published).

Run from backend/ with the app's settings (uses real AI calls when the LLM provider is real):

    cd backend
    EDU3D_ENV_FILE=.env .venv/bin/python ../scripts/seed_sample_courses.py teacher@example.com

Re-running is safe: courses that already exist (same title, same teacher) are skipped.
"""

import sys
from pathlib import Path

from sqlalchemy import select

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.database.session import session_factory  # noqa: E402
from app.integrations.storage import get_storage  # noqa: E402
from app.modules.ai_engine import service as ai  # noqa: E402
from app.modules.courses.models import Course  # noqa: E402
from app.modules.courses.schemas import CourseCreate  # noqa: E402
from app.modules.courses.service import create_course  # noqa: E402
from app.modules.documents import service as documents  # noqa: E402
from app.modules.documents.schemas import UploadUrlRequest  # noqa: E402
from app.modules.users.models import User  # noqa: E402
from app.workers import handlers  # noqa: E402,F401  (registers job handlers)

COURSES = [
    {
        "title": "Biology: Cells and Energy",
        "subject": "Biology",
        "grade_level": "Year 10",
        "description": "How cells are built and how they obtain energy. "
        "Source: OpenStax Concepts of Biology, ch. 3-4 (CC BY-NC-SA 4.0).",
        "pdf": "Biology/Biology - Cells and Energy (Ch 3-4).pdf",
    },
    {
        "title": "Chemistry: Atoms, Molecules and Ions",
        "subject": "Chemistry",
        "grade_level": "Year 10",
        "description": "Atomic structure, molecules, ions and chemical nomenclature. "
        "Source: OpenStax Chemistry 2e, ch. 2 (CC BY-NC-SA 4.0).",
        "pdf": "Chemistry/Chemistry - Atoms, Molecules and Ions (Ch 2).pdf",
    },
    {
        "title": "Mathematics: Expressions and Equations",
        "subject": "Mathematics",
        "grade_level": "Year 9",
        "description": "Writing, solving and graphing equations. "
        "Source: OpenStax Algebra 1, unit 1 (CC BY-NC-SA 4.0).",
        "pdf": "Mathematics/Mathematics - Expressions and Equations (Unit 1).pdf",
    },
    {
        "title": "Physics: Motion and Forces",
        "subject": "Physics",
        "grade_level": "Year 10",
        "description": "Motion in one dimension, acceleration and Newton's laws. "
        "Source: OpenStax Physics, ch. 2-4 (CC BY 4.0).",
        "pdf": "Physics/Physics - Motion and Forces (Ch 2-4).pdf",
    },
]


def seed(email: str) -> None:
    db = session_factory()()
    user = db.scalar(select(User).where(User.email == email))
    if user is None or user.account_type != "teacher":
        raise SystemExit(f"No teacher account {email!r}.")
    for spec in COURSES:
        title = spec["title"]
        if db.scalar(select(Course).where(Course.title == title, Course.created_by == user.id)):
            print(f"skip     {title} (already exists)")
            continue
        path = ROOT / "sample-courses" / spec["pdf"]
        data = path.read_bytes()
        course = create_course(
            db,
            user,
            CourseCreate(
                title=title,
                subject=spec["subject"],
                grade_level=spec["grade_level"],
                description=spec["description"],
            ),
        )
        doc, _ = documents.create_upload(
            db,
            user,
            UploadUrlRequest(
                course_id=course.id,
                filename=path.name,
                mime_type="application/pdf",
                size_bytes=len(data),
                title=path.stem,
            ),
        )
        get_storage().put_bytes(doc.storage_key, data, "application/pdf")
        doc, job = documents.complete_upload(db, user, doc.id)
        db.refresh(job)
        print(f"uploaded {title}: {path.name} ({len(data) / 1048576:.1f} MB), extraction {job.status}")
        job = ai.start_outline(db, user, course.id)
        if job.status != "completed":
            print(f"  outline {job.status}: {job.error_message}")
            continue
        proposal = ai.list_outline_proposals(db, user, course.id)[0]
        chapters = [
            {
                "title": c["title"],
                "description": c["description"],
                "source_refs": c["source_refs"],
                "objectives": [o["text"] for o in c["objectives"]],
            }
            for c in proposal.output["chapters"]
        ]
        created = ai.apply_outline(db, user, proposal.id, chapters)
        print(f"  {len(created)} chapters: " + " | ".join(c.title for c in created))
    db.close()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: seed_sample_courses.py TEACHER_EMAIL")
    seed(sys.argv[1])
