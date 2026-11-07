import uuid
from datetime import datetime

from sqlalchemy import Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, UTCDateTime, UUIDPrimaryKeyMixin, utcnow


class LearningGapRecord(UUIDPrimaryKeyMixin, Base):
    """Per-student mastery of a learning objective, derived from graded answer evidence."""

    __tablename__ = "learning_gap_records"
    __table_args__ = (UniqueConstraint("user_id", "learning_objective_id"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    course_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), index=True
    )
    learning_objective_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("learning_objectives.id", ondelete="CASCADE")
    )
    mastery: Mapped[float] = mapped_column(Float)  # 0..1
    evidence_count: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20))  # gap | developing | mastered
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)
