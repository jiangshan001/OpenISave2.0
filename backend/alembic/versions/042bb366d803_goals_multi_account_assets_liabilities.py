"""goals multi account, assets, liabilities

Adds the V2 domain:

  * goal_accounts turns a goal's single linked account into a many-to-many
    relationship; existing links are copied across before the old column goes;
  * asset_categories / assets / asset_valuations hold physical possessions;
  * liabilities carry loan contract metadata beside an existing liability
    account, which remains the only place an outstanding balance is stored;
  * transactions and postings gain an asset_id so a purchase or sale can
    balance against the thing being bought or sold.

Revision ID: 042bb366d803
Revises: 92eb242c8f4f
Create Date: 2026-09-22 15:52:25.961543
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = '042bb366d803'
down_revision = '92eb242c8f4f'
branch_labels = None
depends_on = None

TIMESTAMPS = (
    sa.Column(
        'created_at',
        sa.DateTime(timezone=True),
        server_default=sa.text('(CURRENT_TIMESTAMP)'),
        nullable=False,
    ),
    sa.Column(
        'updated_at',
        sa.DateTime(timezone=True),
        server_default=sa.text('(CURRENT_TIMESTAMP)'),
        nullable=False,
    ),
)


def upgrade() -> None:
    op.create_table(
        'asset_categories',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=80), nullable=False),
        sa.Column('icon', sa.String(length=32), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        *TIMESTAMPS,
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )

    op.create_table(
        'goal_accounts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('goal_id', sa.Integer(), nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        *TIMESTAMPS,
        sa.ForeignKeyConstraint(
            ['account_id'], ['accounts.id'], name='fk_goal_accounts_account', ondelete='CASCADE'
        ),
        sa.ForeignKeyConstraint(
            ['goal_id'], ['goals.id'], name='fk_goal_accounts_goal', ondelete='CASCADE'
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('goal_id', 'account_id', name='uq_goal_account'),
    )
    op.create_index('ix_goal_accounts_account_id', 'goal_accounts', ['account_id'])
    op.create_index('ix_goal_accounts_goal_id', 'goal_accounts', ['goal_id'])

    op.create_table(
        'liabilities',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('liability_type', sa.String(length=24), nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('original_amount_minor', sa.BigInteger(), nullable=False),
        sa.Column('currency', sa.String(length=3), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=True),
        sa.Column('end_date', sa.Date(), nullable=True),
        sa.Column('interest_rate_percent', sa.Numeric(precision=8, scale=4), nullable=True),
        sa.Column('lender', sa.String(length=120), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        *TIMESTAMPS,
        sa.ForeignKeyConstraint(
            ['account_id'], ['accounts.id'], name='fk_liabilities_account', ondelete='CASCADE'
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )
    op.create_index('ix_liabilities_account_id', 'liabilities', ['account_id'], unique=True)

    op.create_table(
        'assets',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=160), nullable=False),
        sa.Column('asset_category_id', sa.Integer(), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('purchase_date', sa.Date(), nullable=False),
        sa.Column('purchase_price_minor', sa.BigInteger(), nullable=False),
        sa.Column('purchase_currency', sa.String(length=3), nullable=False),
        sa.Column('purchase_base_minor', sa.BigInteger(), nullable=False),
        sa.Column('status', sa.String(length=16), nullable=False),
        sa.Column('sale_date', sa.Date(), nullable=True),
        sa.Column('sale_price_minor', sa.BigInteger(), nullable=True),
        sa.Column('sale_currency', sa.String(length=3), nullable=True),
        sa.Column('sale_base_minor', sa.BigInteger(), nullable=True),
        sa.Column('include_in_net_worth', sa.Boolean(), nullable=False),
        sa.Column('linked_liability_id', sa.Integer(), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        *TIMESTAMPS,
        sa.ForeignKeyConstraint(
            ['asset_category_id'],
            ['asset_categories.id'],
            name='fk_assets_category',
            ondelete='SET NULL',
        ),
        sa.ForeignKeyConstraint(
            ['linked_liability_id'],
            ['liabilities.id'],
            name='fk_assets_liability',
            ondelete='SET NULL',
        ),
        sa.ForeignKeyConstraint(
            ['purchase_currency'], ['currencies.code'], name='fk_assets_currency'
        ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_assets_asset_category_id', 'assets', ['asset_category_id'])
    op.create_index('ix_assets_purchase_date', 'assets', ['purchase_date'])
    op.create_index('ix_assets_status', 'assets', ['status'])

    op.create_table(
        'asset_valuations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('asset_id', sa.Integer(), nullable=False),
        sa.Column('valuation_date', sa.Date(), nullable=False),
        sa.Column('value_minor', sa.BigInteger(), nullable=False),
        sa.Column('currency', sa.String(length=3), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        *TIMESTAMPS,
        sa.ForeignKeyConstraint(
            ['asset_id'], ['assets.id'], name='fk_asset_valuations_asset', ondelete='CASCADE'
        ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_asset_valuations_asset_id', 'asset_valuations', ['asset_id'])
    op.create_index('ix_asset_valuations_valuation_date', 'asset_valuations', ['valuation_date'])

    # Carry every existing single-account link into the new join table before
    # the column that holds it is removed.
    connection = op.get_bind()
    existing_links = connection.execute(
        sa.text('SELECT id, linked_account_id FROM goals WHERE linked_account_id IS NOT NULL')
    ).fetchall()
    for goal_id, account_id in existing_links:
        connection.execute(
            sa.text(
                'INSERT INTO goal_accounts (goal_id, account_id, created_at, updated_at) '
                'VALUES (:goal_id, :account_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)'
            ),
            {'goal_id': goal_id, 'account_id': account_id},
        )

    with op.batch_alter_table('goals', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                'selection_mode',
                sa.String(length=16),
                nullable=False,
                server_default='selected',
            )
        )
        batch_op.drop_column('linked_account_id')

    with op.batch_alter_table('postings', schema=None) as batch_op:
        batch_op.add_column(sa.Column('asset_id', sa.Integer(), nullable=True))
        batch_op.create_index('ix_postings_asset_id', ['asset_id'], unique=False)
        batch_op.create_foreign_key(
            'fk_postings_asset', 'assets', ['asset_id'], ['id'], ondelete='CASCADE'
        )

    with op.batch_alter_table('transactions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('asset_id', sa.Integer(), nullable=True))
        batch_op.create_index('ix_transactions_asset_id', ['asset_id'], unique=False)
        batch_op.create_foreign_key(
            'fk_transactions_asset', 'assets', ['asset_id'], ['id'], ondelete='CASCADE'
        )


def downgrade() -> None:
    with op.batch_alter_table('transactions', schema=None) as batch_op:
        batch_op.drop_constraint('fk_transactions_asset', type_='foreignkey')
        batch_op.drop_index('ix_transactions_asset_id')
        batch_op.drop_column('asset_id')

    with op.batch_alter_table('postings', schema=None) as batch_op:
        batch_op.drop_constraint('fk_postings_asset', type_='foreignkey')
        batch_op.drop_index('ix_postings_asset_id')
        batch_op.drop_column('asset_id')

    with op.batch_alter_table('goals', schema=None) as batch_op:
        batch_op.add_column(sa.Column('linked_account_id', sa.INTEGER(), nullable=True))
        batch_op.create_foreign_key(
            'fk_goals_linked_account', 'accounts', ['linked_account_id'], ['id'], ondelete='SET NULL'
        )
        batch_op.drop_column('selection_mode')

    # Keep the first linked account so downgrading loses as little as possible.
    connection = op.get_bind()
    rows = connection.execute(
        sa.text('SELECT goal_id, MIN(account_id) FROM goal_accounts GROUP BY goal_id')
    ).fetchall()
    for goal_id, account_id in rows:
        connection.execute(
            sa.text('UPDATE goals SET linked_account_id = :account_id WHERE id = :goal_id'),
            {'goal_id': goal_id, 'account_id': account_id},
        )

    op.drop_index('ix_asset_valuations_valuation_date', table_name='asset_valuations')
    op.drop_index('ix_asset_valuations_asset_id', table_name='asset_valuations')
    op.drop_table('asset_valuations')

    op.drop_index('ix_assets_status', table_name='assets')
    op.drop_index('ix_assets_purchase_date', table_name='assets')
    op.drop_index('ix_assets_asset_category_id', table_name='assets')
    op.drop_table('assets')

    op.drop_index('ix_liabilities_account_id', table_name='liabilities')
    op.drop_table('liabilities')

    op.drop_index('ix_goal_accounts_goal_id', table_name='goal_accounts')
    op.drop_index('ix_goal_accounts_account_id', table_name='goal_accounts')
    op.drop_table('goal_accounts')

    op.drop_table('asset_categories')
