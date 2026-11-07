from collections.abc import Iterator

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

_engine: Engine | None = None
_factory: sessionmaker[Session] | None = None


def configure_engine(engine: Engine) -> None:
    """Point the app (API + workers) at an engine. Used by tests."""
    global _engine, _factory
    _engine = engine
    _factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def session_factory() -> sessionmaker[Session]:
    if _factory is None:
        configure_engine(create_engine(get_settings().database_url, pool_pre_ping=True))
    assert _factory is not None
    return _factory


def get_db() -> Iterator[Session]:
    """FastAPI dependency: one session per request."""
    db = session_factory()()
    try:
        yield db
    finally:
        db.close()
