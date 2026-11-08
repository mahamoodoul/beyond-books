"""circuit labs: teacher-made circuit tasks and one session per student

Revision ID: 0014
Revises: 0013
Create Date: 2026-11-08 01:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

JSON = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def upgrade() -> None:
    op.create_table(
        "circuit_labs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("course_id", sa.Uuid(), nullable=False),
        sa.Column("chapter_id", sa.Uuid(), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("instructions", sa.Text(), nullable=False, server_default=""),
        sa.Column("goal", JSON, nullable=False),
        sa.Column("palette", JSON, nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["course_id"],
            ["courses.id"],
            name=op.f("fk_circuit_labs_course_id_courses"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["chapter_id"],
            ["chapters.id"],
            name=op.f("fk_circuit_labs_chapter_id_chapters"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["users.id"], name=op.f("fk_circuit_labs_created_by_users")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_circuit_labs")),
    )
    op.create_index("ix_circuit_labs_course_id", "circuit_labs", ["course_id"])
    op.create_index("ix_circuit_labs_chapter_id", "circuit_labs", ["chapter_id"])
    op.create_table(
        "circuit_lab_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("lab_id", sa.Uuid(), nullable=False),
        sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("circuit", JSON, nullable=False),
        sa.Column("result", JSON, nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="in_progress"),
        sa.Column("interactions", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["lab_id"],
            ["circuit_labs.id"],
            name=op.f("fk_circuit_lab_sessions_lab_id_circuit_labs"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["student_id"],
            ["users.id"],
            name=op.f("fk_circuit_lab_sessions_student_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_circuit_lab_sessions")),
        sa.UniqueConstraint("lab_id", "student_id", name=op.f("uq_circuit_lab_sessions_lab_id")),
    )
    op.create_index(
        "ix_circuit_lab_sessions_lab_activity",
        "circuit_lab_sessions",
        ["lab_id", "last_activity_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_circuit_lab_sessions_lab_activity", table_name="circuit_lab_sessions")
    op.drop_table("circuit_lab_sessions")
    op.drop_index("ix_circuit_labs_chapter_id", table_name="circuit_labs")
    op.drop_index("ix_circuit_labs_course_id", table_name="circuit_labs")
    op.drop_table("circuit_labs")
