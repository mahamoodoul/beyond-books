from datetime import datetime
from enum import StrEnum

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin, UTCDateTime, UUIDPrimaryKeyMixin


class AccountType(StrEnum):
    TEACHER = "teacher"
    STUDENT = "student"


class UserStatus(StrEnum):
    ACTIVE = "active"
    DISABLED = "disabled"


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"

    # Stored lower-cased; uniqueness is case-insensitive by construction.
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(120))
    account_type: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default=UserStatus.ACTIVE)
    # Local identity provider only; NULL when an external IdP (e.g. Cognito) owns credentials.
    password_hash: Mapped[str | None] = mapped_column(String(255))
    identity_subject: Mapped[str | None] = mapped_column(String(255), unique=True)
    email_verified_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    @property
    def is_active(self) -> bool:
        return self.status == UserStatus.ACTIVE

    def __repr__(self) -> str:  # never include email/PII in reprs that may hit logs
        return f"<User {self.id}>"
