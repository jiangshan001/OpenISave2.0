"""recurring transactions and statement import

Adds, for 2.2:

  * recurring_rules / recurring_occurrences -- schedules and the
    UNIQUE(rule_id, occurrence_date) idempotency key;
  * import_batches, external_transaction_refs (UNIQUE(source, external_id) is
    the duplicate-import guard), import_account_mappings and
    categorisation_rules;
  * provenance columns on transactions.

Additive only: CREATE TABLE plus ADD COLUMN. The transactions table is never
rebuilt -- with foreign keys on, a batch-mode rebuild would DROP it and cascade
into postings -- so the new transaction columns carry indexes but no FOREIGN
KEY clause (SQLite cannot add one without a rebuild). Existing rows get NULL.

Revision ID: a7c3e91f4b2d
Revises: 5d1c7e9a2b40
Create Date: 2026-09-26 23:00:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = 'a7c3e91f4b2d'
down_revision = '5d1c7e9a2b40'
branch_labels = None
depends_on = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        'recurring_rules',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('transaction_type', sa.String(length=16), nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('destination_account_id', sa.Integer(), nullable=True),
        sa.Column('category_id', sa.Integer(), nullable=True),
        sa.Column('amount_minor', sa.BigInteger(), nullable=False),
        sa.Column('currency', sa.String(length=3), nullable=False),
        sa.Column('dest_amount_minor', sa.BigInteger(), nullable=True),
        sa.Column('description', sa.String(length=200), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('frequency', sa.String(length=16), nullable=False),
        sa.Column('interval', sa.Integer(), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=True),
        sa.Column('day_of_month', sa.Integer(), nullable=True),
        sa.Column('next_run_date', sa.Date(), nullable=True),
        sa.Column('mode', sa.String(length=16), nullable=False),
        sa.Column('status', sa.String(length=16), nullable=False),
        sa.Column('last_generated_at', sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['destination_account_id'], ['accounts.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['category_id'], ['categories.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_recurring_rules_account_id', 'recurring_rules', ['account_id'])
    op.create_index('ix_recurring_rules_next_run_date', 'recurring_rules', ['next_run_date'])
    op.create_index('ix_recurring_rules_status', 'recurring_rules', ['status'])

    op.create_table(
        'recurring_occurrences',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('rule_id', sa.Integer(), nullable=False),
        sa.Column('occurrence_date', sa.Date(), nullable=False),
        sa.Column('status', sa.String(length=16), nullable=False),
        sa.Column('transaction_id', sa.Integer(), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(['rule_id'], ['recurring_rules.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['transaction_id'], ['transactions.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('rule_id', 'occurrence_date', name='uq_recurring_occurrence'),
    )
    op.create_index('ix_recurring_occurrences_rule_id', 'recurring_occurrences', ['rule_id'])

    op.create_table(
        'import_batches',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('source', sa.String(length=32), nullable=False),
        sa.Column('file_name', sa.String(length=255), nullable=True),
        sa.Column('period_start', sa.Date(), nullable=True),
        sa.Column('period_end', sa.Date(), nullable=True),
        sa.Column('detected_count', sa.Integer(), nullable=False),
        sa.Column('imported_count', sa.Integer(), nullable=False),
        sa.Column('duplicate_count', sa.Integer(), nullable=False),
        sa.Column('skipped_count', sa.Integer(), nullable=False),
        sa.Column('ignored_count', sa.Integer(), nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_import_batches_source', 'import_batches', ['source'])

    op.create_table(
        'external_transaction_refs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('source', sa.String(length=32), nullable=False),
        sa.Column('external_id', sa.String(length=64), nullable=False),
        sa.Column('transaction_id', sa.Integer(), nullable=False),
        sa.Column('import_batch_id', sa.Integer(), nullable=True),
        sa.Column('occurred_at', sa.String(length=32), nullable=True),
        sa.Column('raw_type', sa.String(length=64), nullable=True),
        sa.Column('raw_direction', sa.String(length=16), nullable=True),
        sa.Column('raw_merchant', sa.String(length=255), nullable=True),
        sa.Column('raw_product', sa.Text(), nullable=True),
        sa.Column('raw_payment_method', sa.String(length=128), nullable=True),
        sa.Column('raw_status', sa.String(length=64), nullable=True),
        sa.Column('raw_note', sa.Text(), nullable=True),
        sa.Column('merchant_order_id', sa.String(length=128), nullable=True),
        sa.Column('classification_reason', sa.String(length=255), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(['transaction_id'], ['transactions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['import_batch_id'], ['import_batches.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('source', 'external_id', name='uq_external_transaction'),
    )
    op.create_index(
        'ix_external_transaction_refs_transaction_id', 'external_transaction_refs', ['transaction_id']
    )
    op.create_index(
        'ix_external_transaction_refs_import_batch_id',
        'external_transaction_refs',
        ['import_batch_id'],
    )

    op.create_table(
        'import_account_mappings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('source', sa.String(length=32), nullable=False),
        sa.Column('label', sa.String(length=128), nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('source', 'label', name='uq_import_account_mapping'),
    )

    op.create_table(
        'categorisation_rules',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('origin', sa.String(length=16), nullable=False),
        sa.Column('system_key', sa.String(length=64), nullable=True),
        sa.Column('source', sa.String(length=32), nullable=True),
        sa.Column('match_field', sa.String(length=16), nullable=False),
        sa.Column('match_type', sa.String(length=16), nullable=False),
        sa.Column('pattern', sa.String(length=200), nullable=False),
        sa.Column('secondary_field', sa.String(length=16), nullable=True),
        sa.Column('secondary_pattern', sa.String(length=200), nullable=True),
        sa.Column('direction', sa.String(length=16), nullable=True),
        sa.Column('category_id', sa.Integer(), nullable=False),
        sa.Column('priority', sa.Integer(), nullable=False),
        sa.Column('is_enabled', sa.Boolean(), nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(['category_id'], ['categories.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('system_key'),
    )

    for name, column in (
        ('recurring_rule_id', sa.Column('recurring_rule_id', sa.Integer(), nullable=True)),
        ('import_batch_id', sa.Column('import_batch_id', sa.Integer(), nullable=True)),
        ('external_source', sa.Column('external_source', sa.String(length=32), nullable=True)),
        ('external_transaction_id',
         sa.Column('external_transaction_id', sa.String(length=64), nullable=True)),
        ('classification_rule_id',
         sa.Column('classification_rule_id', sa.Integer(), nullable=True)),
    ):
        op.add_column('transactions', column)
    op.create_index('ix_transactions_recurring_rule_id', 'transactions', ['recurring_rule_id'])
    op.create_index('ix_transactions_import_batch_id', 'transactions', ['import_batch_id'])


def downgrade() -> None:
    op.drop_index('ix_transactions_import_batch_id', table_name='transactions')
    op.drop_index('ix_transactions_recurring_rule_id', table_name='transactions')
    for column in (
        'classification_rule_id',
        'external_transaction_id',
        'external_source',
        'import_batch_id',
        'recurring_rule_id',
    ):
        op.drop_column('transactions', column)
    op.drop_table('categorisation_rules')
    op.drop_table('import_account_mappings')
    op.drop_table('external_transaction_refs')
    op.drop_table('import_batches')
    op.drop_table('recurring_occurrences')
    op.drop_table('recurring_rules')
