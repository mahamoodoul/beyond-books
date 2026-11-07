"""Versioned API router. Each domain module contributes its own router here."""

from fastapi import APIRouter

from app.api.v1 import health
from app.modules.authentication.api import router as auth_router
from app.modules.classrooms.api import router as classrooms_router
from app.modules.organizations.api import router as schools_router
from app.modules.users.api import router as users_router

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(schools_router)
api_router.include_router(classrooms_router)
