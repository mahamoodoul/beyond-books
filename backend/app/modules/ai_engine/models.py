import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Float, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import (
    Base,
    CreatedAtMixin,
    JSONType,
    UTCDateTime,
    UUIDPrimaryKeyMixin,
    utcnow,
)


class AIOutputVersion(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    """Every validated AI output, with the prompt/model that produced it (traceability)."""

    __tablename__ = "ai_output_versions"
    __table_args__ = (Index("ix_ai_output_versions_target", "target_type", "target_id"),)

    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), index=True)
    course_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(40))  # outline | lesson | section
    target_type: Mapped[str] = mapped_column(String(40))
    target_id: Mapped[uuid.UUID] = mapped_column()
    prompt_id: Mapped[str] = mapped_column(String(80))
    prompt_version: Mapped[str] = mapped_column(String(20))
    provider: Mapped[str] = mapped_column(String(40))
    model: Mapped[str] = mapped_column(String(80))
    output: Mapped[dict[str, Any]] = mapped_column(JSONType)
    validation: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    status: Mapped[str] = mapped_column(
        String(20), default="proposed"
    )  # proposed|applied|discarded
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )


class AIUsageRecord(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "ai_usage_records"

    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), index=True)
    course_id: Mapped[uuid.UUID | None] = mapped_column(index=True)
    provider: Mapped[str] = mapped_column(String(40))
    model: Mapped[str] = mapped_column(String(80))
    provider_request_id: Mapped[str | None] = mapped_column(String(200))
    input_tokens: Mapped[int] = mapped_column(Integer)
    output_tokens: Mapped[int] = mapped_column(Integer)
    credits_used: Mapped[float | None] = mapped_column(Float)  # 3D provider credits
    estimated_cost: Mapped[float | None] = mapped_column(Float)
    currency: Mapped[str | None] = mapped_column(String(3))
    recorded_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
