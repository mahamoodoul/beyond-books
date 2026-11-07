import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field

Ident = Annotated[str, Field(pattern=r"^[a-z][a-z0-9_]{0,63}$")]


class ProgressUpdate(BaseModel):
    status: Literal["in_progress", "completed"]


class LessonProgressOut(BaseModel):
    lesson_id: uuid.UUID
    status: str
    completed_at: datetime | None


class EventIn(BaseModel):
    event_type: Literal[
        "lesson_opened",
        "scene_opened",
        "component_selected",
        "animation_started",
        "animation_completed",
    ]
    lesson_id: uuid.UUID
    scene_id: uuid.UUID | None = None
    component_id: Ident | None = None
    animation_id: Ident | None = None


class EventBatch(BaseModel):
    events: list[EventIn] = Field(min_length=1, max_length=50)


class EventResult(BaseModel):
    recorded: int


class OutlineLesson(BaseModel):
    id: uuid.UUID
    title: str
    position: int
    published: bool
    progress: str  # not_started | in_progress | completed


class OutlineChapter(BaseModel):
    id: uuid.UUID
    title: str
    description: str
    position: int
    published: bool
    progress: str
    lessons: list[OutlineLesson]


class CourseOutline(BaseModel):
    course_id: uuid.UUID
    title: str
    can_manage: bool
    completed_lessons: int
    total_lessons: int
    next_lesson_id: uuid.UUID | None
    chapters: list[OutlineChapter]


class CourseProgressSummary(BaseModel):
    course_id: uuid.UUID
    title: str
    completed_lessons: int
    total_lessons: int
    last_activity_at: datetime | None
    next_lesson_id: uuid.UUID | None


class StudentProgressRow(BaseModel):
    student_id: uuid.UUID
    display_name: str
    email: str
    completed_lessons: int
    total_lessons: int
    completed_chapters: int
    last_activity_at: datetime | None
