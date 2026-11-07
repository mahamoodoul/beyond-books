import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import (
    Base,
    CreatedAtMixin,
    JSONType,
    TimestampMixin,
    UTCDateTime,
    UUIDPrimaryKeyMixin,
)
from app.modules.operations.jobs import JobStatus


class AuditLog(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_logs_school_created", "school_id", "created_at"),)

    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    school_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("schools.id", ondelete="SET NULL")
    )
    action: Mapped[str] = mapped_column(String(80))
    resource_type: Mapped[str] = mapped_column(String(60))
    resource_id: Mapped[str | None] = mapped_column(String(64))
    outcome: Mapped[str] = mapped_column(String(20))
    request_id: Mapped[str | None] = mapped_column(String(64))
    # Safe metadata only: never passwords, tokens or student answers.
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)


class Job(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Every asynchronous job — extraction, AI generation, 3D generation (design §10)."""

    __tablename__ = "jobs"
    __table_args__ = (
        Index("ix_jobs_status_created", "status", "created_at"),
        Index("ix_jobs_target", "target_type", "target_id"),
    )

    school_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("schools.id", ondelete="SET NULL")
    )
    course_id: Mapped[uuid.UUID | None] = mapped_column(index=True)
    requested_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    job_type: Mapped[str] = mapped_column(String(50))
    target_type: Mapped[str] = mapped_column(String(50))
    target_id: Mapped[uuid.UUID] = mapped_column()
    provider: Mapped[str | None] = mapped_column(String(50))
    provider_task_id: Mapped[str | None] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20), default=JobStatus.QUEUED)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0)
    input_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    result: Mapped[dict[str, Any] | None] = mapped_column(JSONType)
    error_code: Mapped[str | None] = mapped_column(String(80))
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    finished_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
