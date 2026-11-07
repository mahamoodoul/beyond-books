"""chapter ai instructions (teacher's chapter prompt for AI generation)

Revision ID: 0011
Revises: 0010
Create Date: 2026-11-07 14:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "chapters",
        sa.Column("ai_instructions", sa.Text(), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_column("chapters", "ai_instructions")
