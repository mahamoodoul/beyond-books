import uuid
from typing import Literal

from pydantic import BaseModel, Field


class JoinPreview(BaseModel):
    """What a code unlocks, shown before an account is created or a code is applied."""

    code: str
    kind: Literal["school", "course"]
    id: uuid.UUID
    name: str
    school_name: str | None = None  # for a course that belongs to a school
    teacher_name: str | None = None  # course owner
    subject: str | None = None
    grade_level: str | None = None
    as_teacher: str  # what a teacher gets from this code
    as_student: str  # what a student gets from this code


class JoinRequest(BaseModel):
    code: str = Field(min_length=16, max_length=24)  # 16 characters, dashes optional


class JoinResult(BaseModel):
    kind: Literal["school", "course"]
    name: str
    joined: list[str]  # human sentences: what changed for this account


class AffiliationSchool(BaseModel):
    id: uuid.UUID
    name: str
    role: str
    join_code: str | None = None  # admins and teachers only


class AffiliationCourse(BaseModel):
    id: uuid.UUID
    title: str
    role: Literal["teacher", "student"]
    status: str
    subject: str | None = None
    school_name: str | None = None
    join_code: str | None = None  # managers only


class Affiliations(BaseModel):
    schools: list[AffiliationSchool]
    courses: list[AffiliationCourse]
