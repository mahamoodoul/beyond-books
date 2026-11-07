# Production API / worker image: no dev dependencies, non-root, health-checked.
FROM python:3.12-slim AS build
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /src
COPY backend/pyproject.toml ./
COPY backend/app ./app
RUN pip wheel --wheel-dir /wheels .

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 EDU3D_LOG_FORMAT=json WEB_CONCURRENCY=2
WORKDIR /app
COPY --from=build /wheels /wheels
RUN pip install --no-cache-dir /wheels/*.whl && rm -rf /wheels
COPY backend/alembic.ini ./
COPY backend/migrations ./migrations
RUN useradd --create-home --uid 10001 appuser && mkdir -p /data && chown appuser /data
USER appuser
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health', timeout=2).status == 200 else 1)"
# --proxy-headers: trust X-Forwarded-* from the load balancer / nginx in front of the API.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*' --workers ${WEB_CONCURRENCY}"]
