"""Celery application. Expensive work (PDF, AI, 3D generation) runs here, never in a request."""

from celery import Celery

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
celery_app.autodiscover_tasks(["app.modules"], related_name="tasks")
