import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

from app.modules.courses.models import CourseStatus
from app.modules.users.schemas import UserSummary


class CourseCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=5000)
    subject: str | None = Field(default=None, max_length=80)
    grade_level: str | None = Field(default=None, max_length=40)
    school_id: uuid.UUID | None = None


class CourseUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    subject: str | None = Field(default=None, max_length=80)
    grade_level: str | None = Field(default=None, max_length=40)
    status: CourseStatus | None = None


class CourseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    school_id: uuid.UUID | None
    title: str
    description: str
    subject: str | None
    grade_level: str | None
    status: CourseStatus
    created_at: datetime
    updated_at: datetime
    can_manage: bool = False
    join_code: str | None = None  # shown to managers only


class EnrollRequest(BaseModel):
    student_email: EmailStr | None = None
    classroom_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def _one_target(self) -> "EnrollRequest":
        if (self.student_email is None) == (self.classroom_id is None):
            raise ValueError("provide exactly one of student_email or classroom_id")
        return self


class EnrollmentOut(BaseModel):
    student: UserSummary
    classroom_id: uuid.UUID | None
    enrolled_at: datetime


class EnrollResult(BaseModel):
    enrolled: int
    already_enrolled: int
