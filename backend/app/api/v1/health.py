from fastapi import APIRouter, Response, status
from pydantic import BaseModel
from sqlalchemy import text

from app.core.config import get_settings
from app.core.deps import DB

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: str
    environment: str


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", environment=get_settings().environment)


class ReadinessResponse(BaseModel):
    status: str
    database: str
    queue: str


@router.get("/health/ready", response_model=ReadinessResponse)
def ready(db: DB, response: Response) -> ReadinessResponse:
    """Readiness for load balancers: database reachable and (when used) Redis reachable."""
    database = queue = "ok"
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        database = "unavailable"
    s = get_settings()
    if s.jobs_run_inline:
        queue = "inline"
    else:
        try:
            import redis

            redis.Redis.from_url(s.redis_url, socket_connect_timeout=1).ping()
        except Exception:
            queue = "unavailable"
    ok = database == "ok" and queue in {"ok", "inline"}
    if not ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return ReadinessResponse(status="ok" if ok else "degraded", database=database, queue=queue)
