import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.modules.chapters.models import PublishStatus


class ChapterSourceRef(BaseModel):
    document_id: uuid.UUID
    page_start: int = Field(ge=1)
    page_end: int = Field(ge=1)


class ObjectiveIn(BaseModel):
    text: str = Field(min_length=1, max_length=1000)
    source_refs: list[dict[str, Any]] = Field(default_factory=list, max_length=20)


class ObjectiveOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    objective_text: str
    position: int
    source_refs: list[dict[str, Any]]


class ChapterCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=5000)
    source_refs: list[ChapterSourceRef] = Field(default_factory=list, max_length=20)


class ChapterUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    position: int | None = Field(default=None, ge=1)
    status: PublishStatus | None = None
    source_refs: list[ChapterSourceRef] | None = Field(default=None, max_length=20)
    ai_instructions: str | None = Field(default=None, max_length=2000)


class ChapterOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    course_id: uuid.UUID
    title: str
    description: str
    position: int
    status: PublishStatus
    source_refs: list[dict[str, Any]]
    updated_at: datetime


class ChapterDetail(ChapterOut):
    # The teacher's chapter prompt; only returned to people who can manage the chapter.
    ai_instructions: str = ""
    objectives: list[ObjectiveOut] = []


class ChapterOverview(ChapterOut):
    """A chapter card on the course page: status plus what is inside it."""

    lessons: int = 0
    published_lessons: int = 0
    scenes: int = 0
    quizzes: int = 0
    objectives: int = 0
