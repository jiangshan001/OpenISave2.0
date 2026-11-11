"""Budget-only expense allocations and legacy loan deposit markers.

Revision ID: e7a5c9214d03
Revises: d9e5a1b7c302
"""
from alembic import op
import sqlalchemy as sa

revision = "e7a5c9214d03"
down_revision = "d9e5a1b7c302"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ADD COLUMN does not rebuild transactions or disturb ledger postings.
    op.add_column("transactions", sa.Column("budget_months", sa.Integer(), nullable=False,
                                            server_default="1"))
    op.add_column("transactions", sa.Column("budget_start_month", sa.Date(), nullable=True))
    op.create_table(
        "liability_receipts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("accounts.id", ondelete="RESTRICT"),
                  nullable=False, unique=True),
        sa.Column("liability_id", sa.Integer(), sa.ForeignKey("liabilities.id", ondelete="SET NULL"),
                  nullable=True),
        sa.Column("transaction_id", sa.Integer(), sa.ForeignKey("transactions.id", ondelete="RESTRICT"),
                  nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("liability_receipts")
    op.drop_column("transactions", "budget_start_month")
    op.drop_column("transactions", "budget_months")
