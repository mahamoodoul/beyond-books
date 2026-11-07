"""saved 3D prompt drafts (AI-written build briefs, teacher-editable)

Revision ID: 0012
Revises: 0011
Create Date: 2026-11-07 18:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "three_d_prompt_drafts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("topic", sa.String(length=200), nullable=False),
        sa.Column("subject", sa.String(length=80), nullable=True),
        sa.Column("level", sa.String(length=80), nullable=True),
        sa.Column("focus", sa.String(length=500), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column(
            "parts", sa.JSON().with_variant(postgresql.JSONB(), "postgresql"), nullable=False
        ),
        sa.Column("edited", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_three_d_prompt_drafts_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_three_d_prompt_drafts")),
    )
    op.create_index(
        "ix_three_d_prompt_drafts_user_updated",
        "three_d_prompt_drafts",
        ["user_id", "updated_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_three_d_prompt_drafts_user_updated", table_name="three_d_prompt_drafts")
    op.drop_table("three_d_prompt_drafts")
