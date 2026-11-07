"""Consistent error envelope (design §9).

Every error response has the shape:
    {"error": {"code": ..., "message": ..., "request_id": ..., "details": [...]}}
"""

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.request_id import get_request_id


class ErrorBody(BaseModel):
    code: str
    message: str
    request_id: str | None
    details: list[dict[str, Any]] = []


class ErrorEnvelope(BaseModel):
    error: ErrorBody


class AppError(Exception):
    """Base class for domain errors raised by services."""

    status_code = 400
    code = "BAD_REQUEST"
    message = "The request could not be processed."

    def __init__(self, message: str | None = None, details: list[dict[str, Any]] | None = None):
        super().__init__(message or self.message)
        self.message = message or self.message
        self.details = details or []


class NotFoundError(AppError):
    status_code = 404
    code = "RESOURCE_NOT_FOUND"
    message = "The requested resource was not found."


class PermissionDeniedError(AppError):
    status_code = 403
    code = "PERMISSION_DENIED"
    message = "You do not have permission to perform this action."


class ConflictError(AppError):
    status_code = 409
    code = "CONFLICT"
    message = "The request conflicts with the current state of the resource."


_HTTP_CODES = {
    400: "BAD_REQUEST",
    401: "UNAUTHENTICATED",
    403: "PERMISSION_DENIED",
    404: "RESOURCE_NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    429: "RATE_LIMITED",
}


def _envelope(status: int, code: str, message: str, details: list[dict[str, Any]]) -> JSONResponse:
    body = ErrorEnvelope(
        error=ErrorBody(code=code, message=message, request_id=get_request_id(), details=details)
    )
    return JSONResponse(status_code=status, content=body.model_dump())


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return _envelope(exc.status_code, exc.code, exc.message, exc.details)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = [
            {"loc": list(e.get("loc", [])), "msg": e.get("msg"), "type": e.get("type")}
            for e in exc.errors()
        ]
        return _envelope(422, "VALIDATION_ERROR", "The request is invalid.", details)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = _HTTP_CODES.get(exc.status_code, "HTTP_ERROR")
        return _envelope(exc.status_code, code, str(exc.detail), [])

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, __: Exception) -> JSONResponse:
        # Never leak internals; the request_id links the response to server logs.
        return _envelope(500, "INTERNAL_ERROR", "An unexpected error occurred.", [])


class UnauthenticatedError(AppError):
    status_code = 401
    code = "UNAUTHENTICATED"
    message = "Authentication is required."


class RateLimitedError(AppError):
    status_code = 429
    code = "RATE_LIMITED"
    message = "Too many attempts. Please try again later."
