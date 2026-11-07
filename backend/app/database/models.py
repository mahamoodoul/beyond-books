"""Import every module's ORM models here so Alembic autogenerate can discover them.

Tables arrive in Phase 1+ (design §15). Keep this list in sync as modules add models.py.
"""

from app.database.base import Base

__all__ = ["Base"]
