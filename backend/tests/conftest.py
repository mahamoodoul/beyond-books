import os

os.environ["EDU3D_ENVIRONMENT"] = "test"
os.environ["EDU3D_ENV_FILE"] = ""  # never read a developer's local .env during tests
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
import app.main as _app_main  # noqa: E402

# --------------------------------------------------------------- API coverage gate
# Every app built in tests records which routes answered with a 2xx. When the WHOLE suite runs,
# pytest_sessionfinish fails the run if any documented route was never exercised successfully.
API_HITS: set[tuple[str, str]] = set()
_original_create_app = _app_main.create_app


def _instrumented_create_app() -> Any:
    app = _original_create_app()

    @app.middleware("http")
    async def _record(request: Any, call_next: Any) -> Any:
        response = await call_next(request)
        route = request.scope.get("route")
        if route is not None and 200 <= response.status_code < 300:
            API_HITS.add((request.method.lower(), "/api/v1" + getattr(route, "path", "")))
        return response

    return app


_app_main.create_app = _instrumented_create_app  # type: ignore[assignment]
create_app = _instrumented_create_app

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


def pytest_sessionfinish(session: pytest.Session, exitstatus: int) -> None:
    """Fail the full-suite run if any OpenAPI route never returned 2xx in any test."""
    from pathlib import Path

    test_files = {p.name for p in Path(__file__).parent.glob("test_*.py")}
    ran_files = {Path(str(item.fspath)).name for item in session.items}
    if session.config.getoption("keyword") or ran_files != test_files or exitstatus != 0:
        return  # partial run or already failing: don't add noise
    spec = _original_create_app().openapi()
    routes = {(m, p) for p, ops in spec["paths"].items() for m in ops}
    missing = sorted(routes - API_HITS)
    if missing:
        reporter = session.config.pluginmanager.get_plugin("terminalreporter")
        lines = "\n".join(f"  {m.upper():6} {p}" for m, p in missing)
        msg = f"API coverage gate: {len(missing)} route(s) never returned 2xx in tests:\n{lines}"
        if reporter:
            reporter.write_line(msg, red=True)
        session.exitstatus = 1
    else:
        reporter = session.config.pluginmanager.get_plugin("terminalreporter")
        if reporter:
            reporter.write_line(
                f"API coverage gate: all {len(routes)} routes exercised with 2xx.", green=True
            )
