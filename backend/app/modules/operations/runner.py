"""Generic job runner (design §10, ADR 0002).

Modules register a handler per JobType. The runner owns status transitions, attempts,
timestamps and error capture; handlers only do the work and return a result dict.

Dispatch is either Celery (default) or in-process (`EDU3D_JOBS_RUN_INLINE=true`, used by tests
and when running without Redis).
"""

import logging
import threading
import time
import uuid
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.database.session import session_factory
from app.modules.operations.jobs import JobStatus, JobType, assert_transition
from app.modules.operations.models import Job

log = logging.getLogger(__name__)

Handler = Callable[[Session, Job], dict[str, Any]]
_HANDLERS: dict[str, Handler] = {}

MAX_ATTEMPTS = 3


class TransientJobError(Exception):
    """Retry-able failure (timeouts, rate limits, provider 5xx)."""


class PendingJobError(TransientJobError):
    """External work is still running (e.g. 3D provider). Re-poll later; larger attempt budget."""


MAX_POLL_ATTEMPTS = 40


class PermanentJobError(Exception):
    """Non-retryable failure. `code` is safe to show to users."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def handler(job_type: JobType) -> Callable[[Handler], Handler]:
    def register(fn: Handler) -> Handler:
        _HANDLERS[job_type] = fn
        return fn

    return register


def _load_handlers() -> None:
    # Importing registers handlers via the decorator.
    import app.workers.handlers  # noqa: F401


def create_job(
    db: Session,
    *,
    job_type: JobType,
    target_type: str,
    target_id: uuid.UUID,
    requested_by: uuid.UUID | None,
    course_id: uuid.UUID | None = None,
    school_id: uuid.UUID | None = None,
    input_snapshot: dict[str, Any] | None = None,
) -> Job:
    job = Job(
        job_type=job_type,
        target_type=target_type,
        target_id=target_id,
        requested_by=requested_by,
        course_id=course_id,
        school_id=school_id,
        input_snapshot=input_snapshot or {},
        status=JobStatus.QUEUED,
    )
    db.add(job)
    db.flush()
    return job


def dispatch(job_id: uuid.UUID) -> None:
    """Call AFTER the transaction that created the job has committed."""
    if get_settings().jobs_run_inline:
        # In-process (tests/local dev). Transient errors are retried immediately. Long-running
        # external work (PENDING, e.g. a Blender build) is polled on a background thread so the
        # HTTP request returns at once; the client polls GET /jobs/{id} as usual.
        status = run_job(job_id)
        quick_polls = 0
        while status == JobStatus.RETRYING:
            if _is_pending(job_id):
                quick_polls += 1
            if quick_polls > INLINE_QUICK_POLLS:
                threading.Thread(
                    target=_poll_inline, args=(job_id,), name=f"job-{job_id}", daemon=True
                ).start()
                return
            status = run_job(job_id, final_attempt=False)
        return
    from app.workers.celery_app import run_job_task

    run_job_task.delay(str(job_id))


INLINE_POLL_INTERVAL_S = 15.0  # same cadence as the Celery path
INLINE_QUICK_POLLS = 3  # fast fakes/vendors finish within the request; slow work goes background


def _is_pending(job_id: uuid.UUID) -> bool:
    with session_factory()() as db:
        job = db.get(Job, job_id)
        return job is not None and job.error_code == "PENDING"


def _poll_inline(job_id: uuid.UUID) -> None:
    status = JobStatus.RETRYING
    errors = 0
    while status == JobStatus.RETRYING:
        time.sleep(INLINE_POLL_INTERVAL_S)
        try:
            status = run_job(job_id, final_attempt=False)
        except Exception:  # a transient DB error must not leave the job "running" forever
            errors += 1
            log.exception("inline poll of job %s failed (%d)", job_id, errors)
            if errors >= 5:
                return


def _set(job: Job, status: JobStatus) -> None:
    assert_transition(JobStatus(job.status), status)
    job.status = status


def run_job(job_id: uuid.UUID, *, final_attempt: bool = True) -> JobStatus:
    """Execute one attempt. Returns the resulting status. Never raises for handler errors."""
    _load_handlers()
    db = session_factory()()
    try:
        job = db.get(Job, job_id)
        if job is None or JobStatus(job.status) not in {JobStatus.QUEUED, JobStatus.RETRYING}:
            return JobStatus(job.status) if job else JobStatus.FAILED  # idempotent re-delivery
        fn = _HANDLERS.get(job.job_type)
        _set(job, JobStatus.PROCESSING)
        job.attempt_count += 1
        job.started_at = job.started_at or datetime.now(UTC)
        db.commit()
        try:
            if fn is None:
                raise PermanentJobError("NO_HANDLER", f"No handler for {job.job_type}")
            result = fn(db, job)
            _set(job, JobStatus.VALIDATING)
            _set(job, JobStatus.COMPLETED)
            job.result = result
            job.error_code = job.error_message = None
        except TransientJobError as exc:
            db.rollback()
            job = db.get(Job, job_id)
            assert job is not None
            limit = MAX_POLL_ATTEMPTS if isinstance(exc, PendingJobError) else MAX_ATTEMPTS
            if (
                final_attempt and not isinstance(exc, PendingJobError)
            ) or job.attempt_count >= limit:
                _set(job, JobStatus.FAILED)
                job.error_code, job.error_message = "RETRIES_EXHAUSTED", str(exc)[:500]
            else:
                _set(job, JobStatus.RETRYING)
                job.error_code = "PENDING" if isinstance(exc, PendingJobError) else "TRANSIENT"
                job.error_message = str(exc)[:500]
        except PermanentJobError as exc:
            db.rollback()
            job = db.get(Job, job_id)
            assert job is not None
            _set(job, JobStatus.FAILED)
            job.error_code, job.error_message = exc.code, str(exc)[:500]
        except Exception:
            log.exception("job %s crashed", job_id)
            db.rollback()
            job = db.get(Job, job_id)
            assert job is not None
            _set(job, JobStatus.FAILED)
            job.error_code, job.error_message = "INTERNAL_ERROR", "Unexpected error."
        if JobStatus(job.status) in {JobStatus.COMPLETED, JobStatus.FAILED}:
            job.finished_at = datetime.now(UTC)
        db.commit()
        return JobStatus(job.status)
    finally:
        db.close()
