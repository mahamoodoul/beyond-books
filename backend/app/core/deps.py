"""Shared FastAPI dependencies. Identity is ALWAYS resolved server-side (design §12):
never trust a user ID, role or school ID supplied by the client."""

import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.errors import PermissionDeniedError, UnauthenticatedError
from app.core.security import decode_access_token
from app.database.session import get_db
from app.modules.authentication.models import AuthSession
from app.modules.users.models import AccountType, User

ACCESS_COOKIE = "edu3d_access"
REFRESH_COOKIE = "edu3d_refresh"

DB = Annotated[Session, Depends(get_db)]


def _token_from_request(request: Request) -> str | None:
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return request.cookies.get(ACCESS_COOKIE)


def get_current_user(request: Request, db: DB) -> User:
    token = _token_from_request(request)
    claims = decode_access_token(token) if token else None
    if not claims:
        raise UnauthenticatedError()
    try:
        user_id, session_id = uuid.UUID(claims["sub"]), uuid.UUID(claims["sid"])
    except (KeyError, ValueError) as exc:
        raise UnauthenticatedError() from exc
    session = db.get(AuthSession, session_id)
    if (
        session is None
        or session.user_id != user_id
        or session.revoked_at is not None
        or session.expires_at <= datetime.now(UTC)
    ):
        raise UnauthenticatedError()
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise UnauthenticatedError()
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_teacher(user: CurrentUser) -> User:
    if user.account_type != AccountType.TEACHER:
        raise PermissionDeniedError("Only teachers can perform this action.")
    return user


Teacher = Annotated[User, Depends(require_teacher)]
