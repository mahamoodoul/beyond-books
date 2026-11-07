"""Pilot hardening middleware (Phase 10): security headers, per-IP rate limiting, access logs."""

import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.config import get_settings
from app.core.rate_limit import SlidingWindowLimiter
from app.core.request_id import get_request_id

access_log = logging.getLogger("edu3d.access")
api_limiter = SlidingWindowLimiter()

_DOC_PATHS = ("/docs", "/redoc", "/api/v1/openapi.json")


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        h = response.headers
        h.setdefault("X-Content-Type-Options", "nosniff")
        h.setdefault("X-Frame-Options", "DENY")
        h.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        h.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        h.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        if not request.url.path.startswith(_DOC_PATHS):
            # The API only returns JSON / files; it never needs to run scripts or be framed.
            h.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
        if get_settings().cookie_secure:
            h.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        if request.url.path.startswith("/api/") and "Cache-Control" not in h:
            h["Cache-Control"] = "no-store"
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        limit = get_settings().rate_limit_per_minute
        if (
            limit > 0
            and request.url.path.startswith("/api/")
            and not request.url.path.endswith("/health")
        ):
            ip = request.client.host if request.client else "unknown"
            try:
                api_limiter.hit(f"api:{ip}", limit, 60)
            except Exception:
                return JSONResponse(
                    status_code=429,
                    headers={"Retry-After": "60"},
                    content={
                        "error": {
                            "code": "RATE_LIMITED",
                            "message": "Too many requests. Please slow down.",
                            "request_id": get_request_id(),
                            "details": [],
                        }
                    },
                )
        return await call_next(request)


class AccessLogMiddleware(BaseHTTPMiddleware):
    """Method, path template, status, duration. Never logs bodies, query strings or tokens."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        start = time.perf_counter()
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
            return response
        finally:
            route = request.scope.get("route")
            path = getattr(route, "path", None) or "unmatched"
            access_log.info(
                "%s %s %s %.1fms",
                request.method,
                path,
                status,
                (time.perf_counter() - start) * 1000,
            )
