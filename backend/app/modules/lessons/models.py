import uuid
from typing import Any

from sqlalchemy import BigInteger, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, CreatedAtMixin, JSONType, TimestampMixin, UUIDPrimaryKeyMixin


class Lesson(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """`version` increases on every content change; `published_version` points at the snapshot
    students see, so teachers can keep editing without changing what is live."""

    __tablename__ = "lessons"
    __table_args__ = (Index("ix_lessons_chapter_position", "chapter_id", "position"),)

    chapter_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("chapters.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(200))
    position: Mapped[int] = mapped_column(Integer)
    content_json: Mapped[dict[str, Any]] = mapped_column(JSONType)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    version: Mapped[int] = mapped_column(Integer, default=1)
    published_version: Mapped[int | None] = mapped_column(Integer)
    origin: Mapped[str] = mapped_column(String(20), default="manual")  # manual | ai


class LessonVersion(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "lesson_versions"
    __table_args__ = (UniqueConstraint("lesson_id", "version_number"),)

    lesson_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("lessons.id", ondelete="CASCADE"))
    version_number: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(200))
    content_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONType)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    change_source: Mapped[str] = mapped_column(String(30), default="manual")


class LessonMediaKind:
    IMAGE = "image"  # a picture shown with the lesson (e.g. the textbook page)
    AR_TARGET = "ar_target"  # compiled MindAR target (.mind) for scanning that page with the camera


class LessonMedia(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    """A file that belongs to a lesson (picture, AR scan target), kept in file storage.

    Uploaded like 3D models: create (get an upload URL) -> PUT the file -> complete (checked).
    Students see `ready` media of published lessons they can open; teachers manage it.
    """

    __tablename__ = "lesson_media"

    lesson_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("lessons.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(200), default="")
    alt_text: Mapped[str] = mapped_column(Text, default="")
    position: Mapped[int] = mapped_column(Integer, default=0)
    storage_key: Mapped[str] = mapped_column(String(500))
    content_type: Mapped[str] = mapped_column(String(100))
    file_size_bytes: Mapped[int] = mapped_column(BigInteger)
    status: Mapped[str] = mapped_column(String(20), default="pending_upload")  # -> ready
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
