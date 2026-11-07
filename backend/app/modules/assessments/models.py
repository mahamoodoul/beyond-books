import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import (
    Base,
    CreatedAtMixin,
    JSONType,
    TimestampMixin,
    UTCDateTime,
    UUIDPrimaryKeyMixin,
    utcnow,
)


class Assessment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Draft questions live in `content` (validated AssessmentContent). Publishing freezes a
    numbered AssessmentVersion; attempts always reference the version they were taken on."""

    __tablename__ = "assessments"

    chapter_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("chapters.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(200))
    assessment_type: Mapped[str] = mapped_column(String(20), default="quiz")
    passing_score: Mapped[float] = mapped_column(Float, default=60.0)  # percent
    max_attempts: Mapped[int] = mapped_column(Integer, default=3)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    version: Mapped[int] = mapped_column(Integer, default=1)
    published_version: Mapped[int | None] = mapped_column(Integer)
    content: Mapped[dict[str, Any]] = mapped_column(JSONType)
    origin: Mapped[str] = mapped_column(String(20), default="manual")


class AssessmentVersion(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "assessment_versions"
    __table_args__ = (UniqueConstraint("assessment_id", "version_number"),)

    assessment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("assessments.id", ondelete="CASCADE")
    )
    version_number: Mapped[int] = mapped_column(Integer)
    snapshot: Mapped[dict[str, Any]] = mapped_column(JSONType)  # incl. answer keys + rubrics
    published_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )


class AssessmentAttempt(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "assessment_attempts"
    __table_args__ = (
        UniqueConstraint("assessment_id", "student_id", "attempt_number"),
        Index("ix_assessment_attempts_student_submitted", "student_id", "submitted_at"),
    )

    assessment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("assessments.id", ondelete="CASCADE"), index=True
    )
    assessment_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("assessment_versions.id", ondelete="CASCADE")
    )
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    attempt_number: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="in_progress")  # →submitted→graded
    started_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    submitted_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    graded_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    score: Mapped[float | None] = mapped_column(Float)  # final, only once fully graded
    provisional_score: Mapped[float | None] = mapped_column(Float)  # auto + AI suggestions
    max_score: Mapped[float] = mapped_column(Float, default=0)


class StudentAnswer(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "student_answers"
    __table_args__ = (UniqueConstraint("attempt_id", "question_key"),)

    attempt_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("assessment_attempts.id", ondelete="CASCADE"), index=True
    )
    question_key: Mapped[str] = mapped_column(String(64))
    question_type: Mapped[str] = mapped_column(String(20))
    selected_option_key: Mapped[str | None] = mapped_column(String(64))
    answer_text: Mapped[str | None] = mapped_column(Text)
    is_correct: Mapped[bool | None] = mapped_column(Boolean)
    auto_score: Mapped[float | None] = mapped_column(Float)
    max_points: Mapped[float] = mapped_column(Float)
    explain_further: Mapped[dict[str, Any] | None] = mapped_column(JSONType)


class EvaluationResult(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    """AI suggestion and teacher decision are kept separate (design §8.4)."""

    __tablename__ = "evaluation_results"

    student_answer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("student_answers.id", ondelete="CASCADE"), unique=True
    )
    rubric_version: Mapped[int] = mapped_column(Integer)
    suggested_score: Mapped[float | None] = mapped_column(Float)
    final_score: Mapped[float | None] = mapped_column(Float)
    feedback: Mapped[str | None] = mapped_column(Text)
    teacher_feedback: Mapped[str | None] = mapped_column(Text)
    missing_concepts: Mapped[list[str]] = mapped_column(JSONType, default=list)
    confidence: Mapped[float | None] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(20), default="pending_ai")
    # pending_ai → pending_review → accepted | overridden ; ai_failed → pending_review
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
