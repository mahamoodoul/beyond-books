"""Password hashing (argon2id via argon2-cffi) and token helpers (PyJWT).

Do not hand-roll crypto here (design §12): only call into these proven libraries.
"""

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.core.config import get_settings

_hasher = PasswordHasher()
_ALGORITHM = "HS256"
# Verified against when the user does not exist, so timing doesn't reveal account existence.
_DUMMY_HASH = _hasher.hash("timing-equaliser-not-a-real-password")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerificationError, InvalidHashError):
        return False


def create_access_token(user_id: uuid.UUID, session_id: uuid.UUID) -> str:
    s = get_settings()
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "sid": str(session_id),
        "iat": now,
        "exp": now + timedelta(seconds=s.access_token_ttl_s),
        "typ": "access",
    }
    return jwt.encode(payload, s.jwt_secret, algorithm=_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any] | None:
    try:
        data: dict[str, Any] = jwt.decode(
            token,
            get_settings().jwt_secret,
            algorithms=[_ALGORITHM],
            options={"require": ["exp", "sub", "sid", "typ"]},
        )
    except jwt.PyJWTError:
        return None
    return data if data.get("typ") == "access" else None


def new_opaque_token() -> str:
    return secrets.token_urlsafe(48)


def hash_token(token: str) -> str:
    """Refresh/upload tokens are stored only as SHA-256 hashes (high-entropy, so no salt needed)."""
    return hashlib.sha256(token.encode()).hexdigest()
