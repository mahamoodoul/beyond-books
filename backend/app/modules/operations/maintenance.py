"""Operational maintenance (runbook: stuck generation job / queue backlog).

python -m app.modules.operations.maintenance requeue-stuck --older-than-minutes 30
python -m app.modules.operations.maintenance stats
"""

import argparse
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database.session import session_factory
from app.modules.operations.jobs import JobStatus
from app.modules.operations.models import Job
from app.modules.operations.runner import dispatch


def find_stuck(db: Session, older_than: timedelta) -> list[Job]:
    cutoff = datetime.now(UTC) - older_than
    return list(
        db.scalars(
            select(Job).where(
                Job.status.in_([JobStatus.QUEUED, JobStatus.RETRYING, JobStatus.PROCESSING]),
                Job.updated_at < cutoff,
            )
        )
    )


def requeue_stuck(db: Session, older_than: timedelta) -> list[uuid.UUID]:
    """Re-dispatch jobs that stopped moving. A job stuck in PROCESSING (worker died) is moved to
    RETRYING first. Handlers are idempotent and 3D jobs reuse their stored provider task id, so
    a re-dispatch never double-bills."""
    ids = []
    for job in find_stuck(db, older_than):
        if job.status == JobStatus.PROCESSING:
            job.status = JobStatus.RETRYING
            job.error_code, job.error_message = "REQUEUED", "Re-queued after being stuck."
        ids.append(job.id)
    db.commit()
    for job_id in ids:
        dispatch(job_id)
    return ids


def stats(db: Session) -> dict[str, int]:
    return {
        str(s): int(n)
        for s, n in db.execute(select(Job.status, func.count(Job.id)).group_by(Job.status)).all()
    }


def main() -> None:
    parser = argparse.ArgumentParser(prog="maintenance")
    sub = parser.add_subparsers(dest="cmd", required=True)
    rq = sub.add_parser("requeue-stuck")
    rq.add_argument("--older-than-minutes", type=int, default=30)
    sub.add_parser("stats")
    args = parser.parse_args()
    db = session_factory()()
    try:
        if args.cmd == "requeue-stuck":
            ids = requeue_stuck(db, timedelta(minutes=args.older_than_minutes))
            print(f"re-queued {len(ids)} job(s)")
        else:
            for status, n in stats(db).items():
                print(f"{status:12} {n}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
