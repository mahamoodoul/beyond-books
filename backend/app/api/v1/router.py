"""Versioned API router. Each domain module contributes its own router here."""

from fastapi import APIRouter

from app.api.v1 import health, storage
from app.modules.ai_engine.api import router as ai_router
from app.modules.analytics.api import router as analytics_router
from app.modules.animations.api import router as animations_router
from app.modules.assessments.api import router as assessments_router
from app.modules.authentication.api import router as auth_router
from app.modules.chapters.api import router as chapters_router
from app.modules.classrooms.api import router as classrooms_router
from app.modules.courses.api import router as courses_router
from app.modules.documents.api import router as documents_router
from app.modules.labs.api import router as labs_router
from app.modules.lessons.api import router as lessons_router
from app.modules.operations.api import router as jobs_router
from app.modules.organizations.api import router as schools_router
from app.modules.progress.api import router as progress_router
from app.modules.speech.api import router as speech_router
from app.modules.three_d.api import router as three_d_router
from app.modules.users.api import router as users_router

api_router = APIRouter()
for r in (
    health.router,
    storage.router,
    auth_router,
    users_router,
    schools_router,
    classrooms_router,
    courses_router,
    documents_router,
    jobs_router,
    chapters_router,
    lessons_router,
    ai_router,
    three_d_router,
    animations_router,
    progress_router,
    assessments_router,
    analytics_router,
    speech_router,
    labs_router,
):
    api_router.include_router(r)
