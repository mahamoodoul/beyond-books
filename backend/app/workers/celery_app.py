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


@celery_app.task(name="edu3d.run_job", bind=True, max_retries=3)  # type: ignore[untyped-decorator]
def run_job_task(self: Task, job_id: str) -> str:
    from app.modules.operations.jobs import JobStatus
    from app.modules.operations.runner import MAX_ATTEMPTS, run_job

    final = self.request.retries + 1 >= MAX_ATTEMPTS
    status = run_job(uuid.UUID(job_id), final_attempt=final)
    if status == JobStatus.RETRYING:
        # Exponential backoff with jitter.
        raise self.retry(countdown=min(300, 10 * 2**self.request.retries), max_retries=3)
    return str(status)
