from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.csrf import CSRF_HEADER, CSRFMiddleware
from app.core.errors import register_error_handlers
from app.core.hardening import AccessLogMiddleware, RateLimitMiddleware, SecurityHeadersMiddleware
from app.core.logging import configure_logging
from app.core.request_id import REQUEST_ID_HEADER, RequestIdMiddleware


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(fmt=settings.log_format)

    docs = settings.expose_api_docs
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        openapi_url="/api/v1/openapi.json" if docs else None,
        docs_url="/docs" if docs else None,
        redoc_url="/redoc" if docs else None,
    )
    # Starlette runs the LAST added middleware first:
    # CORS → RequestId → AccessLog → SecurityHeaders → RateLimit → CSRF → routes.
    app.add_middleware(CSRFMiddleware)
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(AccessLogMiddleware)
    app.add_middleware(RequestIdMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Content-Type", "Authorization", CSRF_HEADER, REQUEST_ID_HEADER],
        expose_headers=[REQUEST_ID_HEADER],
    )
    register_error_handlers(app)
    app.include_router(api_router, prefix=settings.api_v1_prefix)
    return app


app = create_app()
