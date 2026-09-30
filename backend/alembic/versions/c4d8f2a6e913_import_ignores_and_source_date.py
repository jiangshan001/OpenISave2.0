"""import: permanently ignored rows and explicit source calendar date

  * import_ignored_items -- statement rows the user chose to ignore for good,
    UNIQUE(source, external_id), restorable by deleting the row;
  * external_transaction_refs.source_date / source_timezone -- the statement's
    own calendar date (e.g. Asia/Shanghai) that the transaction was filed
    under, recorded explicitly next to the timezone-aware occurred_at.

Additive only (CREATE TABLE, ADD COLUMN). Existing references get NULL.

Revision ID: c4d8f2a6e913
Revises: a7c3e91f4b2d
Create Date: 2026-09-27 10:00:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = 'c4d8f2a6e913'
down_revision = 'a7c3e91f4b2d'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'import_ignored_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('source', sa.String(length=32), nullable=False),
        sa.Column('external_id', sa.String(length=64), nullable=False),
        sa.Column('import_batch_id', sa.Integer(), nullable=True),
        sa.Column('occurred_at', sa.String(length=32), nullable=True),
        sa.Column('source_date', sa.Date(), nullable=True),
        sa.Column('amount_minor', sa.BigInteger(), nullable=True),
        sa.Column('currency', sa.String(length=3), nullable=True),
        sa.Column('raw_type', sa.String(length=64), nullable=True),
        sa.Column('raw_direction', sa.String(length=16), nullable=True),
        sa.Column('raw_merchant', sa.String(length=255), nullable=True),
        sa.Column('raw_product', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['import_batch_id'], ['import_batches.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('source', 'external_id', name='uq_import_ignored_item'),
    )
    op.add_column('external_transaction_refs', sa.Column('source_date', sa.Date(), nullable=True))
    op.add_column(
        'external_transaction_refs',
        sa.Column('source_timezone', sa.String(length=40), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('external_transaction_refs', 'source_timezone')
    op.drop_column('external_transaction_refs', 'source_date')
    op.drop_table('import_ignored_items')
