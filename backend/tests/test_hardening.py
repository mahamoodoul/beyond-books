from collections.abc import Callable
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.modules.operations.jobs import JobType
from app.modules.operations.maintenance import requeue_stuck
from app.modules.operations.models import Job
from app.modules.operations.runner import create_job
from tests.conftest import PASSWORD, new_client
from tests.helpers import create_course

Login = Callable[..., TestClient]


def test_security_headers(client: TestClient) -> None:
    r = client.get("/api/v1/health")
    h = r.headers
    assert h["X-Content-Type-Options"] == "nosniff"
    assert h["X-Frame-Options"] == "DENY"
    assert "default-src 'none'" in h["Content-Security-Policy"]
    assert h["Cache-Control"] == "no-store"
    assert "Strict-Transport-Security" not in h  # only when cookies are Secure (HTTPS)


def test_readiness_inline(client: TestClient) -> None:
    r = client.get("/api/v1/health/ready")
    assert r.status_code == 200 and r.json() == {
        "status": "ok",
        "database": "ok",
        "queue": "inline",
    }


@pytest.mark.parametrize(
    "overrides",
    [
        {"jwt_secret": "x" * 40, "cookie_secure": True, "llm_provider": "fake"},
        {"jwt_secret": "short", "cookie_secure": True},
        {"jwt_secret": "x" * 40, "cookie_secure": False},
    ],
)
def test_production_config_guards(overrides: dict[str, object]) -> None:
    base: dict[str, object] = {
        "environment": "production",
        "jobs_run_inline": False,
        "llm_provider": "openai",
        "openai_api_key": "k",
        "openai_model": "m",
        "three_d_provider": "tripo",
    }
    with pytest.raises(ValueError):
        Settings(**{**base, **overrides})  # type: ignore[arg-type]


def test_production_disables_api_docs() -> None:
    s = Settings(
        environment="production",
        jwt_secret="x" * 40,
        cookie_secure=True,  # type: ignore[call-arg]
        jobs_run_inline=False,
        llm_provider="openai",
        openai_api_key="k",
        openai_model="m",
        three_d_provider="tripo",
        tripo_api_key="k",
        expose_api_docs=True,
    )
    assert s.expose_api_docs is False


def test_rate_limit(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EDU3D_RATE_LIMIT_PER_MINUTE", "3")
    get_settings.cache_clear()
    codes = [client.get("/api/v1/users/me").status_code for _ in range(4)]
    assert codes[:3] == [401, 401, 401] and codes[3] == 429


def test_export_my_data(login: Login) -> None:
    t = login("t@example.com")
    s = login("s@example.com", "student")
    cid = create_course(t)
    t.post(f"/api/v1/courses/{cid}/enrollments", json={"student_email": "s@example.com"})
    data = s.get("/api/v1/users/me/export").json()
    assert data["profile"]["email"] == "s@example.com"
    assert data["enrollments"][0]["course_id"] == cid
    assert "password_hash" not in str(data)


def test_delete_account(login: Login) -> None:
    t = login("t@example.com")
    s = login("s@example.com", "student")
    cid = create_course(t)
    t.post(f"/api/v1/courses/{cid}/enrollments", json={"student_email": "s@example.com"})
    assert s.request("DELETE", "/api/v1/users/me", json={"password": "wrong"}).status_code == 401
    assert s.request("DELETE", "/api/v1/users/me", json={"password": PASSWORD}).status_code == 204
    assert t.get(f"/api/v1/courses/{cid}/students").json() == []
    relogin = new_client().post(
        "/api/v1/auth/login", json={"email": "s@example.com", "password": PASSWORD}
    )
    assert relogin.status_code == 401
    # Teachers who still own content must transfer/delete it first.
    r = t.request("DELETE", "/api/v1/users/me", json={"password": PASSWORD})
    assert r.status_code == 409 and "courses" in r.json()["error"]["message"]


def test_requeue_stuck_jobs(login: Login, db: Session) -> None:
    t = login("t@example.com")
    cid = create_course(t)
    r = t.post(
        "/api/v1/documents/text",
        json={"course_id": cid, "title": "N", "text": "Hello world. " * 50},
    )
    doc_id = r.json()["document"]["id"]
    import uuid

    job = create_job(
        db,
        job_type=JobType.DOCUMENT_EXTRACTION,
        target_type="source_document",
        target_id=uuid.UUID(doc_id),
        requested_by=None,
    )
    db.commit()  # queued, never dispatched → "stuck"
    assert requeue_stuck(db, timedelta(minutes=-1)) == [job.id]
    db.expire_all()
    assert db.get(Job, job.id).status == "completed"  # type: ignore[union-attr]
