"""labs: a kind per lab (circuit, molecules, buoyancy), generic session state, achieved sub-goals

Revision ID: 0015
Revises: 0014
Create Date: 2026-11-08 03:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

JSON = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def upgrade() -> None:
    op.add_column(
        "circuit_labs",
        sa.Column("kind", sa.String(length=20), nullable=False, server_default="circuit"),
    )
    with op.batch_alter_table("circuit_lab_sessions") as batch:
        batch.alter_column("circuit", new_column_name="state")
        batch.add_column(sa.Column("achieved", JSON, nullable=False, server_default="[]"))


def downgrade() -> None:
    with op.batch_alter_table("circuit_lab_sessions") as batch:
        batch.drop_column("achieved")
        batch.alter_column("state", new_column_name="circuit")
    op.drop_column("circuit_labs", "kind")
