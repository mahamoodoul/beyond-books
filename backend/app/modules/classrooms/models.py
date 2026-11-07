import uuid
from enum import StrEnum

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, CreatedAtMixin, TimestampMixin, UUIDPrimaryKeyMixin


class ClassroomRole(StrEnum):
    TEACHER = "teacher"
    STUDENT = "student"


class Classroom(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "classrooms"

    school_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("schools.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    academic_year: Mapped[str | None] = mapped_column(String(20))
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(20), default="active")


class ClassroomMembership(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "classroom_memberships"
    __table_args__ = (UniqueConstraint("classroom_id", "user_id"),)

    classroom_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("classrooms.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    membership_role: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default="active")
