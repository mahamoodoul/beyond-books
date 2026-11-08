"""join codes on schools and courses, backfilled for existing rows

Revision ID: 0017
Revises: 0016
Create Date: 2026-11-08 06:00:00
"""

import secrets
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0017"
down_revision: str | None = "0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def upgrade() -> None:
    op.add_column("schools", sa.Column("join_code", sa.String(length=16), nullable=True))
    op.add_column("courses", sa.Column("join_code", sa.String(length=16), nullable=True))
    bind = op.get_bind()
    used: set[str] = set()
    for table in ("schools", "courses"):
        ids = [row[0] for row in bind.execute(sa.text(f"SELECT id FROM {table}")).fetchall()]  # noqa: S608
        for row_id in ids:
            code = "".join(secrets.choice(ALPHABET) for _ in range(6))
            while code in used:
                code = "".join(secrets.choice(ALPHABET) for _ in range(6))
            used.add(code)
            bind.execute(
                sa.text(f"UPDATE {table} SET join_code = :code WHERE id = :id"),  # noqa: S608
                {"code": code, "id": row_id},
            )
    with op.batch_alter_table("schools") as batch:
        batch.create_unique_constraint("uq_schools_join_code", ["join_code"])
    with op.batch_alter_table("courses") as batch:
        batch.create_unique_constraint("uq_courses_join_code", ["join_code"])


def downgrade() -> None:
    with op.batch_alter_table("courses") as batch:
        batch.drop_constraint("uq_courses_join_code", type_="unique")
        batch.drop_column("join_code")
    with op.batch_alter_table("schools") as batch:
        batch.drop_constraint("uq_schools_join_code", type_="unique")
        batch.drop_column("join_code")
