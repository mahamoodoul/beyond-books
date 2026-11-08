import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings

DEMO = "/api/v1/auth/demo"
DEMO_LOGIN = "/api/v1/auth/demo-login"


@pytest.fixture
def demo_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EDU3D_DEMO_MODE", "true")
    get_settings.cache_clear()


def test_off_by_default(client: TestClient) -> None:
    assert client.get(DEMO).json() == {"enabled": False}
    assert client.post(DEMO_LOGIN, json={"role": "teacher"}).status_code == 404
    assert client.get("/api/v1/users/me").status_code == 401


def test_enters_as_demo_teacher_and_student(demo_on: None, client: TestClient) -> None:
    assert client.get(DEMO).json() == {"enabled": True}
    r = client.post(DEMO_LOGIN, json={"role": "teacher"})
    assert r.status_code == 200
    assert r.json()["email"] == "teacher@example.com"
    assert client.get("/api/v1/users/me").json()["account_type"] == "teacher"

    # same account again (created once), then switch to the student
    assert client.post(DEMO_LOGIN, json={"role": "teacher"}).json()["id"] == r.json()["id"]
    s = client.post(DEMO_LOGIN, json={"role": "student"})
    assert s.json()["email"] == "student@example.com"
    assert client.get("/api/v1/users/me").json()["account_type"] == "student"


def test_rejects_unknown_role(demo_on: None, client: TestClient) -> None:
    assert client.post(DEMO_LOGIN, json={"role": "admin"}).status_code == 422


def test_needs_an_explicit_opt_in() -> None:
    assert Settings().demo_mode is False
