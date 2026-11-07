import os

os.environ["EDU3D_ENVIRONMENT"] = "test"
os.environ["EDU3D_JOBS_RUN_INLINE"] = "true"
os.environ["EDU3D_LLM_PROVIDER"] = "fake"
os.environ.setdefault("EDU3D_DATABASE_URL", "sqlite+pysqlite:///:memory:")

from collections.abc import Callable, Iterator  # noqa: E402
from typing import Any  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, event  # noqa: E402
from sqlalchemy.engine import Engine  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.core.hardening import api_limiter  # noqa: E402
from app.core.rate_limit import login_limiter  # noqa: E402
from app.database.models import Base  # noqa: E402
from app.database.session import configure_engine, session_factory  # noqa: E402
from app.main import create_app  # noqa: E402

PASSWORD = "correct-horse-battery"  # noqa: S105


def _make_engine() -> Engine:
    url = os.environ["EDU3D_DATABASE_URL"]
    if url.startswith("sqlite"):
        engine = create_engine(url, connect_args={"check_same_thread": False}, poolclass=StaticPool)

        @event.listens_for(engine, "connect")
        def _fk_on(dbapi_conn: Any, _: Any) -> None:
            dbapi_conn.execute("PRAGMA foreign_keys=ON")

        return engine
    return create_engine(url)


@pytest.fixture(autouse=True)
def _database(tmp_path: Any, monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    get_settings.cache_clear()
    monkeypatch.setenv("EDU3D_LOCAL_STORAGE_DIR", str(tmp_path / "storage"))
    get_settings.cache_clear()
    engine = _make_engine()
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    configure_engine(engine)
    login_limiter.reset()
    api_limiter.reset()
    yield
    Base.metadata.drop_all(engine)
    engine.dispose()
    get_settings.cache_clear()


@pytest.fixture
def db() -> Iterator[Session]:
    s = session_factory()()
    yield s
    s.close()


def new_client() -> TestClient:
    return TestClient(
        create_app(), raise_server_exceptions=False, headers={"X-Requested-With": "edu3d"}
    )


@pytest.fixture
def client() -> TestClient:
    return new_client()


def register_and_login(email: str, account_type: str = "teacher", name: str = "") -> TestClient:
    c = new_client()
    r = c.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": PASSWORD,
            "display_name": name or email.split("@")[0],
            "account_type": account_type,
        },
    )
    assert r.status_code == 201, r.text
    r = c.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return c


@pytest.fixture
def login() -> Callable[..., TestClient]:
    return register_and_login
