import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.documents.models import DocumentStatus
from app.modules.operations.api import JobOut

MimeType = Literal["application/pdf", "text/plain", "text/markdown"]


class UploadUrlRequest(BaseModel):
    course_id: uuid.UUID
    filename: str = Field(min_length=1, max_length=255)
    mime_type: MimeType
    size_bytes: int = Field(gt=0)
    title: str | None = Field(default=None, max_length=255)


class TextDocumentRequest(BaseModel):
    course_id: uuid.UUID
    title: str = Field(min_length=1, max_length=255)
    text: str = Field(min_length=1, max_length=1_000_000)


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    course_id: uuid.UUID
    title: str
    original_filename: str
    mime_type: str
    size_bytes: int
    processing_status: DocumentStatus
    page_count: int | None
    pages_needing_ocr: int
    error_message: str | None
    created_at: datetime


class UploadInstructions(BaseModel):
    url: str
    method: str
    headers: dict[str, str]


class UploadUrlResponse(BaseModel):
    document: DocumentOut
    upload: UploadInstructions


class DocumentJobResponse(BaseModel):
    document: DocumentOut
    job: JobOut


class PageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    page_number: int
    extracted_text: str
    extraction_method: str
    quality_status: str


class PageList(BaseModel):
    total: int
    items: list[PageOut]
