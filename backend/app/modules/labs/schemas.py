import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class LabKindOut(BaseModel):
    kind: str
    title: str
    description: str
    default_goal: dict[str, Any]
    default_palette: dict[str, Any]
    options: dict[str, Any]  # choices the teacher UI can offer (targets, tasks, materials ...)


class LabCreate(BaseModel):
    kind: str = Field(default="circuit", max_length=20)
    title: str = Field(min_length=1, max_length=200)
    course_id: uuid.UUID | None = (
        None  # POST /labs: optional; POST /courses/{id}/labs: from the path
    )
    chapter_id: uuid.UUID | None = None
    instructions: str = Field(default="", max_length=4000)
    goal: dict[str, Any] | None = None  # engine defaults when omitted
    palette: dict[str, Any] | None = None


class LabUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    course_id: uuid.UUID | None = None
    clear_course: bool = False  # make the lab standalone (also clears the chapter)
    chapter_id: uuid.UUID | None = None
    clear_chapter: bool = False
    instructions: str | None = Field(default=None, max_length=4000)
    goal: dict[str, Any] | None = None
    palette: dict[str, Any] | None = None
    status: Literal["draft", "published"] | None = None


class SessionOut(BaseModel):
    id: uuid.UUID
    status: str
    interactions: int
    state: dict[str, Any]
    result: dict[str, Any]
    achieved: list[str]
    started_at: datetime
    last_activity_at: datetime
    completed_at: datetime | None


class LabOut(BaseModel):
    id: uuid.UUID
    kind: str
    course_id: uuid.UUID | None  # None = standalone
    course_title: str | None
    chapter_id: uuid.UUID | None
    chapter_title: str | None
    title: str
    instructions: str
    goal: dict[str, Any]
    palette: dict[str, Any]
    status: str
    can_manage: bool
    created_at: datetime
    updated_at: datetime
    # teachers: how many students have a session / finished; students: their own session
    students_started: int = 0
    students_completed: int = 0
    session: SessionOut | None = None
    # teachers: why students cannot open this lab yet (None = they can)
    visibility_note: str | None = None


class LabSummary(BaseModel):
    id: uuid.UUID
    kind: str
    chapter_id: uuid.UUID | None
    title: str
    status: str
    goal: dict[str, Any]
    session_status: str | None = None  # students: in_progress | completed | None


class SessionPut(BaseModel):
    state: dict[str, Any]


class SessionResult(BaseModel):
    result: dict[str, Any]
    message: str
    goal_met: bool
    achieved: list[str]  # all sub-goals reached so far (this save included)
    session: SessionOut | None  # None for teachers trying the lab (nothing is saved)


class StudentSessionRow(BaseModel):
    student_id: uuid.UUID
    display_name: str
    status: str
    interactions: int
    summary: str  # one line about the current state, from the engine
    flag: str | None  # a problem worth a look (e.g. "short circuit"), from the engine
    achieved: int
    total: int
    goal_met: bool
    started_at: datetime
    last_activity_at: datetime
    completed_at: datetime | None
