"""Celery application. Expensive work (PDF, AI, 3D generation) runs here, never in a request."""

import uuid

from celery import Celery, Task

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery("edu3d", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.update(
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    task_time_limit=15 * 60,
    task_soft_time_limit=14 * 60,
    timezone="UTC",
    enable_utc=True,
)


@celery_app.task(name="edu3d.run_job", bind=True, max_retries=None)  # type: ignore[untyped-decorator]
def run_job_task(self: Task, job_id: str) -> str:
    from app.database.session import session_factory
    from app.modules.operations.jobs import JobStatus
    from app.modules.operations.models import Job
    from app.modules.operations.runner import run_job

    # The runner enforces attempt budgets (MAX_ATTEMPTS / MAX_POLL_ATTEMPTS) via attempt_count.
    status = run_job(uuid.UUID(job_id), final_attempt=False)
    if status == JobStatus.RETRYING:
        with session_factory()() as db:
            job = db.get(Job, uuid.UUID(job_id))
            pending = job is not None and job.error_code == "PENDING"
        countdown = 15 if pending else min(300, 10 * 2**self.request.retries)
        raise self.retry(countdown=countdown)
    return str(status)
