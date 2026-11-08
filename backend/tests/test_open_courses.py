"""Courses a teacher opens to all students: auto-enrollment without changing access rules."""

from collections.abc import Callable

from fastapi.testclient import TestClient

from tests.conftest import PASSWORD
from tests.helpers import create_course

Login = Callable[..., TestClient]


def _my_course_ids(c: TestClient) -> list[str]:
    return [x["id"] for x in c.get("/api/v1/courses").json()]


def test_open_published_course_reaches_existing_and_new_students(login: Login) -> None:
    t = login("t@example.com")
    early = login("early@example.com", "student")
    cid = create_course(t)

    t.patch(f"/api/v1/courses/{cid}", json={"open_to_all_students": True})
    assert _my_course_ids(early) == []  # still a draft: nobody sees it

    r = t.patch(f"/api/v1/courses/{cid}", json={"status": "published"})
    assert r.json()["open_to_all_students"] is True
    assert _my_course_ids(early) == [cid]  # existing student enrolled when published
    assert early.get(f"/api/v1/courses/{cid}/outline").status_code == 200

    late = login("late@example.com", "student")  # registers after the course was opened
    assert _my_course_ids(late) == [cid]
    students = {s["student"]["email"] for s in t.get(f"/api/v1/courses/{cid}/students").json()}
    assert students == {"early@example.com", "late@example.com"}


def test_closed_courses_stay_enrollment_only(login: Login) -> None:
    t = login("t@example.com")
    cid = create_course(t)
    t.patch(f"/api/v1/courses/{cid}", json={"status": "published"})
    s = login("s@example.com", "student")
    assert _my_course_ids(s) == []
    assert s.get(f"/api/v1/courses/{cid}").status_code == 404


def test_removed_student_is_not_re_enrolled(login: Login) -> None:
    t = login("t@example.com")
    s = login("s@example.com", "student")
    cid = create_course(t)
    t.patch(f"/api/v1/courses/{cid}", json={"status": "published", "open_to_all_students": True})
    sid = t.get(f"/api/v1/courses/{cid}/students").json()[0]["student"]["id"]
    assert t.delete(f"/api/v1/courses/{cid}/enrollments/{sid}").status_code == 204

    t.patch(f"/api/v1/courses/{cid}", json={"title": "Renamed"})  # sync runs again
    s.post("/api/v1/auth/login", json={"email": "s@example.com", "password": PASSWORD})
    assert _my_course_ids(s) == []


def test_teachers_can_still_create_their_own_courses(login: Login) -> None:
    owner = login("t@example.com")
    other = login("o@example.com")
    open_cid = create_course(owner)
    owner.patch(f"/api/v1/courses/{open_cid}", json={"status": "published", "open_to_all_students": True})
    mine = create_course(other)
    assert _my_course_ids(other) == [mine]  # open courses do not leak into other teachers' lists
    assert other.patch(f"/api/v1/courses/{open_cid}", json={"title": "x"}).status_code == 404
