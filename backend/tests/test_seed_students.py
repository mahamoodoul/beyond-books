"""scripts/seed_students.py: demo school, classroom, students and activity for the analytics."""

import sys
from collections.abc import Callable
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.conftest import new_client
from tests.helpers import create_course
from tests.test_assessments import QUESTIONS

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import seed_students  # noqa: E402

Login = Callable[..., TestClient]
BODY = {"sections": [{"title": "S", "body_markdown": "Some text."}]}


def _published_course_with_quiz(t: TestClient) -> str:
    cid = create_course(t)
    for i in range(2):
        ch = t.post(f"/api/v1/courses/{cid}/chapters", json={"title": f"C{i}"}).json()["id"]
        t.patch(f"/api/v1/chapters/{ch}", json={"status": "published"})
        lid = t.post(
            f"/api/v1/chapters/{ch}/lessons", json={"title": f"L{i}", "content": BODY}
        ).json()["id"]
        t.post(f"/api/v1/lessons/{lid}/publish")
        a = t.post(f"/api/v1/chapters/{ch}/assessments", json={"title": f"Quiz {i}"}).json()
        qs = [{**q, "lesson_id": lid} for q in QUESTIONS]
        r = t.put(
            f"/api/v1/assessments/{a['id']}/questions",
            json={"expected_version": a["version"], "content": {"questions": qs}},
        )
        assert r.status_code == 200, r.text
        assert t.post(f"/api/v1/assessments/{a['id']}/publish").status_code == 200
    t.patch(f"/api/v1/courses/{cid}", json={"status": "published"})
    return str(cid)


def test_seed_creates_school_students_and_activity(login: Login, db: Session) -> None:
    t = login("teacher@example.com")
    cid = _published_course_with_quiz(t)
    draft = create_course(t)  # drafts get enrolments but no activity

    totals = seed_students.run(db, "teacher@example.com", count=12, seed=3)
    stats = next(iter(totals["courses"].values()))
    assert stats["students"] >= 8 and stats["lessons"] > 0 and stats["attempts"] > 0

    # School + classroom with everyone in them, courses linked to the school.
    schools = t.get("/api/v1/schools").json()
    school = next(s for s in schools if s["name"] == seed_students.SCHOOL_NAME)
    members = t.get(f"/api/v1/schools/{school['id']}/members").json()
    assert sum(m["role"] == "student" for m in members) == 12
    assert t.get(f"/api/v1/courses/{cid}").json()["school_id"] == school["id"]
    assert t.get(f"/api/v1/courses/{draft}").json()["school_id"] == school["id"]
    assert len(t.get(f"/api/v1/courses/{cid}/students").json()) == 12
    assert len(t.get(f"/api/v1/courses/{draft}/students").json()) == 12

    # The teacher's analytics and progress pages have data.
    analytics = t.get(f"/api/v1/courses/{cid}/analytics").json()
    assert analytics["enrolled"] == 12
    assert any(lesson["completed"] > 0 for lesson in analytics["lessons"])
    assert any(a["students_attempted"] > 0 for a in analytics["assessments"])
    rows = t.get(f"/api/v1/courses/{cid}/progress").json()
    assert len(rows) == 12 and any(r["completed_lessons"] > 0 for r in rows)

    # A demo student can sign in and sees their own progress.
    s = new_client()
    r = s.post(
        "/api/v1/auth/login",
        json={"email": seed_students.student_email(1), "password": seed_students.DEFAULT_PASSWORD},
    )
    assert r.status_code == 200, r.text
    outline = s.get(f"/api/v1/courses/{cid}/outline").json()
    assert outline["total_lessons"] == 2

    # Re-running changes nothing; --reset regenerates the same data for the same seed.
    again = seed_students.run(db, "teacher@example.com", count=12, seed=3)
    assert next(iter(again["courses"].values()))["students"] == 0
    reset = seed_students.run(db, "teacher@example.com", count=12, seed=3, do_reset=True)
    assert next(iter(reset["courses"].values())) == stats
    assert (
        sum(m["role"] == "student" for m in t.get(f"/api/v1/schools/{school['id']}/members").json())
        == 12
    )
