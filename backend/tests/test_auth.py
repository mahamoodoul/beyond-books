from fastapi.testclient import TestClient

from tests.conftest import PASSWORD, new_client, register_and_login

REG = "/api/v1/auth/register"
LOGIN = "/api/v1/auth/login"


def _register(c: TestClient, email: str, **kw: str) -> int:
    body = {"email": email, "password": PASSWORD, "display_name": "T", "account_type": "teacher"}
    body.update(kw)
    return c.post(REG, json=body).status_code


def test_register_login_me_logout(client: TestClient) -> None:
    assert _register(client, "Teacher@Example.com") == 201
    r = client.post(LOGIN, json={"email": "teacher@example.com", "password": PASSWORD})
    assert r.status_code == 200
    assert r.json()["email"] == "teacher@example.com"
    assert "password_hash" not in r.json()
    assert client.get("/api/v1/users/me").json()["account_type"] == "teacher"

    assert client.post("/api/v1/auth/logout").status_code == 204
    assert client.get("/api/v1/users/me").status_code == 401


def test_logout_revokes_access_token_server_side(client: TestClient) -> None:
    _register(client, "a@example.com")
    client.post(LOGIN, json={"email": "a@example.com", "password": PASSWORD})
    stolen = client.cookies.get("edu3d_access")
    client.post("/api/v1/auth/logout")
    r = new_client().get("/api/v1/users/me", headers={"Authorization": f"Bearer {stolen}"})
    assert r.status_code == 401


def test_duplicate_email_is_case_insensitive(client: TestClient) -> None:
    assert _register(client, "dup@example.com") == 201
    assert _register(client, "DUP@example.com") == 409


def test_short_password_rejected(client: TestClient) -> None:
    body = {
        "email": "x@example.com",
        "password": "short",
        "display_name": "x",
        "account_type": "teacher",
    }
    r = client.post(REG, json=body)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"


def test_cannot_self_register_as_admin(client: TestClient) -> None:
    assert _register(client, "x@example.com", account_type="school_admin") == 422


def test_wrong_password_and_unknown_user_give_same_error(client: TestClient) -> None:
    _register(client, "a@example.com")
    r1 = client.post(LOGIN, json={"email": "a@example.com", "password": "wrong-password-123"})
    r2 = client.post(LOGIN, json={"email": "nobody@example.com", "password": "wrong-password-123"})
    assert r1.status_code == r2.status_code == 401
    assert r1.json()["error"]["message"] == r2.json()["error"]["message"]


def test_login_is_rate_limited(client: TestClient) -> None:
    _register(client, "a@example.com")
    codes = [
        client.post(
            LOGIN, json={"email": "a@example.com", "password": "bad-password-xx"}
        ).status_code
        for _ in range(11)
    ]
    assert codes[-1] == 429


def test_refresh_rotates_and_detects_reuse() -> None:
    c = register_and_login("r@example.com")
    old_refresh = c.cookies.get("edu3d_refresh", path="/api/v1/auth")
    assert c.post("/api/v1/auth/refresh").status_code == 200
    assert c.get("/api/v1/users/me").status_code == 200

    attacker = new_client()
    attacker.cookies.set("edu3d_refresh", old_refresh, path="/api/v1/auth")
    assert attacker.post("/api/v1/auth/refresh").status_code == 401
    # Reuse detection revoked every session, including the legitimate one.
    assert c.get("/api/v1/users/me").status_code == 401


def test_cookie_auth_requires_csrf_header() -> None:
    c = register_and_login("c@example.com")
    r = c.patch("/api/v1/users/me", json={"display_name": "New"}, headers={"X-Requested-With": ""})
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "CSRF_CHECK_FAILED"
    assert c.patch("/api/v1/users/me", json={"display_name": "New"}).status_code == 200


def test_forged_token_rejected(client: TestClient) -> None:
    r = client.get("/api/v1/users/me", headers={"Authorization": "Bearer not.a.jwt"})
    assert r.status_code == 401
