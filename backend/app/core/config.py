"""Application settings. Values come from environment variables; never commit secrets."""

from functools import lru_cache
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEV_SECRET = "dev-only-insecure-secret-change-me-0123456789"  # noqa: S105


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="EDU3D_", extra="ignore")

    environment: Literal["local", "development", "staging", "production", "test"] = "local"
    app_name: str = "Edu3D AI"
    api_v1_prefix: str = "/api/v1"
    public_base_url: str = "http://localhost:5173"

    database_url: str = "postgresql+psycopg://edu3d:edu3d@localhost:5432/edu3d"
    redis_url: str = "redis://localhost:6379/0"
    cors_origins: list[str] = ["http://localhost:5173"]

    # --- auth (ADR 0004) ---
    jwt_secret: str = _DEV_SECRET
    access_token_ttl_s: int = 15 * 60
    refresh_token_ttl_s: int = 14 * 24 * 3600
    cookie_secure: bool = False
    login_max_attempts: int = 10
    login_window_s: int = 15 * 60
    open_registration: bool = True

    # --- storage ---
    storage_backend: Literal["local", "s3"] = "local"
    local_storage_dir: str = "./.storage"
    s3_bucket: str = ""
    s3_region: str = "eu-north-1"
    upload_max_bytes: int = 50 * 1024 * 1024
    upload_url_ttl_s: int = 10 * 60

    # --- workers ---
    jobs_run_inline: bool = False  # True: run jobs in-process (tests / no Redis)

    # --- AI (ADR 0006) ---
    llm_provider: Literal["fake", "openai"] = "fake"
    openai_api_key: str = ""
    openai_model: str = ""
    llm_max_output_tokens: int = 8000
    llm_timeout_s: float = 120
    llm_max_input_chars: int = 120_000
    ai_max_jobs_per_course_per_day: int = 40
    # Optional pricing for cost estimates, per 1M tokens. Leave 0 = unknown; never guess.
    llm_input_price_per_mtok: float = 0
    llm_output_price_per_mtok: float = 0

    @model_validator(mode="after")
    def _check_production_safety(self) -> "Settings":
        if self.environment in {"staging", "production"}:
            if self.jwt_secret == _DEV_SECRET or len(self.jwt_secret) < 32:
                raise ValueError("EDU3D_JWT_SECRET must be set to a strong secret")
            if not self.cookie_secure:
                raise ValueError("EDU3D_COOKIE_SECURE must be true outside local/dev")
        if self.llm_provider == "openai" and not (self.openai_api_key and self.openai_model):
            raise ValueError("EDU3D_OPENAI_API_KEY and EDU3D_OPENAI_MODEL are required")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
