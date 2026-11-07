import uuid
from datetime import datetime

from pydantic import BaseModel, Field

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
