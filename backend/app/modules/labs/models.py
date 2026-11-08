import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import (
    Base,
    JSONType,
    TimestampMixin,
    UTCDateTime,
    UUIDPrimaryKeyMixin,
    utcnow,
)


class CircuitLab(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A teacher-made lab of some kind (circuit, molecules, buoyancy ...): a goal, a palette of
    what the student may use, and instructions. Students build in the browser; the server keeps
    one session per student with the state and its evaluation. (Table name kept from the first
    kind, "circuit_labs".)"""

    __tablename__ = "circuit_labs"

    course_id: Mapped[uuid.UUID | None] = mapped_column(  # None = standalone lab
        ForeignKey("courses.id", ondelete="SET NULL"), index=True
    )
    chapter_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("chapters.id", ondelete="SET NULL"), index=True
    )
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    kind: Mapped[str] = mapped_column(String(20), default="circuit")
    title: Mapped[str] = mapped_column(String(200))
    instructions: Mapped[str] = mapped_column(Text, default="")
    goal: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)  # engine-specific
    palette: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)  # engine-specific
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft | published


class CircuitLabSession(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "circuit_lab_sessions"
    __table_args__ = (
        UniqueConstraint("lab_id", "student_id"),
        Index("ix_circuit_lab_sessions_lab_activity", "lab_id", "last_activity_at"),
    )

    lab_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("circuit_labs.id", ondelete="CASCADE"))
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    state: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)  # engine-specific
    result: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    achieved: Mapped[list[Any]] = mapped_column(JSONType, default=list)  # sub-goals reached so far
    status: Mapped[str] = mapped_column(
        String(20), default="in_progress"
    )  # in_progress | completed
    interactions: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    last_activity_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
