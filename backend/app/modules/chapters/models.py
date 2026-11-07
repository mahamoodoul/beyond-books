import uuid
from enum import StrEnum
from typing import Any

from sqlalchemy import ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, CreatedAtMixin, JSONType, TimestampMixin, UUIDPrimaryKeyMixin


class PublishStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"


class Chapter(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "chapters"
    __table_args__ = (Index("ix_chapters_course_position", "course_id", "position"),)

    course_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    position: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default=PublishStatus.DRAFT)
    version: Mapped[int] = mapped_column(Integer, default=1)
    # Page ranges in the course's source documents this chapter is grounded in:
    # [{"document_id": "...", "page_start": 3, "page_end": 9}]
    source_refs: Mapped[list[dict[str, Any]]] = mapped_column(JSONType, default=list)


class LearningObjective(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "learning_objectives"

    chapter_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("chapters.id", ondelete="CASCADE"), index=True
    )
    objective_text: Mapped[str] = mapped_column(Text)
    position: Mapped[int] = mapped_column(Integer)
    source_refs: Mapped[list[dict[str, Any]]] = mapped_column(JSONType, default=list)
