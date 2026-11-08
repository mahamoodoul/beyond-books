import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.lessons.content import LessonContent


class LessonCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: LessonContent = Field(default_factory=LessonContent)


class LessonUpdate(BaseModel):
    expected_version: int = Field(ge=1, description="Optimistic concurrency check.")
    title: str | None = Field(default=None, min_length=1, max_length=200)
    content: LessonContent | None = None


class LessonOut(BaseModel):
    id: uuid.UUID
    chapter_id: uuid.UUID
    title: str
    position: int
    status: str
    version: int
    published_version: int | None
    has_unpublished_changes: bool
    origin: str
    content: LessonContent
    updated_at: datetime


class LessonSummary(BaseModel):
    id: uuid.UUID
    title: str
    position: int
    status: str
    version: int
    published_version: int | None
    has_unpublished_changes: bool
    origin: str


class LessonVersionOut(BaseModel):
    version_number: int
    title: str
    change_source: str
    created_at: datetime


class LessonMediaCreate(BaseModel):
    kind: Literal["image", "ar_target"]
    content_type: Literal["image/png", "image/jpeg", "image/webp", "application/octet-stream"]
    size_bytes: int = Field(gt=0)
    title: str = Field(default="", max_length=200)
    alt_text: str = Field(default="", max_length=2000)


class LessonMediaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    lesson_id: uuid.UUID
    kind: str
    title: str
    alt_text: str
    position: int
    content_type: str
    file_size_bytes: int
    status: str
    url: str | None = None  # short-lived download link, only for ready media


class LessonMediaUpload(BaseModel):
    media: LessonMediaOut
    url: str
    method: str
    headers: dict[str, str]
