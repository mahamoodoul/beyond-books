FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

# "[dev]" for local/CI; Coolify passes EXTRAS="" for a lean production image.
ARG EXTRAS="[dev]"

COPY backend/pyproject.toml ./
COPY backend/app ./app
RUN pip install --no-cache-dir -e ".${EXTRAS}"

COPY backend/alembic.ini ./
COPY backend/migrations ./migrations
COPY --chmod=755 infrastructure/docker/api-start.sh /usr/local/bin/api-start
COPY backend/tests ./tests

RUN useradd --create-home appuser && mkdir -p /data && chown appuser /data
USER appuser

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
