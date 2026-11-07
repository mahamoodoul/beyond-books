"""Application settings. Values come from environment variables; never commit secrets."""

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="EDU3D_", extra="ignore")

    environment: Literal["local", "development", "staging", "production", "test"] = "local"
    app_name: str = "Beyond Books"
    api_v1_prefix: str = "/api/v1"

    database_url: str = "postgresql+psycopg://edu3d:edu3d@localhost:5432/edu3d"
    redis_url: str = "redis://localhost:6379/0"

    cors_origins: list[str] = ["http://localhost:5173"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
