"""Exercise the release migration on an isolated encrypted pre-update vault."""

from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from app.db import bootstrap
from app.db.engine import build_engine
from app.db.seed import seed_all
from app.models import Account, Budget, Posting
from app.security import cipher
from tests.test_overall_budget_migration import migrate


def test_old_encrypted_vault_upgrades_after_backup_and_preserves_ledger(tmp_path):
    key = cipher.generate_key()
    path = tmp_path / 'release-upgrade.db'
    engine = build_engine(path, lambda: key)
    try:
        migrate(engine, 'd9e5a1b7c302')
        with Session(engine) as session:
            seed_all(session)
            session.add(Account(id=300, name='Example bank', account_type='bank', currency='CNY',
                                opening_balance_minor=100000))
            session.flush()
            session.execute(text("""INSERT INTO transactions
                (id,type,transaction_date,description,amount_minor,currency,base_currency,
                 base_amount_minor,fx_rate_to_base,fx_source,is_voided)
                VALUES (300,'expense','2026-10-01','Rent',90001,'CNY','CNY',90001,1,'identity',0)"""))
            session.add(Posting(transaction_id=300, account_id=300, amount_minor=-90001,
                                currency='CNY', base_amount_minor=-90001))
            rent = session.scalar(text("SELECT id FROM categories WHERE name='Rent'"))
            session.add(Posting(transaction_id=300, category_id=rent, amount_minor=90001,
                                currency='CNY', base_amount_minor=90001))
            session.add(Budget(year=2026, month=10, category_id=rent, amount_minor=100000, currency='CNY'))
            session.commit()
        calls = []
        def before_change():
            calls.append(bootstrap.current_revision(engine))
        assert bootstrap.upgrade(engine, before_change=before_change)
        assert calls == ['d9e5a1b7c302']
        assert bootstrap.current_revision(engine) == 'e7a5c9214d03'
        with engine.connect() as c:
            tx = c.execute(text('SELECT amount_minor,base_amount_minor,budget_months,budget_start_month FROM transactions WHERE id=300')).one()
            assert tuple(tx) == (90001, 90001, 1, None)
            assert c.execute(text('SELECT count(*) FROM postings WHERE transaction_id=300')).scalar_one() == 2
            assert c.execute(text('SELECT count(*) FROM budgets WHERE category_id=:id'), {'id': rent}).scalar_one() == 1
            assert c.execute(text('SELECT count(*) FROM liability_receipts')).scalar_one() == 0
        assert not bootstrap.upgrade(engine, before_change=before_change)
        assert len(calls) == 1
        migrate(engine, 'd9e5a1b7c302', downgrade=True)
        assert 'liability_receipts' not in inspect(engine).get_table_names()
        with engine.connect() as c:
            assert c.execute(text('SELECT amount_minor FROM transactions WHERE id=300')).scalar_one() == 90001
            assert c.execute(text('SELECT count(*) FROM postings WHERE transaction_id=300')).scalar_one() == 2
    finally:
        engine.dispose()
    connection = cipher.connect(path, key)
    try:
        assert cipher.cipher_integrity_errors(connection) == []
        assert cipher.integrity_errors(connection) == []
        assert cipher.foreign_key_violations(connection) == 0
    finally:
        connection.close()


def test_migration_aborts_if_pre_migration_backup_fails(tmp_path):
    key = cipher.generate_key()
    engine = build_engine(tmp_path / 'backup-failed.db', lambda: key)
    try:
        migrate(engine, 'd9e5a1b7c302')
        def fail_backup():
            raise RuntimeError('backup failed')
        import pytest
        with pytest.raises(RuntimeError, match='backup failed'):
            bootstrap.upgrade(engine, before_change=fail_backup)
        assert bootstrap.current_revision(engine) == 'd9e5a1b7c302'
        assert 'liability_receipts' not in inspect(engine).get_table_names()
    finally:
        engine.dispose()
