"""Versioned API router. Each domain module contributes its own router here as it is built."""

from fastapi import APIRouter

from app.api.v1 import health

api_router = APIRouter()
api_router.include_router(health.router)
