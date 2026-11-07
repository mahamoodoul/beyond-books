from collections.abc import Callable

from fastapi.testclient import TestClient

from tests.helpers import create_course

Login = Callable[..., TestClient]


def test_teacher_creates_and_lists_course(login: Login) -> None:
    t = login("t@example.com")
    cid = create_course(t)
    courses = t.get("/api/v1/courses").json()
    assert [c["id"] for c in courses] == [cid]
    assert courses[0]["status"] == "draft" and courses[0]["can_manage"] is True


def test_student_cannot_create_course(login: Login) -> None:
    s = login("s@example.com", "student")
    assert s.post("/api/v1/courses", json={"title": "x"}).status_code == 403


def test_other_teacher_cannot_see_course(login: Login) -> None:
    t = login("t@example.com")
    other = login("o@example.com")
    cid = create_course(t)
    assert other.get(f"/api/v1/courses/{cid}").status_code == 404
    assert other.patch(f"/api/v1/courses/{cid}", json={"title": "pwned"}).status_code == 404


def test_student_sees_course_only_when_enrolled_and_published(login: Login) -> None:
    t = login("t@example.com")
    s = login("s@example.com", "student")
    cid = create_course(t)
    r = t.post(f"/api/v1/courses/{cid}/enrollments", json={"student_email": "s@example.com"})
    assert r.json() == {"enrolled": 1, "already_enrolled": 0}
    assert s.get(f"/api/v1/courses/{cid}").status_code == 404  # still draft
    t.patch(f"/api/v1/courses/{cid}", json={"status": "published"})
    got = s.get(f"/api/v1/courses/{cid}")
    assert got.status_code == 200 and got.json()["can_manage"] is False
    assert s.patch(f"/api/v1/courses/{cid}", json={"title": "x"}).status_code == 403
    assert [c["id"] for c in s.get("/api/v1/courses").json()] == [cid]

    t.delete(f"/api/v1/courses/{cid}/enrollments/{s.get('/api/v1/users/me').json()['id']}")
    assert s.get(f"/api/v1/courses/{cid}").status_code == 404


def test_cannot_enroll_teacher_account(login: Login) -> None:
    t = login("t@example.com")
    login("t2@example.com")
    cid = create_course(t)
    r = t.post(f"/api/v1/courses/{cid}/enrollments", json={"student_email": "t2@example.com"})
    assert r.status_code == 409


def test_school_course_enrolls_only_school_students(login: Login) -> None:
    admin = login("admin@example.com")
    login("in@example.com", "student")
    login("out@example.com", "student")
    sid = admin.post("/api/v1/schools", json={"name": "S", "slug": "s-school"}).json()["id"]
    admin.post(
        f"/api/v1/schools/{sid}/members", json={"email": "in@example.com", "role": "student"}
    )
    cid = create_course(admin, school_id=sid)
    ok = admin.post(f"/api/v1/courses/{cid}/enrollments", json={"student_email": "in@example.com"})
    assert ok.status_code == 200
    bad = admin.post(
        f"/api/v1/courses/{cid}/enrollments", json={"student_email": "out@example.com"}
    )
    assert bad.status_code == 404


def test_classroom_enrollment(login: Login) -> None:
    admin = login("admin@example.com")
    for e in ("a@example.com", "b@example.com"):
        login(e, "student")
    sid = admin.post("/api/v1/schools", json={"name": "S", "slug": "s-school"}).json()["id"]
    room = admin.post("/api/v1/classrooms", json={"school_id": sid, "name": "9A"}).json()["id"]
    for e in ("a@example.com", "b@example.com"):
        admin.post(f"/api/v1/schools/{sid}/members", json={"email": e, "role": "student"})
        admin.post(f"/api/v1/classrooms/{room}/members", json={"email": e, "role": "student"})
    cid = create_course(admin, school_id=sid)
    r = admin.post(f"/api/v1/courses/{cid}/enrollments", json={"classroom_id": room})
    assert r.json() == {"enrolled": 2, "already_enrolled": 0}
    assert len(admin.get(f"/api/v1/courses/{cid}/students").json()) == 2

    # A teacher-owned course (no school) cannot pull in a school classroom.
    personal = create_course(admin)
    r = admin.post(f"/api/v1/courses/{personal}/enrollments", json={"classroom_id": room})
    assert r.status_code == 409
