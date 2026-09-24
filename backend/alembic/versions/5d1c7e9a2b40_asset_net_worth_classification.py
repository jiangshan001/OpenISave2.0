"""asset net worth classification

Net worth now counts only stores of wealth. Personal possessions (electronics,
vehicles, furniture, collectibles...) stay fully tracked but no longer enter
Total Assets or Net Worth unless the user opts an asset in.

  * asset_categories.include_in_net_worth_default -- true only for Property;
  * assets.include_in_net_worth_manual -- whether the stored flag is an
    explicit user choice or simply follows the category default.

Existing assets are reclassified: under V2 every asset defaulted to "include",
so a stored true carries no user intent and now follows its category. A stored
false could only have been set deliberately and is kept as a manual choice.

Deliberately uses ADD COLUMN + UPDATE only. Rebuilding the assets table (which
batch mode does for ALTER COLUMN on SQLite) would DROP it, and with foreign
keys enabled the implicit DELETE would cascade into transactions and postings.

Revision ID: 5d1c7e9a2b40
Revises: 042bb366d803
Create Date: 2026-09-23 14:30:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = '5d1c7e9a2b40'
down_revision = '042bb366d803'
branch_labels = None
depends_on = None

#: Categories whose assets count towards net worth by default.
NET_WORTH_CATEGORIES = ('Property', 'Investment Asset')


def upgrade() -> None:
    op.add_column(
        'asset_categories',
        sa.Column(
            'include_in_net_worth_default',
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        'assets',
        sa.Column(
            'include_in_net_worth_manual',
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )

    connection = op.get_bind()
    connection.execute(
        sa.text(
            "UPDATE asset_categories SET include_in_net_worth_default = 1 "
            "WHERE name IN :names"
        ).bindparams(sa.bindparam('names', expanding=True)),
        {'names': list(NET_WORTH_CATEGORIES)},
    )
    # An explicit exclusion under the old include-by-default rule was a choice.
    connection.execute(
        sa.text(
            "UPDATE assets SET include_in_net_worth_manual = 1 "
            "WHERE include_in_net_worth = 0"
        )
    )
    # Everything else follows its category; uncategorised assets are treated
    # as personal possessions.
    connection.execute(
        sa.text(
            "UPDATE assets SET include_in_net_worth = COALESCE("
            "  (SELECT c.include_in_net_worth_default FROM asset_categories c "
            "   WHERE c.id = assets.asset_category_id), 0) "
            "WHERE include_in_net_worth_manual = 0"
        )
    )


def downgrade() -> None:
    # V2 semantics: every asset not explicitly excluded is included.
    connection = op.get_bind()
    connection.execute(
        sa.text(
            "UPDATE assets SET include_in_net_worth = 1 "
            "WHERE include_in_net_worth_manual = 0"
        )
    )
    with op.batch_alter_table('assets') as batch:
        batch.drop_column('include_in_net_worth_manual')
    with op.batch_alter_table('asset_categories') as batch:
        batch.drop_column('include_in_net_worth_default')
