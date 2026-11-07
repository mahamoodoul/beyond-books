"""Application settings. Values come from environment variables; never commit secrets."""

from functools import lru_cache
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEV_SECRET = "dev-only-insecure-secret-change-me-0123456789"  # noqa: S105


class Settings(BaseSettings):
    # The dotenv file is chosen in get_settings() (EDU3D_ENV_FILE), never implicitly.
    model_config = SettingsConfigDict(env_file=None, env_prefix="EDU3D_", extra="ignore")

    environment: Literal["local", "development", "staging", "production", "test"] = "local"
    app_name: str = "Beyond Books"
    api_v1_prefix: str = "/api/v1"
    public_base_url: str = "http://localhost:5173"

    database_url: str = "postgresql+psycopg://edu3d:edu3d@localhost:5432/edu3d"
    redis_url: str = "redis://localhost:6379/0"
    cors_origins: list[str] = ["http://localhost:5173"]
    expose_api_docs: bool = True  # forced off in staging/production
    log_format: Literal["text", "json"] = "text"
    rate_limit_per_minute: int = 600  # per client IP, all endpoints (in-process)

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
    download_url_ttl_s: int = 10 * 60
    asset_max_bytes: int = 30 * 1024 * 1024

    # --- workers ---
    jobs_run_inline: bool = False  # True: run jobs in-process (tests / no Redis)

    # --- AI (ADR 0006) ---
    # Provider names are validated against app/integrations/providers.py (the registry).
    llm_provider: str = "fake"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-opus-5-5"
    anthropic_effort: Literal["low", "medium", "high", "xhigh", "max"] = "medium"
    openai_api_key: str = ""
    openai_model: str = ""
    openai_base_url: str = ""  # optional: any OpenAI-compatible endpoint
    llm_max_output_tokens: int = 16000  # detailed 3D designs (20-30 parts) need more than 8k
    llm_timeout_s: float = 120
    llm_max_input_chars: int = 120_000
    ai_max_jobs_per_course_per_day: int = 40

    # --- 3D generation (ADR 0009) ---
    three_d_provider: str = "fake"
    tripo_api_key: str = ""
    meshy_api_key: str = ""
    three_d_max_generations_per_user_per_day: int = 5
    # 3D provider "blender": Claude builds the model in a running Blender via Blender MCP
    # (mcp-for-blender). Local/dev only: the MCP tools run Python inside that Blender.
    blender_mcp_command: str = "uvx mcp-for-blender"
    blender_host: str = "localhost"
    blender_port: int = 9876
    blender_model: str = ""  # empty = use EDU3D_ANTHROPIC_MODEL
    blender_max_turns: int = 40  # Claude ↔ Blender tool round trips per model
    blender_timeout_s: float = 540  # whole build, must stay below the job poll window (~10 min)
    # Optional pricing for cost estimates, per 1M tokens. Leave 0 = unknown; never guess.
    llm_input_price_per_mtok: float = 0
    llm_output_price_per_mtok: float = 0

    @model_validator(mode="after")
    def _check_production_safety(self) -> "Settings":
        from app.integrations import providers

        problems = providers.validate("llm", self.llm_provider, self) + providers.validate(
            "three_d", self.three_d_provider, self
        )
        if problems:
            raise ValueError("; ".join(problems))
        if self.environment in {"staging", "production"}:
            if self.jwt_secret == _DEV_SECRET or len(self.jwt_secret) < 32:
                raise ValueError("EDU3D_JWT_SECRET must be set to a strong secret")
            if not self.cookie_secure:
                raise ValueError("EDU3D_COOKIE_SECURE must be true outside local/dev")
            for kind, name in (("llm", self.llm_provider), ("three_d", self.three_d_provider)):
                spec = providers.get_spec(kind, name)  # type: ignore[arg-type]
                if spec is not None and not spec.production_ready:
                    raise ValueError(
                        f"{kind} provider '{name}' is not allowed in staging/production"
                    )
            if self.jobs_run_inline:
                raise ValueError("EDU3D_JOBS_RUN_INLINE must be false in staging/production")
            self.expose_api_docs = False
        return self


def _load_aws_secret() -> None:
    """If EDU3D_AWS_SECRET_ID is set, load a JSON secret (Secrets Manager) into the environment.
    Values already present in the environment win, so local overrides keep working."""
    import json
    import os

    secret_id = os.environ.get("EDU3D_AWS_SECRET_ID")
    if not secret_id:
        return
    import boto3

    client = boto3.client("secretsmanager", region_name=os.environ.get("EDU3D_AWS_REGION"))
    payload = json.loads(client.get_secret_value(SecretId=secret_id)["SecretString"])
    for key, value in payload.items():
        if key.startswith("EDU3D_") and key not in os.environ:
            os.environ[key] = str(value)


@lru_cache
def get_settings() -> Settings:
    """EDU3D_ENV_FILE overrides which dotenv file is read ("" = none, used by the test suite)."""
    import os

    _load_aws_secret()
    env_file = os.environ.get("EDU3D_ENV_FILE", ".env")
    return Settings(_env_file=env_file or None)
