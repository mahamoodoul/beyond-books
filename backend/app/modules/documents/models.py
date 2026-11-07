import uuid
from enum import StrEnum
from typing import Any

from sqlalchemy import BigInteger, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, CreatedAtMixin, JSONType, TimestampMixin, UUIDPrimaryKeyMixin


class DocumentStatus(StrEnum):
    PENDING_UPLOAD = "pending_upload"
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


class SourceDocument(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "source_documents"
    __table_args__ = (Index("ix_source_documents_course_status", "course_id", "processing_status"),)

    course_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"))
    uploaded_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(255))
    original_filename: Mapped[str] = mapped_column(String(255))
    mime_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    storage_key: Mapped[str] = mapped_column(String(500))
    checksum: Mapped[str | None] = mapped_column(String(64))
    processing_status: Mapped[str] = mapped_column(
        String(20), default=DocumentStatus.PENDING_UPLOAD
    )
    page_count: Mapped[int | None] = mapped_column(Integer)
    pages_needing_ocr: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text)


class DocumentPage(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "document_pages"
    __table_args__ = (UniqueConstraint("source_document_id", "page_number"),)

    source_document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("source_documents.id", ondelete="CASCADE")
    )
    page_number: Mapped[int] = mapped_column(Integer)
    extracted_text: Mapped[str] = mapped_column(Text)
    extraction_method: Mapped[str] = mapped_column(String(20))
    quality_status: Mapped[str] = mapped_column(String(20))


class DocumentChunk(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    """Retrieval unit. An `embedding` (pgvector) column is added when semantic RAG is enabled."""

    __tablename__ = "document_chunks"
    __table_args__ = (UniqueConstraint("source_document_id", "chunk_index"),)

    source_document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("source_documents.id", ondelete="CASCADE")
    )
    chunk_index: Mapped[int] = mapped_column(Integer)
    page_start: Mapped[int] = mapped_column(Integer)
    page_end: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)
    token_count: Mapped[int] = mapped_column(Integer)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
