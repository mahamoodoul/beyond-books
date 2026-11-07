"""Identity provider abstraction (ADR 0004).

The local provider keeps argon2id password hashes in `users.password_hash`. A managed provider
(e.g. Cognito) would implement the same protocol and store only `identity_subject`.
"""

from typing import Protocol

from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.modules.users.models import User
from app.modules.users.repository import get_by_email


class IdentityProvider(Protocol):
    def set_credentials(self, user: User, password: str) -> None: ...

    def authenticate(self, db: Session, email: str, password: str) -> User | None: ...


class LocalIdentityProvider:
    def set_credentials(self, user: User, password: str) -> None:
        user.password_hash = hash_password(password)

    def authenticate(self, db: Session, email: str, password: str) -> User | None:
        user = get_by_email(db, email)
        ok = verify_password(password, user.password_hash if user else None)
        return user if ok and user is not None and user.is_active else None


def get_identity_provider() -> IdentityProvider:
    return LocalIdentityProvider()
