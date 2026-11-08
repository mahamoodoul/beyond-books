from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import (
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
    UnauthenticatedError,
)
from app.core.security import create_access_token, hash_token, new_opaque_token
from app.modules.authentication.identity import get_identity_provider
from app.modules.authentication.models import AuthSession
from app.modules.authentication.schemas import RegisterRequest
from app.modules.operations import audit
from app.modules.users.models import User
from app.modules.users.repository import get_by_email, normalize_email


@dataclass(frozen=True)
class IssuedTokens:
    user: User
    access_token: str
    refresh_token: str


def register(db: Session, body: RegisterRequest) -> User:
    if not get_settings().open_registration:
        raise PermissionDeniedError("Registration is by invitation only.")
    if get_by_email(db, body.email):
        raise ConflictError("An account with this email already exists.")
    user = User(
        email=normalize_email(body.email),
        display_name=body.display_name,
        account_type=body.account_type,
    )
    get_identity_provider().set_credentials(user, body.password)
    db.add(user)
    db.flush()
    audit.record(
        db, action="user.register", resource_type="user", resource_id=user.id, actor_user_id=user.id
    )
    db.commit()
    return user


def _issue(db: Session, user: User, user_agent: str | None) -> IssuedTokens:
    refresh = new_opaque_token()
    session = AuthSession(
        user_id=user.id,
        refresh_token_hash=hash_token(refresh),
        expires_at=datetime.now(UTC) + timedelta(seconds=get_settings().refresh_token_ttl_s),
        user_agent=(user_agent or "")[:255] or None,
    )
    db.add(session)
    db.flush()
    return IssuedTokens(user, create_access_token(user.id, session.id), refresh)


def login(db: Session, email: str, password: str, user_agent: str | None) -> IssuedTokens:
    user = get_identity_provider().authenticate(db, email, password)
    if user is None:
        audit.record(db, action="auth.login", resource_type="user", outcome="failure")
        db.commit()
        raise UnauthenticatedError("Invalid email or password.")
    tokens = _issue(db, user, user_agent)
    audit.record(
        db, action="auth.login", resource_type="user", resource_id=user.id, actor_user_id=user.id
    )
    db.commit()
    return tokens


def demo_login(db: Session, role: str, user_agent: str | None) -> IssuedTokens:
    """Demo mode: sign in as the demo teacher or student, creating the account on first use."""
    s = get_settings()
    if not s.demo_mode:
        raise NotFoundError("Demo mode is off.")
    email = s.demo_teacher_email if role == "teacher" else s.demo_student_email
    user = get_by_email(db, email)
    if user is None:
        user = User(
            email=normalize_email(email),
            display_name="Demo teacher" if role == "teacher" else "Demo student",
            account_type=role,
        )
        db.add(user)
        db.flush()
        audit.record(
            db,
            action="user.register",
            resource_type="user",
            resource_id=user.id,
            actor_user_id=user.id,
        )
    elif user.account_type != role or not user.is_active:
        raise ConflictError(f"The demo {role} account ({email}) is not an active {role} account.")
    tokens = _issue(db, user, user_agent)
    audit.record(
        db,
        action="auth.demo_login",
        resource_type="user",
        resource_id=user.id,
        actor_user_id=user.id,
    )
    db.commit()
    return tokens


def refresh(db: Session, refresh_token: str, user_agent: str | None) -> IssuedTokens:
    """Rotate: the presented refresh token is revoked and a new session issued.

    Reuse of an already-revoked token revokes all of that user's sessions (token theft signal).
    """
    now = datetime.now(UTC)
    session = db.scalar(
        select(AuthSession).where(AuthSession.refresh_token_hash == hash_token(refresh_token))
    )
    if session is None:
        raise UnauthenticatedError()
    if session.revoked_at is not None:
        for s in db.scalars(select(AuthSession).where(AuthSession.user_id == session.user_id)):
            s.revoked_at = s.revoked_at or now
        audit.record(
            db,
            action="auth.refresh_reuse",
            resource_type="user",
            resource_id=session.user_id,
            outcome="blocked",
        )
        db.commit()
        raise UnauthenticatedError()
    user = db.get(User, session.user_id)
    if session.expires_at <= now or user is None or not user.is_active:
        raise UnauthenticatedError()
    session.revoked_at = now
    tokens = _issue(db, user, user_agent)
    db.commit()
    return tokens


def logout(db: Session, refresh_token: str | None) -> None:
    if not refresh_token:
        return
    session = db.scalar(
        select(AuthSession).where(AuthSession.refresh_token_hash == hash_token(refresh_token))
    )
    if session and session.revoked_at is None:
        session.revoked_at = datetime.now(UTC)
        audit.record(
            db,
            action="auth.logout",
            resource_type="user",
            resource_id=session.user_id,
            actor_user_id=session.user_id,
        )
        db.commit()
