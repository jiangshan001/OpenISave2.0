"""Fresh/2.3 upgrades and downgrade round-trip on disposable encrypted vaults."""
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.runtime.migration import MigrationContext
import pytest
from sqlalchemy import inspect, text

from app.db import bootstrap
from app.db.base import Base
from app.db.engine import build_engine
from app.db.seed import seed_all
from app.security import cipher
from sqlalchemy.orm import Session
from app.models import Account, Transaction, Posting, Budget

OLD = "c4d8f2a6e913"
NEW = "d9e5a1b7c302"


def migrate(engine, target, downgrade=False):
    config = bootstrap.alembic_config()
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        (command.downgrade if downgrade else command.upgrade)(config, target)


def snapshot(engine):
    with engine.connect() as connection:
        return {table: connection.execute(text(f'SELECT * FROM "{table}" ORDER BY rowid')).all()
                for table in inspect(connection).get_table_names() if table != "alembic_version"}


@pytest.mark.parametrize("existing", [False, True])
def test_additive_monthly_budget_migration(tmp_path, existing):
    key = cipher.generate_key()
    path = tmp_path / "scratch.db"
    engine = build_engine(path, lambda: key)
    try:
        if existing:
            migrate(engine, OLD)
            with Session(engine) as session:
                seed_all(session)
                from datetime import date
                session.add(Account(id=999, name="Synthetic", account_type="bank", currency="CNY",
                                    opening_balance_minor=100000))
                session.flush()
                session.add(Transaction(id=999, type="expense", transaction_date=date(2026, 10, 4),
                                        amount_minor=100, currency="CNY", base_amount_minor=100))
                session.flush()
                session.add(Posting(transaction_id=999, account_id=999, amount_minor=-100,
                                    currency="CNY", base_amount_minor=-100))
                food = session.scalar(text("SELECT id FROM categories WHERE name='Food'"))
                session.add(Posting(transaction_id=999, category_id=food, amount_minor=100,
                                    currency="CNY", base_amount_minor=100))
                session.add(Budget(year=2026, month=10, category_id=food, amount_minor=400000, currency="CNY"))
                session.commit()
            before = snapshot(engine)
        else:
            before = {}
        migrate(engine, "head")
        assert bootstrap.current_revision(engine) == NEW
        after = snapshot(engine)
        for table, rows in before.items():
            assert after[table] == rows, table
        assert after["monthly_budgets"] == []  # no automatic overall budgets
        with engine.begin() as connection:
            context = MigrationContext.configure(connection, opts={"compare_type": True})
            assert compare_metadata(context, Base.metadata) == []
            connection.execute(text("INSERT INTO monthly_budgets (year,month,overall_limit_minor) VALUES (2026,10,1500000)"))
            connection.execute(text("UPDATE monthly_budgets SET overall_limit_minor=NULL"))
        migrate(engine, OLD, downgrade=True)
        assert "monthly_budgets" not in inspect(engine).get_table_names()
        for table, rows in before.items():
            assert snapshot(engine)[table] == rows, table
        migrate(engine, "head")
        assert bootstrap.current_revision(engine) == NEW
        with engine.connect() as connection:
            assert compare_metadata(MigrationContext.configure(connection), Base.metadata) == []
    finally:
        engine.dispose()
    assert not cipher.is_plaintext_sqlite(path)
    connection = cipher.connect(path, key)
    try:
        assert cipher.cipher_integrity_errors(connection) == []
        assert cipher.integrity_errors(connection) == []
        assert cipher.foreign_key_violations(connection) == 0
    finally:
        connection.close()
