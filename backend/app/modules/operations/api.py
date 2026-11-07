import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict

from app.core.deps import DB, CurrentUser
from app.core.errors import NotFoundError
from app.modules.courses.access import get_course_for
from app.modules.operations.models import Job

router = APIRouter(prefix="/jobs", tags=["jobs"])


class JobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    job_type: str
    status: str
    target_type: str
    target_id: uuid.UUID
    attempt_count: int
    error_code: str | None
    error_message: str | None
    result: dict[str, Any] | None
    created_at: datetime
    finished_at: datetime | None


@router.get("/{job_id}", response_model=JobOut)
def get_job(job_id: uuid.UUID, user: CurrentUser, db: DB) -> Job:
    job = db.get(Job, job_id)
    if job is None:
        raise NotFoundError()
    if job.requested_by != user.id:
        if job.course_id is None:
            raise NotFoundError()
        get_course_for(db, user, job.course_id, manage=True)
    return job
