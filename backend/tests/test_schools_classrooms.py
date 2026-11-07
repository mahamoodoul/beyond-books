from collections.abc import Callable

from fastapi.testclient import TestClient

Login = Callable[..., TestClient]


def _school(c: TestClient, slug: str = "oslo-high") -> str:
    r = c.post("/api/v1/schools", json={"name": "Oslo High", "slug": slug})
    assert r.status_code == 201, r.text
    assert r.json()["my_role"] == "school_admin"
    return str(r.json()["id"])


def test_student_cannot_create_school(login: Login) -> None:
    s = login("s@example.com", "student")
    assert s.post("/api/v1/schools", json={"name": "X", "slug": "xx-x"}).status_code == 403


def test_non_member_gets_404_not_403(login: Login) -> None:
    admin = login("admin@example.com")
    outsider = login("out@example.com")
    sid = _school(admin)
    assert outsider.get(f"/api/v1/schools/{sid}").status_code == 404
    assert outsider.get(f"/api/v1/schools/{sid}/members").status_code == 404
    assert outsider.get("/api/v1/schools").json() == []


def test_full_school_and_classroom_flow(login: Login) -> None:
    admin = login("admin@example.com")
    teacher = login("t@example.com")
    student = login("s@example.com", "student")
    other_student = login("s2@example.com", "student")
    sid = _school(admin)

    add = admin.post(
        f"/api/v1/schools/{sid}/members", json={"email": "t@example.com", "role": "teacher"}
    )
    assert add.status_code == 201
    admin.post(f"/api/v1/schools/{sid}/members", json={"email": "s@example.com", "role": "student"})

    # A teacher (non-admin) cannot add school members.
    r = teacher.post(
        f"/api/v1/schools/{sid}/members", json={"email": "s2@example.com", "role": "student"}
    )
    assert r.status_code == 403

    cr = teacher.post("/api/v1/classrooms", json={"school_id": sid, "name": "Biology 9A"})
    assert cr.status_code == 201
    cid = cr.json()["id"]

    # Only school members can be added to a classroom.
    r = teacher.post(
        f"/api/v1/classrooms/{cid}/members", json={"email": "s2@example.com", "role": "student"}
    )
    assert r.status_code == 404
    r = teacher.post(
        f"/api/v1/classrooms/{cid}/members", json={"email": "s@example.com", "role": "student"}
    )
    assert r.status_code == 201

    assert student.get(f"/api/v1/classrooms/{cid}").status_code == 200
    # Students can view their classroom but not its roster or manage it.
    assert student.get(f"/api/v1/classrooms/{cid}/members").status_code == 403
    assert other_student.get(f"/api/v1/classrooms/{cid}").status_code == 404
    # School admin can see every classroom.
    assert len(admin.get(f"/api/v1/schools/{sid}/classrooms").json()) == 1


def test_role_must_match_account_type(login: Login) -> None:
    admin = login("admin@example.com")
    login("s@example.com", "student")
    sid = _school(admin)
    r = admin.post(
        f"/api/v1/schools/{sid}/members", json={"email": "s@example.com", "role": "teacher"}
    )
    assert r.status_code == 409


def test_cannot_forge_school_id_for_classroom(login: Login) -> None:
    admin = login("admin@example.com")
    teacher = login("t@example.com")
    sid = _school(admin)
    r = teacher.post("/api/v1/classrooms", json={"school_id": sid, "name": "Sneaky"})
    assert r.status_code == 404
