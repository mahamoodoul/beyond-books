"""CSRF defence for cookie-authenticated requests.

Cookies are SameSite=Lax. Additionally, any state-changing request that carries an auth cookie
must send `X-Requested-With: edu3d`; a cross-site form or simple request cannot set that header
without a CORS preflight, which our CORS allowlist rejects.
"""

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.request_id import get_request_id

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
CSRF_HEADER = "X-Requested-With"
CSRF_VALUE = "edu3d"
_AUTH_COOKIES = ("edu3d_access", "edu3d_refresh")


class CSRFMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if (
            request.method not in SAFE_METHODS
            and any(c in request.cookies for c in _AUTH_COOKIES)
            and "authorization" not in request.headers
            and request.headers.get(CSRF_HEADER) != CSRF_VALUE
        ):
            return JSONResponse(
                status_code=403,
                content={
                    "error": {
                        "code": "CSRF_CHECK_FAILED",
                        "message": "Missing CSRF header.",
                        "request_id": get_request_id(),
                        "details": [],
                    }
                },
            )
        return await call_next(request)
