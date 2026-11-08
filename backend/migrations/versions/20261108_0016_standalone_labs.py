"""labs: a lab may have no course (standalone); its visibility no longer depends on the course

Revision ID: 0016
Revises: 0015
Create Date: 2026-11-08 05:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("circuit_labs") as batch:
        batch.alter_column("course_id", existing_type=sa.Uuid(), nullable=True)
        batch.drop_constraint("fk_circuit_labs_course_id_courses", type_="foreignkey")
        batch.create_foreign_key(
            "fk_circuit_labs_course_id_courses",
            "courses",
            ["course_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    op.execute("DELETE FROM circuit_labs WHERE course_id IS NULL")
    with op.batch_alter_table("circuit_labs") as batch:
        batch.drop_constraint("fk_circuit_labs_course_id_courses", type_="foreignkey")
        batch.create_foreign_key(
            "fk_circuit_labs_course_id_courses",
            "courses",
            ["course_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch.alter_column("course_id", existing_type=sa.Uuid(), nullable=False)
