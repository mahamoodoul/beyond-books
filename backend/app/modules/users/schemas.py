import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.modules.users.models import AccountType


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    display_name: str
    account_type: AccountType
    created_at: datetime


class UserUpdate(BaseModel):
    display_name: str = Field(min_length=1, max_length=120)


class UserSummary(BaseModel):
    """Minimal user view for other users (no timestamps)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    display_name: str
