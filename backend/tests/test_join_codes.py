"""Join codes: preview, joining at sign-up, joining later, affiliations, regenerating."""

from collections.abc import Callable

from fastapi.testclient import TestClient

from tests.conftest import PASSWORD, new_client
from tests.helpers import create_course

Login = Callable[..., TestClient]


def _register(email: str, kind: str, code: str | None = None) -> tuple[TestClient, dict]:
    c = new_client()
    r = c.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": PASSWORD,
            "display_name": email.split("@")[0],
            "account_type": kind,
            "join_code": code,
        },
    )
    return c, {
        "status": r.status_code,
        **(r.json() if r.headers.get("content-type", "").startswith("application/json") else {}),
    }


def _login(c: TestClient, email: str) -> None:
    assert (
        c.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD}).status_code == 200
    )


def test_schools_and_courses_get_codes_visible_to_managers_only(login: Login) -> None:
    t = login("t@example.com")
    s = login("s@example.com", "student")
    school = t.post("/api/v1/schools", json={"name": "Oslo High", "slug": "oslo-high"}).json()
    assert len(school["join_code"]) == 16
    cid = create_course(t, school_id=school["id"])
    t.patch(f"/api/v1/courses/{cid}", json={"status": "published"})
    course = t.get(f"/api/v1/courses/{cid}").json()
    assert course["join_code"] and course["can_manage"]
    # a student in the school sees no codes
    t.post(
        f"/api/v1/schools/{school['id']}/members",
        json={"email": "s@example.com", "role": "student"},
    )
    t.post(f"/api/v1/courses/{cid}/enrollments", json={"student_email": "s@example.com"})
    assert s.get("/api/v1/schools").json()[0]["join_code"] is None
    assert s.get(f"/api/v1/courses/{cid}").json()["join_code"] is None


def test_preview_is_public_and_tolerant_of_dashes_and_case(login: Login) -> None:
    t = login("t@example.com")
    school = t.post("/api/v1/schools", json={"name": "Oslo High", "slug": "oslo-high"}).json()
    code = school["join_code"]
    anon = new_client()
    p = anon.get(
        "/api/v1/join-codes", params={"code": f"{code[:4].lower()}-{code[4:8]} {code[8:]}"}
    ).json()
    assert (
        p["kind"] == "school"
        and p["name"] == "Oslo High"
        and p["code"] == "-".join(code[i : i + 4] for i in range(0, 16, 4))
    )
    assert "as a teacher" in p["as_teacher"] and "as a student" in p["as_student"]
    r = anon.get("/api/v1/join-codes", params={"code": "ZZZZZZZZZZZZZZZZ"})
    assert r.status_code == 404 and "Unknown code" in r.json()["error"]["message"]


def test_register_with_a_school_code_joins_with_the_right_role(login: Login) -> None:
    t = login("owner@example.com")
    school = t.post("/api/v1/schools", json={"name": "Oslo High", "slug": "oslo-high"}).json()
    code = school["join_code"]
    tc, r = _register("colleague@example.com", "teacher", code)
    assert r["status"] == 201
    _login(tc, "colleague@example.com")
    mine = tc.get("/api/v1/schools").json()
    assert mine[0]["name"] == "Oslo High" and mine[0]["my_role"] == "teacher"
    sc, r = _register("pupil@example.com", "student", code.lower())
    assert r["status"] == 201
    _login(sc, "pupil@example.com")
    assert sc.get("/api/v1/schools").json()[0]["my_role"] == "student"
    members = t.get(f"/api/v1/schools/{school['id']}/members").json()
    assert {m["user"]["email"]: m["role"] for m in members} == {
        "owner@example.com": "school_admin",
        "colleague@example.com": "teacher",
        "pupil@example.com": "student",
    }
    # a wrong code refuses the registration before any account is created
    _, bad = _register("nobody@example.com", "student", "ZZZZ-ZZZZ-ZZZZ-ZZZZ")
    assert bad["status"] == 404
    again, r2 = _register("nobody@example.com", "student")
    assert r2["status"] == 201  # the email was still free


def test_register_with_a_course_code_enrols_the_student(login: Login) -> None:
    t = login("owner@example.com")
    school = t.post("/api/v1/schools", json={"name": "Oslo High", "slug": "oslo-high"}).json()
    cid = create_course(t, school_id=school["id"])
    t.patch(f"/api/v1/courses/{cid}", json={"status": "published"})
    code = t.get(f"/api/v1/courses/{cid}").json()["join_code"]
    anon = new_client()
    p = anon.get("/api/v1/join-codes", params={"code": code}).json()
    assert (
        p["kind"] == "course" and p["school_name"] == "Oslo High" and p["teacher_name"] == "owner"
    )
    sc, r = _register("pupil@example.com", "student", code)
    assert r["status"] == 201
    _login(sc, "pupil@example.com")
    assert [c["id"] for c in sc.get("/api/v1/courses").json()] == [cid]
    assert sc.get("/api/v1/schools").json()[0]["my_role"] == "student"
    aff = sc.get("/api/v1/users/me/affiliations").json()
    assert (
        aff["courses"][0]["role"] == "student" and aff["courses"][0]["school_name"] == "Oslo High"
    )
    assert aff["schools"][0]["join_code"] is None
    # a teacher using a course code joins the course's school as a teacher
    tc, r = _register("colleague@example.com", "teacher", code)
    assert r["status"] == 201
    _login(tc, "colleague@example.com")
    assert tc.get("/api/v1/schools").json()[0]["my_role"] == "teacher"
    # a course with no school gives a teacher nothing to join
    lone = create_course(t)
    lone_code = t.get(f"/api/v1/courses/{lone}").json()["join_code"]
    _, bad = _register("other@example.com", "teacher", lone_code)
    assert bad["status"] == 409


def test_join_later_from_the_account_and_regenerate_codes(login: Login) -> None:
    t = login("owner@example.com")
    s = login("s@example.com", "student")
    school = t.post("/api/v1/schools", json={"name": "Oslo High", "slug": "oslo-high"}).json()
    cid = create_course(t, school_id=school["id"])
    code = t.get(f"/api/v1/courses/{cid}").json()["join_code"]
    r = s.post("/api/v1/users/me/join", json={"code": code})
    assert r.status_code == 200 and r.json()["kind"] == "course"
    assert any("Enrolled" in x for x in r.json()["joined"])
    assert any("Joined Oslo High" in x for x in r.json()["joined"])
    # second time: nothing changes, no error
    r = s.post("/api/v1/users/me/join", json={"code": code})
    assert r.status_code == 200 and all("Already" in x for x in r.json()["joined"])
    # the owner's affiliations carry the codes to share
    aff = t.get("/api/v1/users/me/affiliations").json()
    assert aff["schools"][0]["join_code"] and aff["courses"][0]["join_code"]
    # regenerate: the old code dies, the new one works
    new = t.post(f"/api/v1/courses/{cid}/join-code").json()["join_code"]
    assert new.replace("-", "") != code and len(new) == 19 and new.count("-") == 3
    assert new_client().get("/api/v1/join-codes", params={"code": code}).status_code == 404
    assert new_client().get("/api/v1/join-codes", params={"code": new}).status_code == 200
    new_school = t.post(f"/api/v1/schools/{school['id']}/join-code").json()["join_code"]
    assert (
        new_client().get("/api/v1/join-codes", params={"code": new_school}).json()["kind"]
        == "school"
    )
    # students cannot regenerate
    assert s.post(f"/api/v1/courses/{cid}/join-code").status_code == 403


def test_codes_are_16_characters_and_bad_formats_are_refused_before_lookup(login: Login) -> None:
    t = login("t@example.com")
    school = t.post("/api/v1/schools", json={"name": "Oslo High", "slug": "oslo-high"}).json()
    assert len(school["join_code"]) == 16
    anon = new_client()
    pretty = anon.get("/api/v1/join-codes", params={"code": school["join_code"]}).json()["code"]
    assert pretty.count("-") == 3 and pretty.replace("-", "") == school["join_code"]
    # dashes, spaces and lower case are fine; wrong length or odd characters are a 400
    assert anon.get("/api/v1/join-codes", params={"code": pretty.lower()}).status_code == 200
    r = anon.get("/api/v1/join-codes", params={"code": "ABCD-EFGH-JKLM-NPQ"})
    assert r.status_code in (400, 422)
    r = anon.get("/api/v1/join-codes", params={"code": "ABCDEFGHJKLMNPQRS"})  # 17 characters
    assert r.status_code == 400 and r.json()["error"]["code"] == "INVALID_JOIN_CODE"
    # registration with a malformed code is refused (422) before any lookup or account
    _, bad = _register("x@example.com", "student", "SHORT1")
    assert bad["status"] == 422


def test_password_rules_are_enforced_by_the_server() -> None:
    from app.modules.authentication.passwords import password_problems

    assert password_problems("correct-horse-battery", "t@example.com", "Teacher") == []
    assert password_problems("student-demo-123", "s@example.com", "s") == []
    assert password_problems("purple heart beats fast", "a@b.no", "x") == []  # passphrase
    assert any("12 characters" in p for p in password_problems("short1!", "", ""))
    assert any("Mix letters" in p for p in password_problems("abcdefghijkl", "", ""))
    assert any("repeat" in p for p in password_problems("aaaaaaaaaaaa", "", ""))
    assert any("sequence" in p for p in password_problems("123456789012", "", ""))
    assert any("too common" in p for p in password_problems("password1234", "", ""))
    assert any(
        "name or email" in p
        for p in password_problems("ingrid-hansen-2026", "ingrid@x.no", "Ingrid Hansen")
    )
    _, r = _register("weak@example.com", "student", None)  # PASSWORD fixture is fine
    assert r["status"] == 201
    c = new_client()
    r2 = c.post(
        "/api/v1/auth/register",
        json={
            "email": "weak2@example.com",
            "password": "weak2weak2weak2",
            "display_name": "weak2",
            "account_type": "student",
        },
    )
    assert r2.status_code == 422 and "name or email" in r2.text
