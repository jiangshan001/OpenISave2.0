"""Encrypted vault: SQLCipher, key storage, migration, backups, restore, recovery.

Every test runs in its own temporary data directory with an in-memory key
store, except the Credential Manager test, which uses a unique throwaway
credential target and deletes it afterwards.
"""

from __future__ import annotations

import hashlib
import json
import logging
import shutil
import sqlite3
import sys
import uuid
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import select

from app.core.config import Settings
from app.db import bootstrap
from app.db.session import session_scope
from app.models.asset import Asset
from app.security import cipher, recovery
from app.security.keystore import MemoryKeyStore
from app.security.migration import LegacyMigration, MigrationError, financial_summary
from app.security.runtime import SecurityError, StorageRuntime, VaultState, set_runtime
from tests.legacy_fixtures import (
    damage_index,
    legacy_columns,
    make_legacy_database,
    table_rows,
)

#: Reference tables that startup seeding may extend with missing defaults.
SEEDED_TABLES = {"categories", "currencies", "asset_categories", "app_settings"}

# Amounts used by the fixtures; none of them may ever appear in a log or report.
FIXTURE_AMOUNTS = ["80000000", "5000000", "1800000", "50000000", "9000000", "120000", "96500"]


def _settings(root: Path) -> Settings:
    return Settings(
        data_root=root / "data",
        legacy_data_root=root / "legacy",
        key_store="memory",
    )


@pytest.fixture()
def make_runtime(tmp_path):
    created: list[StorageRuntime] = []

    def factory(key_store: MemoryKeyStore | None = None, root: Path | None = None):
        runtime = StorageRuntime(_settings(root or tmp_path), key_store or MemoryKeyStore())
        set_runtime(runtime)
        created.append(runtime)
        return runtime

    yield factory
    set_runtime(None)


def _hashes(folder: Path) -> dict[str, str]:
    return {
        p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in folder.iterdir() if p.is_file()
    }


def _open_legacy_copy(legacy_db: Path, tmp_path: Path) -> sqlite3.Connection:
    """Read the legacy data as SQLite would (WAL replayed) without touching it."""
    copy = tmp_path / "legacy-view"
    copy.mkdir(exist_ok=True)
    for path in legacy_db.parent.iterdir():
        shutil.copy2(path, copy / path.name)
    return sqlite3.connect(copy / legacy_db.name)


def _add_account(name="Test Bank", opening=100_00):
    from app.models.account import Account

    with session_scope() as session:
        session.add(
            Account(
                name=name, account_type="bank", currency="CNY", opening_balance_minor=opening
            )
        )


def _account_names() -> list[str]:
    from app.models.account import Account

    with session_scope() as session:
        return sorted(session.scalars(select(Account.name)))


# ------------------------------------------------------------------ SQLCipher


def test_new_vault_is_encrypted_and_unreadable_by_sqlite3(make_runtime):
    runtime = make_runtime()
    assert runtime.start() == VaultState.READY
    db = runtime.settings.db_path

    assert db.exists()
    assert not cipher.is_plaintext_sqlite(db)
    assert db.read_bytes()[:16] != b"SQLite format 3\x00"
    plain = sqlite3.connect(db)
    with pytest.raises(sqlite3.DatabaseError, match="not a database"):
        plain.execute("SELECT * FROM sqlite_master").fetchall()
    plain.close()


def test_correct_key_opens_and_wrong_key_fails(make_runtime):
    runtime = make_runtime()
    runtime.start()
    db, key = runtime.settings.db_path, runtime.require_key()

    assert cipher.can_open(db, key)
    assert not cipher.can_open(db, cipher.generate_key())
    assert not cipher.can_open(db, None)
    connection = cipher.connect(db, key)
    assert connection.execute("SELECT count(*) FROM accounts").fetchone() == (0,)
    assert cipher.cipher_integrity_errors(connection) == []
    connection.close()


def test_key_is_a_256_bit_random_value(make_runtime):
    store = MemoryKeyStore()
    make_runtime(store).start()
    key = store.get()
    assert len(bytes.fromhex(key)) == 32
    assert key != cipher.generate_key()


def test_restart_reads_the_key_from_the_key_store(make_runtime):
    store = MemoryKeyStore()
    first = make_runtime(store)
    first.start()
    _add_account("Persisted")
    set_runtime(None)

    second = make_runtime(store)
    assert second.start() == VaultState.READY
    assert _account_names() == ["Persisted"]


@pytest.mark.skipif(sys.platform != "win32", reason="Windows Credential Manager only")
def test_windows_credential_manager_round_trip_and_restart(tmp_path):
    from app.security.keystore import CredentialManagerKeyStore

    target = f"OpenISave2-Test/{uuid.uuid4()}"
    store = CredentialManagerKeyStore(target)
    try:
        settings = Settings(
            data_root=tmp_path / "data", legacy_data_root=tmp_path / "legacy", key_store="windows",
            credential_service=target,
        )
        first = StorageRuntime(settings, store)
        set_runtime(first)
        assert first.start() == VaultState.READY
        _add_account("From Credential Manager")
        key = store.get()
        assert key and len(key) == 64
        set_runtime(None)

        # A fresh runtime with a fresh store object: the key comes from Windows.
        second = StorageRuntime(settings, CredentialManagerKeyStore(target))
        set_runtime(second)
        assert second.start() == VaultState.READY
        assert _account_names() == ["From Credential Manager"]
        assert second.status()["key_storage"]["kind"] == "windows_credential_manager"
    finally:
        set_runtime(None)
        store.delete()
        assert CredentialManagerKeyStore(target).get() is None


# ------------------------------------------------------------------ migration


def test_migration_preserves_every_record(make_runtime, tmp_path):
    legacy_db = make_legacy_database(tmp_path / "legacy", pending_wal=True)
    before = _hashes(legacy_db.parent)
    reference = _open_legacy_copy(legacy_db, tmp_path)

    runtime = make_runtime()
    assert runtime.start() == VaultState.READY
    status = runtime.status()
    assert status["migration"]["migrated"] and status["migration"]["just_migrated"]

    # The original files were never opened or changed.
    assert _hashes(legacy_db.parent) == before

    vault = cipher.connect(runtime.settings.db_path, runtime.require_key())
    try:
        for (table,) in reference.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name != 'alembic_version'"
        ):
            columns = ["rowid", *legacy_columns(reference, table)]
            if table == "assets":
                columns.remove("include_in_net_worth")  # deliberately reclassified
            expected = table_rows(reference, table, columns)
            actual = table_rows(vault, table, columns)
            assert expected, f"fixture left {table} empty"
            if table in SEEDED_TABLES:
                # Every original row survives unchanged; seeding may add defaults.
                original_ids = {row[0] for row in expected}
                assert [row for row in actual if row[0] in original_ids] == expected, table
            else:
                assert actual == expected, table
        # The WAL-only rows (a killed 2.0 app) made it across.
        assert vault.execute("SELECT count(*) FROM transactions WHERE id = 4").fetchone() == (1,)
        assert vault.execute("SELECT count(*) FROM assets WHERE name = 'Sofa'").fetchone() == (1,)
        assert cipher.cipher_integrity_errors(vault) == []
        assert cipher.integrity_errors(vault) == []
        assert cipher.foreign_key_violations(vault) == 0
        head = bootstrap.head_revision()
        assert vault.execute("SELECT version_num FROM alembic_version").fetchone() == (head,)
    finally:
        vault.close()
        reference.close()

    report_path = Path(status["migration"]["report"])
    report = json.loads(report_path.read_text(encoding="utf-8"))
    assert report["status"] == "succeeded"
    assert report["legacy_untouched"] is True
    assert all(report["checks"].values())
    assert report["checks"]["financial_totals_match"] is True
    text = report_path.read_text(encoding="utf-8")
    for amount in FIXTURE_AMOUNTS:
        assert amount not in text

    # Plaintext backup exists (and is honestly plaintext); the work copy is gone.
    backup = Path(report["plaintext_backup"])
    assert backup.exists() and cipher.is_plaintext_sqlite(backup)
    assert not (report_path.parent / "work").exists()
    assert not Path(f"{runtime.settings.db_path}.migrating").exists()


def test_migrated_net_worth_follows_the_new_classification(make_runtime, tmp_path):
    make_legacy_database(tmp_path / "legacy")
    runtime = make_runtime()
    runtime.start()
    with session_scope() as session:
        flags = {
            a.name: (a.include_in_net_worth, a.include_in_net_worth_manual)
            for a in session.scalars(select(Asset))
        }
    assert flags == {
        "MacBook Pro": (False, False),  # Electronics now a personal possession
        "Sofa": (False, False),  # Furniture
        "Flat": (True, False),  # Property
        "Car": (False, True),  # explicitly excluded under 2.0: kept as a choice
    }
    from app.db.session import get_engine

    summary = financial_summary(get_engine())
    assert summary["physical_assets"] == 500_000_00
    assert summary["personal_possessions"] == 12_000_00 + 8_000_00 + 90_000_00


def test_migration_repairs_index_only_damage(make_runtime, tmp_path):
    legacy_db = make_legacy_database(tmp_path / "legacy", pending_wal=False)
    damage_index(legacy_db)
    before = _hashes(legacy_db.parent)

    runtime = make_runtime()
    assert runtime.start() == VaultState.READY
    report = json.loads(Path(runtime.status()["migration"]["report"]).read_text("utf-8"))
    assert report["index_repair"]["performed"] is True
    assert report["index_repair"]["table_data_unchanged"] is True
    assert report["index_repair"]["indexes_reported"] == ["ix_transactions_type"]
    assert _hashes(legacy_db.parent) == before

    vault = cipher.connect(runtime.settings.db_path, runtime.require_key())
    try:
        assert cipher.integrity_errors(vault) == []
        # The previously unindexed row is present and now reachable by index.
        assert vault.execute(
            "SELECT count(*) FROM transactions INDEXED BY ix_transactions_type WHERE type='expense'"
        ).fetchone() == (3,)
    finally:
        vault.close()


def test_real_corruption_aborts_and_leaves_the_original_untouched(make_runtime, tmp_path):
    legacy_db = make_legacy_database(tmp_path / "legacy", pending_wal=False)
    connection = sqlite3.connect(legacy_db)
    root = connection.execute(
        "SELECT rootpage FROM sqlite_master WHERE name = 'transactions'"
    ).fetchone()[0]
    page_size = connection.execute("PRAGMA page_size").fetchone()[0]
    connection.close()
    raw = bytearray(legacy_db.read_bytes())
    offset = (root - 1) * page_size
    raw[offset + 8 : offset + 40] = b"\xff" * 32  # smash the table b-tree page
    legacy_db.write_bytes(bytes(raw))
    before = _hashes(legacy_db.parent)

    runtime = make_runtime()
    assert runtime.start() == VaultState.MIGRATION_FAILED
    assert _hashes(legacy_db.parent) == before
    assert not runtime.settings.db_path.exists()  # no empty vault was created
    assert not Path(f"{runtime.settings.db_path}.migrating").exists()
    assert runtime.status()["migration"]["failure"]["step"] in ("verify_source", "unexpected")

    # A second launch retries rather than starting an empty database.
    set_runtime(None)
    again = make_runtime()
    assert again.start() == VaultState.MIGRATION_FAILED
    assert not again.settings.db_path.exists()


def test_failure_after_encryption_leaves_the_original_untouched(make_runtime, tmp_path, monkeypatch):
    legacy_db = make_legacy_database(tmp_path / "legacy")
    before = _hashes(legacy_db.parent)

    def broken(self, *args, **kwargs):
        raise MigrationError("verify_encrypted", "simulated verification failure")

    monkeypatch.setattr(LegacyMigration, "_verify_encrypted", broken)
    runtime = make_runtime()
    assert runtime.start() == VaultState.MIGRATION_FAILED
    assert _hashes(legacy_db.parent) == before
    assert not runtime.settings.db_path.exists()
    assert not Path(f"{runtime.settings.db_path}.migrating").exists()
    work = list(runtime.settings.migration_dir.glob("*/work"))
    assert work == []

    monkeypatch.undo()
    set_runtime(None)
    retry = make_runtime(runtime.key_store)
    assert retry.start() == VaultState.READY
    assert _hashes(legacy_db.parent) == before


def test_schema_upgrade_takes_an_encrypted_backup_first(make_runtime, tmp_path):
    from alembic import command

    from app.db.engine import build_engine

    store = MemoryKeyStore()
    key = cipher.generate_key()
    store.set(key)
    settings = _settings(tmp_path)
    settings.ensure_directories()
    engine = build_engine(settings.db_path, lambda: key)
    config = bootstrap.alembic_config()
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "042bb366d803")
    engine.dispose()

    runtime = make_runtime(store)
    assert runtime.start() == VaultState.READY
    safety = runtime.backups.list("safety")
    assert [b.reason for b in safety] == ["pre-migration"]
    assert runtime.backups.verify(safety[0]).revision == "042bb366d803"
    connection = cipher.connect(settings.db_path, key)
    assert connection.execute("SELECT version_num FROM alembic_version").fetchone() == (
        bootstrap.head_revision(),
    )
    connection.close()


# -------------------------------------------------------------------- backups


def test_startup_takes_an_encrypted_daily_backup(make_runtime):
    runtime = make_runtime()
    runtime.start()
    kinds = {b.kind for b in runtime.backups.list()}
    assert {"daily", "weekly", "monthly"} <= kinds


def test_encrypted_backup_opens_with_the_key_and_is_not_plaintext(make_runtime):
    runtime = make_runtime()
    runtime.start()
    _add_account("Backed up")
    backup = runtime.backups.create("manual")

    assert not cipher.is_plaintext_sqlite(backup.path)
    plain = sqlite3.connect(backup.path)
    with pytest.raises(sqlite3.DatabaseError):
        plain.execute("SELECT * FROM sqlite_master").fetchall()
    plain.close()
    assert not cipher.can_open(backup.path, cipher.generate_key())
    result = runtime.backups.verify(backup, bootstrap.known_revisions())
    assert result.ok, result.problems
    connection = cipher.connect(backup.path, runtime.require_key())
    assert connection.execute("SELECT name FROM accounts").fetchall() == [("Backed up",)]
    connection.close()


def test_backup_retention_keeps_7_daily_4_weekly_12_monthly(make_runtime):
    runtime = make_runtime()
    runtime.start()
    for path in runtime.settings.backup_dir.rglob("*.db"):
        path.unlink()
    start = datetime(2025, 1, 1, 9, 0, 0)
    for day in range(0, 460, 3):
        runtime.backups.run_scheduled(now=start + timedelta(days=day))
    counts = {kind: len(runtime.backups.list(kind)) for kind in ("daily", "weekly", "monthly")}
    assert counts == {"daily": 7, "weekly": 4, "monthly": 12}


def test_restore_reproduces_the_backed_up_data(make_runtime):
    runtime = make_runtime()
    runtime.start()
    _add_account("Original")
    backup = runtime.backups.create("manual")
    _add_account("Added later")
    assert _account_names() == ["Added later", "Original"]

    result = runtime.restore(backup.id)

    assert _account_names() == ["Original"]
    safety = runtime.backups.resolve(result["safety_backup"]["id"])
    connection = cipher.connect(safety.path, runtime.require_key())
    assert sorted(r[0] for r in connection.execute("SELECT name FROM accounts")) == [
        "Added later",
        "Original",
    ]
    connection.close()
    live = cipher.connect(runtime.settings.db_path, runtime.require_key())
    assert cipher.integrity_errors(live) == [] and cipher.cipher_integrity_errors(live) == []
    live.close()


def test_restore_refuses_a_backup_the_key_cannot_open(make_runtime, tmp_path):
    runtime = make_runtime()
    runtime.start()
    _add_account("Live")
    foreign = cipher.connect(tmp_path / "foreign.db", cipher.generate_key())
    foreign.execute("CREATE TABLE t(x)")
    foreign.close()
    target = runtime.settings.backup_dir / "manual" / "finance-manual-20200101-000000.db"
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(tmp_path / "foreign.db", target)

    with pytest.raises(SecurityError, match="cannot be restored"):
        runtime.restore("manual/finance-manual-20200101-000000.db")
    assert _account_names() == ["Live"]


def test_restore_rejects_unknown_ids(make_runtime):
    runtime = make_runtime()
    runtime.start()
    with pytest.raises(SecurityError):
        runtime.restore("../../vault/finance.db")


# ------------------------------------------------------------------- recovery


def test_recovery_key_round_trip_and_typo_detection():
    key = cipher.generate_key()
    text = recovery.encode(key)
    assert text.startswith("OIS1-")
    assert recovery.decode(text) == key
    assert recovery.decode(text.lower().replace("-", " ")) == key
    body = text[5:]
    flipped = ("B" if body[0] != "B" else "C") + body[1:]
    with pytest.raises(recovery.RecoveryKeyError, match="typo"):
        recovery.decode("OIS1-" + flipped)
    with pytest.raises(recovery.RecoveryKeyError):
        recovery.decode("OIS1-ABCDE")


def test_missing_key_locks_and_the_recovery_key_unlocks(make_runtime):
    store = MemoryKeyStore()
    runtime = make_runtime(store)
    runtime.start()
    _add_account("Precious")
    recovery_key = runtime.export_recovery_key()
    assert runtime.status()["recovery_key"]["configured"] is True
    set_runtime(None)

    # New Windows installation: Credential Manager is empty.
    empty = MemoryKeyStore()
    locked = make_runtime(empty)
    assert locked.start() == VaultState.LOCKED
    assert locked.reason == "key_missing"
    with pytest.raises(Exception):
        locked.require_key()
    with pytest.raises(SecurityError):
        locked.unlock_with_recovery_key(recovery.encode(cipher.generate_key()))
    assert locked.state == VaultState.LOCKED

    assert locked.unlock_with_recovery_key(recovery_key) == VaultState.READY
    assert empty.get() == store.get()
    assert _account_names() == ["Precious"]


def test_a_key_that_does_not_open_the_vault_locks_it(make_runtime):
    runtime = make_runtime()
    runtime.start()
    set_runtime(None)
    wrong = MemoryKeyStore()
    wrong.set(cipher.generate_key())
    locked = make_runtime(wrong)
    assert locked.start() == VaultState.LOCKED
    assert locked.reason == "key_mismatch"


def test_missing_vault_file_is_detected_and_restorable(make_runtime):
    store = MemoryKeyStore()
    runtime = make_runtime(store)
    runtime.start()
    _add_account("Survivor")
    backup = runtime.backups.create("manual")
    set_runtime(None)
    runtime.settings.db_path.unlink()

    missing = make_runtime(store)
    assert missing.start() == VaultState.VAULT_MISSING
    assert not missing.settings.db_path.exists()  # never silently recreated
    missing.restore(backup.id)
    assert missing.state == VaultState.READY
    assert _account_names() == ["Survivor"]


# --------------------------------------------------------- plaintext cleanup


def test_plaintext_removal_needs_confirmation_state_and_deletes_every_copy(make_runtime, tmp_path):
    legacy_db = make_legacy_database(tmp_path / "legacy")
    old_backups = tmp_path / "legacy" / "backups"
    old_backups.mkdir()
    shutil.copy2(legacy_db, old_backups / "finance-20260922-before-v2.db")

    runtime = make_runtime()
    runtime.start()
    files = runtime.plaintext_files()
    assert legacy_db in files and old_backups / "finance-20260922-before-v2.db" in files
    assert runtime.status()["migration"]["plaintext_backup_exists"] is True

    result = runtime.remove_plaintext()

    assert result["removed_files"] == len(files)
    assert not legacy_db.exists() and not Path(f"{legacy_db}-wal").exists()
    assert not old_backups.exists()
    assert runtime.plaintext_files() == []
    status = runtime.status()
    assert status["migration"]["plaintext_backup_exists"] is False
    assert status["migration"]["plaintext_removed_at"]
    assert len(_account_names()) == 3  # the vault itself is untouched


def test_plaintext_removal_refused_without_an_encrypted_backup(make_runtime, tmp_path):
    legacy_db = make_legacy_database(tmp_path / "legacy")
    runtime = make_runtime()
    runtime.start()
    for path in runtime.settings.backup_dir.rglob("*.db"):
        path.unlink()
    with pytest.raises(SecurityError, match="encrypted backup first"):
        runtime.remove_plaintext()
    assert legacy_db.exists()


# ------------------------------------------------------------------- logging


def test_no_sensitive_data_is_logged(make_runtime, tmp_path, caplog):
    caplog.set_level(logging.DEBUG)
    make_legacy_database(tmp_path / "legacy")
    runtime = make_runtime()
    runtime.start()
    recovery_key = runtime.export_recovery_key()
    backup = runtime.backups.create("manual")
    runtime.restore(backup.id)
    key = runtime.require_key()

    text = "\n".join(record.getMessage() for record in caplog.records)
    assert "migration_completed" in text and "backup_created" in text
    assert "restore_completed" in text and "encryption_enabled" in text
    assert key not in text and key.upper() not in text
    assert recovery_key not in text and recovery_key.replace("-", "") not in text
    for amount in FIXTURE_AMOUNTS:
        assert amount not in text, amount


def test_log_filter_redacts_anything_key_shaped():
    from app.core.logging import RedactSecretsFilter

    key = cipher.generate_key()
    record = logging.LogRecord("x", logging.INFO, "", 0, "leak %s and %s", (key, recovery.encode(key)), None)
    RedactSecretsFilter().filter(record)
    message = record.getMessage()
    assert key not in message and "OIS1-" not in message
    assert message.count("[REDACTED]") == 2
