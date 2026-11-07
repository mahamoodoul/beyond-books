import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.modules.organizations.models import SchoolRole
from app.modules.users.schemas import UserSummary


class SchoolCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    slug: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$")


class SchoolOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    created_at: datetime
    my_role: SchoolRole | None = None


class SchoolMemberAdd(BaseModel):
    email: EmailStr
    role: SchoolRole


class SchoolMemberOut(BaseModel):
    user: UserSummary
    role: SchoolRole
    joined_at: datetime
