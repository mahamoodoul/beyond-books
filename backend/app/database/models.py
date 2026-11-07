"""Import every module's ORM models so Alembic autogenerate and create_all can see them."""

from app.database.base import Base
from app.modules.ai_engine.models import AIOutputVersion, AIUsageRecord
from app.modules.authentication.models import AuthSession
from app.modules.chapters.models import Chapter, LearningObjective
from app.modules.classrooms.models import Classroom, ClassroomMembership
from app.modules.courses.models import Course, CourseEnrollment
from app.modules.documents.models import DocumentChunk, DocumentPage, SourceDocument
from app.modules.lessons.models import Lesson, LessonVersion
from app.modules.operations.models import AuditLog, Job
from app.modules.organizations.models import School, SchoolMembership
from app.modules.progress.models import ChapterProgress, LearningEvent, LessonProgress
from app.modules.three_d.models import (
    ThreeDAnimation,
    ThreeDAsset,
    ThreeDAssetVersion,
    ThreeDScene,
)
from app.modules.users.models import User

__all__ = [
    "AIOutputVersion",
    "AIUsageRecord",
    "AuditLog",
    "AuthSession",
    "ChapterProgress",
    "LearningEvent",
    "LessonProgress",
    "Base",
    "Chapter",
    "Classroom",
    "ClassroomMembership",
    "Course",
    "CourseEnrollment",
    "DocumentChunk",
    "DocumentPage",
    "Job",
    "LearningObjective",
    "Lesson",
    "LessonVersion",
    "School",
    "SchoolMembership",
    "SourceDocument",
    "ThreeDAnimation",
    "ThreeDAsset",
    "ThreeDAssetVersion",
    "ThreeDScene",
    "User",
]
