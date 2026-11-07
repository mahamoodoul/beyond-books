import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.modules.classrooms.models import ClassroomRole
from app.modules.users.schemas import UserSummary


class ClassroomCreate(BaseModel):
    school_id: uuid.UUID
    name: str = Field(min_length=1, max_length=200)
    academic_year: str | None = Field(default=None, max_length=20)


class ClassroomOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    school_id: uuid.UUID
    name: str
    academic_year: str | None
    created_at: datetime


class ClassroomMemberAdd(BaseModel):
    email: EmailStr
    role: ClassroomRole


class ClassroomMemberOut(BaseModel):
    user: UserSummary
    role: ClassroomRole
