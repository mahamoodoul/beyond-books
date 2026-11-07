"""Import every module's ORM models so Alembic autogenerate and create_all can see them."""

from app.database.base import Base
from app.modules.authentication.models import AuthSession
from app.modules.classrooms.models import Classroom, ClassroomMembership
from app.modules.operations.models import AuditLog, Job
from app.modules.organizations.models import School, SchoolMembership
from app.modules.users.models import User

__all__ = [
    "AuditLog",
    "AuthSession",
    "Base",
    "Classroom",
    "ClassroomMembership",
    "Job",
    "School",
    "SchoolMembership",
    "User",
]
