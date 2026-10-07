"""Independent overall monthly budgets (additive; no existing table changes).

Revision ID: d9e5a1b7c302
Revises: c4d8f2a6e913
"""
from alembic import op
import sqlalchemy as sa

revision = "d9e5a1b7c302"
down_revision = "c4d8f2a6e913"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "monthly_budgets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("overall_limit_minor", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("year", "month", name="uq_monthly_budget_period"),
        sa.CheckConstraint("overall_limit_minor IS NULL OR overall_limit_minor > 0",
                           name="ck_monthly_budget_positive_limit"),
    )


def downgrade() -> None:
    # Only the new feature's table is removed; legacy category budgets survive.
    op.drop_table("monthly_budgets")
