"""Synthetic OpenISave 2.0.x plaintext databases for migration tests.

Built with the real Alembic history up to the last 2.0 revision, then filled
with raw SQL (the ORM models already describe the newer schema). All amounts
are invented test values.
"""

from __future__ import annotations

import shutil
import sqlite3
from pathlib import Path

from alembic import command

from app.db import bootstrap
from app.db.engine import build_engine

V2_REVISION = "042bb366d803"

_ROWS: list[tuple[str, dict]] = [
    ("currencies", {"code": "CNY", "symbol": "¥", "minor_unit_digits": 2, "display_name": "Chinese Yuan", "is_active": 1}),
    ("currencies", {"code": "GBP", "symbol": "£", "minor_unit_digits": 2, "display_name": "British Pound", "is_active": 1}),
    ("app_settings", {"id": 1, "base_currency": "CNY", "timezone": "Asia/Shanghai", "locale": "en", "fx_stale_after_days": 3}),
    ("categories", {"id": 1, "name": "Food", "kind": "expense", "parent_id": None, "sort_order": 0, "is_active": 1}),
    ("categories", {"id": 2, "name": "Groceries", "kind": "expense", "parent_id": 1, "sort_order": 1, "is_active": 1}),
    ("categories", {"id": 3, "name": "Salary", "kind": "income", "parent_id": None, "sort_order": 0, "is_active": 1}),
    ("accounts", {"id": 1, "name": "招商银行", "account_type": "bank", "currency": "CNY", "opening_balance_minor": 5000000, "include_in_net_worth": 1, "is_active": 1, "is_archived": 0, "sort_order": 0}),
    ("accounts", {"id": 2, "name": "Monzo", "account_type": "bank", "currency": "GBP", "opening_balance_minor": 120000, "include_in_net_worth": 1, "is_active": 1, "is_archived": 0, "sort_order": 1}),
    ("accounts", {"id": 3, "name": "Car Loan", "account_type": "loan", "currency": "CNY", "opening_balance_minor": -3000000, "include_in_net_worth": 1, "is_active": 1, "is_archived": 0, "sort_order": 2}),
    ("fx_rates", {"id": 1, "base_currency": "GBP", "quote_currency": "CNY", "rate": "9.6500000000", "rate_date": "2026-09-20", "source": "provider", "fetched_at": "2026-09-20 08:00:00"}),
    # income 800,000.00 CNY into 招商银行
    ("transactions", {"id": 1, "type": "income", "transaction_date": "2026-09-01", "description": "Salary", "category_id": 3, "account_id": 1, "amount_minor": 80000000, "currency": "CNY", "base_currency": "CNY", "base_amount_minor": 80000000, "fx_rate_to_base": "1", "fx_source": "identity", "is_voided": 0}),
    ("postings", {"id": 1, "transaction_id": 1, "account_id": 1, "category_id": None, "amount_minor": 80000000, "currency": "CNY", "base_amount_minor": 80000000, "fx_rate_to_base": "1"}),
    ("postings", {"id": 2, "transaction_id": 1, "account_id": None, "category_id": 3, "amount_minor": -80000000, "currency": "CNY", "base_amount_minor": -80000000, "fx_rate_to_base": "1"}),
    # GBP expense with a frozen historical rate
    ("transactions", {"id": 2, "type": "expense", "transaction_date": "2026-09-05", "description": "Tesco", "category_id": 2, "account_id": 2, "amount_minor": 4550, "currency": "GBP", "base_currency": "CNY", "base_amount_minor": 43908, "fx_rate_to_base": "9.6500000000", "fx_rate_date": "2026-09-05", "fx_source": "provider", "is_voided": 0}),
    ("postings", {"id": 3, "transaction_id": 2, "account_id": 2, "category_id": None, "amount_minor": -4550, "currency": "GBP", "base_amount_minor": -43908, "fx_rate_to_base": "9.6500000000"}),
    ("postings", {"id": 4, "transaction_id": 2, "account_id": None, "category_id": 2, "amount_minor": 4550, "currency": "GBP", "base_amount_minor": 43908, "fx_rate_to_base": "9.6500000000"}),
    # a voided expense stays in history
    ("transactions", {"id": 3, "type": "expense", "transaction_date": "2026-09-06", "description": "Mistake", "category_id": 2, "account_id": 1, "amount_minor": 1000, "currency": "CNY", "base_currency": "CNY", "base_amount_minor": 1000, "fx_rate_to_base": "1", "fx_source": "identity", "is_voided": 1, "voided_at": "2026-09-06 10:00:00"}),
    ("goals", {"id": 1, "name": "Emergency fund", "target_amount_minor": 10000000, "currency": "CNY", "is_active": 1, "sort_order": 0, "selection_mode": "selected"}),
    ("goal_accounts", {"id": 1, "goal_id": 1, "account_id": 1}),
    ("budgets", {"id": 1, "year": 2026, "month": 9, "category_id": 1, "amount_minor": 300000, "currency": "CNY"}),
    ("asset_categories", {"id": 1, "name": "Electronics", "sort_order": 0, "is_active": 1}),
    ("asset_categories", {"id": 2, "name": "Vehicle", "sort_order": 1, "is_active": 1}),
    ("asset_categories", {"id": 3, "name": "Furniture", "sort_order": 2, "is_active": 1}),
    ("asset_categories", {"id": 4, "name": "Collectibles", "sort_order": 3, "is_active": 1}),
    ("asset_categories", {"id": 5, "name": "Property", "sort_order": 4, "is_active": 1}),
    ("asset_categories", {"id": 6, "name": "Other", "sort_order": 5, "is_active": 1}),
    ("liabilities", {"id": 1, "name": "Car Loan", "liability_type": "loan", "account_id": 3, "original_amount_minor": 3000000, "currency": "CNY"}),
    ("assets", {"id": 1, "name": "MacBook Pro", "asset_category_id": 1, "purchase_date": "2026-01-01", "purchase_price_minor": 1800000, "purchase_currency": "CNY", "purchase_base_minor": 1800000, "status": "holding", "include_in_net_worth": 1}),
    ("assets", {"id": 2, "name": "Flat", "asset_category_id": 5, "purchase_date": "2025-06-01", "purchase_price_minor": 50000000, "purchase_currency": "CNY", "purchase_base_minor": 50000000, "status": "holding", "include_in_net_worth": 1}),
    ("assets", {"id": 3, "name": "Car", "asset_category_id": 2, "purchase_date": "2025-03-01", "purchase_price_minor": 9000000, "purchase_currency": "CNY", "purchase_base_minor": 9000000, "status": "holding", "include_in_net_worth": 0, "linked_liability_id": 1}),
    ("asset_valuations", {"id": 1, "asset_id": 1, "valuation_date": "2026-06-01", "value_minor": 1200000, "currency": "CNY"}),
    # the MacBook's purchase: ledger rows that reference the asset (FK cascade risk)
    ("transactions", {"id": 5, "type": "asset_purchase", "transaction_date": "2026-01-01", "description": "Purchase — MacBook Pro", "account_id": None, "amount_minor": 1800000, "currency": "CNY", "base_currency": "CNY", "base_amount_minor": 1800000, "fx_rate_to_base": "1", "fx_source": "identity", "is_voided": 0, "asset_id": 1}),
    ("postings", {"id": 7, "transaction_id": 5, "account_id": 1, "category_id": None, "amount_minor": -1800000, "currency": "CNY", "base_amount_minor": -1800000, "fx_rate_to_base": "1"}),
    ("postings", {"id": 8, "transaction_id": 5, "account_id": None, "category_id": None, "asset_id": 1, "amount_minor": 1800000, "currency": "CNY", "base_amount_minor": 1800000, "fx_rate_to_base": "1"}),
]

#: Rows written last, left in the WAL to imitate an app that was killed.
_WAL_ROWS: list[tuple[str, dict]] = [
    ("transactions", {"id": 4, "type": "transfer", "transaction_date": "2026-09-10", "description": "To Monzo", "account_id": 1, "from_account_id": 1, "to_account_id": 2, "amount_minor": 96500, "currency": "CNY", "dest_amount_minor": 10000, "dest_currency": "GBP", "transfer_rate": "0.1036269430", "base_currency": "CNY", "base_amount_minor": 96500, "fx_rate_to_base": "1", "fx_source": "identity", "is_voided": 0}),
    ("postings", {"id": 5, "transaction_id": 4, "account_id": 1, "category_id": None, "amount_minor": -96500, "currency": "CNY", "base_amount_minor": -96500, "fx_rate_to_base": "1"}),
    ("postings", {"id": 6, "transaction_id": 4, "account_id": 2, "category_id": None, "amount_minor": 10000, "currency": "GBP", "base_amount_minor": 96500, "fx_rate_to_base": "9.6500000000"}),
    ("assets", {"id": 4, "name": "Sofa", "asset_category_id": 3, "purchase_date": "2026-02-01", "purchase_price_minor": 800000, "purchase_currency": "CNY", "purchase_base_minor": 800000, "status": "holding", "include_in_net_worth": 1}),
]


def _insert(connection, rows) -> None:
    for table, values in rows:
        columns = ", ".join(values)
        marks = ", ".join("?" for _ in values)
        connection.execute(f"INSERT INTO {table} ({columns}) VALUES ({marks})", tuple(values.values()))


def create_schema(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    engine = build_engine(path, lambda: None)
    config = bootstrap.alembic_config()
    try:
        with engine.begin() as connection:
            config.attributes["connection"] = connection
            command.upgrade(config, V2_REVISION)
    finally:
        engine.dispose()


def make_legacy_database(legacy_root: Path, *, pending_wal: bool = True) -> Path:
    """Create legacy_root/data/finance.db as OpenISave 2.0 would have left it."""
    db = legacy_root / "data" / "finance.db"
    create_schema(db)
    connection = sqlite3.connect(db)
    connection.execute("PRAGMA journal_mode = WAL")
    _insert(connection, _ROWS)
    connection.commit()
    connection.close()
    if not pending_wal:
        connection = sqlite3.connect(db)
        _insert(connection, _WAL_ROWS)
        connection.commit()
        connection.close()
        return db

    # Imitate a killed process: capture the main file, write more rows, grab
    # the WAL while the connection is still open, then put the old main file
    # back beside that WAL.
    snapshot = db.with_name("snapshot.db")
    shutil.copy2(db, snapshot)
    connection = sqlite3.connect(db)
    connection.execute("PRAGMA wal_autocheckpoint = 0")
    _insert(connection, _WAL_ROWS)
    connection.commit()
    wal_copy = db.with_name("wal.copy")
    shutil.copy2(f"{db}-wal", wal_copy)
    connection.close()
    shutil.move(snapshot, db)
    shutil.move(wal_copy, f"{db}-wal")
    Path(f"{db}-shm").unlink(missing_ok=True)
    return db


def damage_index(db: Path, index: str = "ix_transactions_type") -> None:
    """Leave one table row without its index entry, like the real 2.0 data."""
    connection = sqlite3.connect(db)
    sql = connection.execute("SELECT sql FROM sqlite_master WHERE name = ?", (index,)).fetchone()[0]
    connection.execute("PRAGMA writable_schema = ON")
    connection.execute("UPDATE sqlite_master SET sql = ? WHERE name = ?", (sql + " WHERE 0", index))
    connection.commit()
    connection.close()

    connection = sqlite3.connect(db)
    _insert(
        connection,
        [("transactions", {"id": 90, "type": "expense", "transaction_date": "2026-09-12", "description": "Unindexed", "category_id": 2, "account_id": 1, "amount_minor": 500, "currency": "CNY", "base_currency": "CNY", "base_amount_minor": 500, "fx_rate_to_base": "1", "fx_source": "identity", "is_voided": 0}),
         ("postings", {"id": 90, "transaction_id": 90, "account_id": 1, "category_id": None, "amount_minor": -500, "currency": "CNY", "base_amount_minor": -500, "fx_rate_to_base": "1"}),
         ("postings", {"id": 91, "transaction_id": 90, "account_id": None, "category_id": 2, "amount_minor": 500, "currency": "CNY", "base_amount_minor": 500, "fx_rate_to_base": "1"})],
    )
    connection.commit()
    connection.execute("PRAGMA writable_schema = ON")
    connection.execute("UPDATE sqlite_master SET sql = ? WHERE name = ?", (sql, index))
    connection.commit()
    connection.close()


def table_rows(connection, table: str, columns: list[str] | None = None) -> list[tuple]:
    selected = ", ".join(columns) if columns else "*"
    return connection.execute(f"SELECT {selected} FROM {table} NOT INDEXED ORDER BY rowid").fetchall()


def legacy_columns(connection, table: str) -> list[str]:
    return [row[1] for row in connection.execute(f"PRAGMA table_info({table})")]
