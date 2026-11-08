"""join codes: 16 characters (replaces every existing 6-character code)

Revision ID: 0018
Revises: 0017
Create Date: 2026-11-08 08:00:00
"""

import secrets
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0018"
down_revision: str | None = "0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def upgrade() -> None:
    bind = op.get_bind()
    used: set[str] = set()
    for table in ("schools", "courses"):
        rows = bind.execute(
            sa.text(f"SELECT id, join_code FROM {table}")  # noqa: S608
        ).fetchall()
        for row_id, code in rows:
            if code and len(code) == 16:
                used.add(code)
                continue
            new = "".join(secrets.choice(ALPHABET) for _ in range(16))
            while new in used:
                new = "".join(secrets.choice(ALPHABET) for _ in range(16))
            used.add(new)
            bind.execute(
                sa.text(f"UPDATE {table} SET join_code = :code WHERE id = :id"),  # noqa: S608
                {"code": new, "id": row_id},
            )


def downgrade() -> None:
    pass  # longer codes keep working with the previous release's lookup
