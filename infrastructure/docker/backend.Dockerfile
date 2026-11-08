FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

# "[dev]" for local/CI; Coolify passes EXTRAS="" for a lean production image.
ARG EXTRAS="[dev]"

# Shared demo data for scripts/seed_deploy.py (api-start runs it when EDU3D_SEED_DEMO_DATA=true).
# Changes rarely, so it comes before the app code for layer caching.
COPY sample-courses /app/seed/sample-courses
COPY seeds /app/seed/seeds
ENV SEED_ROOT=/app/seed

COPY backend/pyproject.toml ./
COPY backend/app ./app
RUN pip install --no-cache-dir -e ".${EXTRAS}"

COPY backend/alembic.ini ./
COPY backend/migrations ./migrations
COPY scripts/course_seed.py scripts/seed_students.py scripts/seed_deploy.py /app/seed/scripts/
COPY --chmod=755 infrastructure/docker/api-start.sh /usr/local/bin/api-start
COPY backend/tests ./tests

# /exports: volume shared with the Blender container (EDU3D_BLENDER_EXPORT_DIR). uv runs the
# Blender MCP bridge (`uvx mcp-for-blender`); pre-fetch it so it works without PyPI at runtime.
RUN useradd --create-home appuser && mkdir -p /data /exports && chown appuser /data /exports \
    && pip install --no-cache-dir uv
USER appuser
ENV UV_CACHE_DIR=/home/appuser/.cache/uv
RUN uvx --from mcp-for-blender mcp-for-blender --help >/dev/null 2>&1 || true

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
