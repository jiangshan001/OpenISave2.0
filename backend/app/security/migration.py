"""One-time migration of the OpenISave 2.0.x plaintext database into the vault.

The original files are never opened, let alone modified: SQLite would replay
a pending WAL into the main file the moment anything opened it. Instead:

 1. copy finance.db (+ -wal, -shm) byte-for-byte into a private work folder,
    re-hashing the originals afterwards to prove they did not change;
 2. open the work copy (replaying the WAL there) and write a consolidated,
    untouched plaintext backup `finance-before-encryption-<stamp>.db`;
 3. integrity_check + foreign_key_check the work copy. Index-only damage
    ("row N missing from index X") is repaired with REINDEX, provided the
    table contents are provably identical before and after; anything else
    aborts;
 4. fingerprint every table (row counts + salted digests);
 5. get the key from Credential Manager, or generate a 256-bit key, store it
    and read it back;
 6. `sqlcipher_export` the work copy into vault/finance.db.migrating -- the
    documented SQLCipher plaintext-to-encrypted mechanism;
 7. verify the encrypted copy: cipher_integrity_check, integrity_check,
    foreign keys, not readable as plain SQLite, fingerprints identical;
 8. apply pending schema migrations to both copies and prove that every
    account balance, net worth (new classification rules), transaction,
    goal and budget figure is identical;
 9. close, reopen with the key freshly read from Credential Manager, verify
    again;
10. only then atomically rename the file into place as vault/finance.db and
    record the migration in config/storage.json.

On any failure the partial encrypted file and the work folder are removed and
the original database is left exactly as it was. The report written alongside
contains row counts and pass/fail results only -- never an amount.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import sqlite3
import traceback
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from app.core.config import Settings
from app.core.logging import get_logger
from app.db import bootstrap
from app.db.engine import build_engine
from app.security import cipher, fingerprint
from app.security.keystore import KeyStore
from app.security.secure_delete import remove_tree_securely, secure_delete
from app.security.storage_meta import StorageMeta, now_iso

logger = get_logger(__name__)

SIDECARS = ("", "-wal", "-shm")
_INDEX_ONLY = re.compile(r"^(row \d+ missing from index \S+|wrong # of entries in index \S+)$")


class MigrationError(RuntimeError):
    def __init__(self, step: str, message: str) -> None:
        super().__init__(message)
        self.step = step


@dataclass
class MigrationReport:
    started_at: str = field(default_factory=now_iso)
    finished_at: str | None = None
    status: str = "running"
    failure_step: str | None = None
    failure_reason: str | None = None
    legacy_db: str = ""
    legacy_files: list[dict] = field(default_factory=list)
    legacy_untouched: bool | None = None
    plaintext_backup: str | None = None
    encrypted_db: str = ""
    source_integrity_errors: list[str] = field(default_factory=list)
    index_repair: dict = field(default_factory=lambda: {"performed": False})
    tables: dict = field(default_factory=dict)
    checks: dict = field(default_factory=dict)
    schema: dict = field(default_factory=dict)
    reclassification: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return dict(self.__dict__)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _legacy_files(legacy_db: Path) -> list[Path]:
    return [Path(f"{legacy_db}{suffix}") for suffix in SIDECARS if Path(f"{legacy_db}{suffix}").exists()]


class OfflineFxProvider:
    """Verification must never reach the network: cached rates only."""

    name = "offline"

    def get_latest_rates(self, base, quotes):
        from app.core.exceptions import FxProviderError

        raise FxProviderError("offline")

    def get_rate(self, base, quote, on_date):
        return None


def financial_summary(engine) -> dict:
    """Every figure the migration must preserve, computed by the real services.

    Held in memory for comparison only; never logged or written anywhere.
    """
    from sqlalchemy import func, select
    from sqlalchemy.orm import Session

    from app.models.budget import Budget
    from app.models.transaction import Transaction
    from app.services.account_service import AccountService
    from app.services.asset_service import AssetService
    from app.services.fx_service import FxService
    from app.services.goal_service import GoalService
    from app.services.networth_service import NetWorthService

    with Session(engine) as session:
        fx = FxService(session, OfflineFxProvider())  # type: ignore[arg-type]
        accounts = AccountService(session, fx)
        assets = AssetService(session, fx)
        worth = NetWorthService(session, accounts, assets).calculate()
        summary = {
            "balances": sorted(
                (b.account.id, b.balance_minor, b.base_balance_minor) for b in worth.balances
            ),
            "net_worth": worth.net_worth_minor,
            "total_assets": worth.total_assets_minor,
            "total_liabilities": worth.total_liabilities_minor,
            "physical_assets": worth.physical_assets_minor,
            "personal_possessions": worth.personal_possessions_minor,
            "unconverted": sorted(worth.unconverted_accounts),
            "transactions": sorted(
                tuple(row)
                for row in session.execute(
                    select(
                        Transaction.type,
                        Transaction.is_voided,
                        func.count(),
                        func.sum(Transaction.amount_minor),
                        func.sum(Transaction.base_amount_minor),
                    ).group_by(Transaction.type, Transaction.is_voided)
                )
            ),
            "goals": sorted(
                (item.goal.id, item.current_amount_minor, item.goal.target_amount_minor)
                for item in GoalService(session, accounts, fx).list_progress()
            ),
            "budgets": tuple(
                session.execute(select(func.count(), func.sum(Budget.amount_minor))).one()
            ),
        }
        session.rollback()
        return summary


class LegacyMigration:
    def __init__(self, settings: Settings, key_store: KeyStore) -> None:
        self.settings = settings
        self.key_store = key_store
        self.stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        self.folder = settings.migration_dir / self.stamp
        self.work = self.folder / "work"
        self.partial = settings.vault_dir / "finance.db.migrating"
        self.report = MigrationReport(
            legacy_db=str(settings.legacy_db_path), encrypted_db=str(settings.db_path)
        )
        self._salt = fingerprint.new_salt()

    # ------------------------------------------------------------------ steps

    def _copy_originals(self) -> Path:
        legacy = self.settings.legacy_db_path
        originals = _legacy_files(legacy)
        before = {p.name: _sha256(p) for p in originals}
        self.work.mkdir(parents=True, exist_ok=True)
        for path in originals:
            shutil.copy2(path, self.work / path.name)
        after = {p.name: _sha256(p) for p in _legacy_files(legacy)}
        copied = {p.name: _sha256(self.work / p.name) for p in originals}
        if before != after:
            raise MigrationError("copy", "The original database changed while it was being copied. Close every OpenISave window and try again.")
        if copied != before:
            raise MigrationError("copy", "The copy of the original database does not match it.")
        self.report.legacy_files = [
            {"name": p.name, "size_bytes": p.stat().st_size} for p in originals
        ]
        return self.work / legacy.name

    def _write_plaintext_backup(self, work_db: Path) -> Path:
        target = self.folder / f"finance-before-encryption-{self.stamp}.db"
        source = sqlite3.connect(str(work_db))
        destination = sqlite3.connect(str(target))
        try:
            source.backup(destination)
        finally:
            destination.close()
            source.close()
        self.report.plaintext_backup = str(target)
        logger.info("migration_plaintext_backup_created")
        return target

    def _check_and_repair(self, connection) -> None:
        errors = cipher.integrity_errors(connection)
        self.report.source_integrity_errors = errors
        if cipher.foreign_key_violations(connection):
            raise MigrationError("verify_source", "The original database has broken references between records.")
        if not errors:
            self.report.checks["source_integrity_ok"] = True
            return
        if not all(_INDEX_ONLY.match(error) for error in errors):
            raise MigrationError("verify_source", "The original database failed its integrity check.")

        # Index entries are derived from table rows; rebuild them from the rows.
        before = fingerprint.database_fingerprint(connection, self._salt)["tables"]
        connection.execute("REINDEX")
        after = fingerprint.database_fingerprint(connection, self._salt)["tables"]
        remaining = cipher.integrity_errors(connection)
        unchanged = before == after
        self.report.index_repair = {
            "performed": True,
            "indexes_reported": sorted({error.split()[-1] for error in errors}),
            "table_data_unchanged": unchanged,
            "integrity_after_repair": "ok" if not remaining else "failed",
        }
        logger.info("migration_index_repair ok=%s", unchanged and not remaining)
        if remaining or not unchanged:
            raise MigrationError("repair", "Rebuilding the damaged indexes did not produce a healthy database.")
        self.report.checks["source_integrity_ok"] = True

    def _key(self) -> str:
        key = self.key_store.get()
        if key is None:
            key = cipher.generate_key()
            self.key_store.set(key)
            logger.info("encryption_key_generated store=%s", self.key_store.kind)
        if self.key_store.get() != cipher.check_key(key):
            raise MigrationError("key", "The encryption key could not be stored in Windows Credential Manager.")
        return key

    def _export(self, work_db: Path, key: str) -> None:
        self.partial.unlink(missing_ok=True)
        connection = cipher.connect(work_db, None)
        try:
            connection.execute(
                f"ATTACH DATABASE ? AS encrypted {cipher.attach_key_clause(key)}",
                (str(self.partial),),
            )
            connection.execute("SELECT sqlcipher_export('encrypted')")
            connection.execute("DETACH DATABASE encrypted")
        finally:
            connection.close()

    def _verify_encrypted(self, key: str, expected: dict, label: str) -> dict:
        if cipher.is_plaintext_sqlite(self.partial):
            raise MigrationError(label, "The new database is not encrypted.")
        if not cipher.can_open(self.partial, key):
            raise MigrationError(label, "The new database does not open with the stored key.")
        connection = cipher.connect(self.partial, key)
        try:
            if cipher.cipher_integrity_errors(connection):
                raise MigrationError(label, "The encrypted database failed its page authentication check.")
            if cipher.integrity_errors(connection):
                raise MigrationError(label, "The encrypted database failed its integrity check.")
            if cipher.foreign_key_violations(connection):
                raise MigrationError(label, "The encrypted database has broken references.")
            actual = fingerprint.database_fingerprint(connection, self._salt)
        finally:
            connection.close()
        if actual["tables"] != expected["tables"]:
            raise MigrationError(label, "The encrypted database does not contain exactly the original records.")
        return actual

    def _upgrade_and_compare(self, work_db: Path, key: str) -> None:
        plain_engine = build_engine(work_db, lambda: None)
        vault_engine = build_engine(self.partial, lambda: key)
        try:
            self.report.schema["source_revision"] = bootstrap.current_revision(vault_engine)
            bootstrap.upgrade(plain_engine)
            bootstrap.upgrade(vault_engine)
            self.report.schema["upgraded_to"] = bootstrap.current_revision(vault_engine)
            if financial_summary(plain_engine) != financial_summary(vault_engine):
                raise MigrationError("compare", "Balances or totals differ between the original and the encrypted database.")
            self.report.checks["financial_totals_match"] = True
            with vault_engine.connect() as connection:
                rows = connection.exec_driver_sql(
                    "SELECT include_in_net_worth, count(*) FROM assets "
                    "WHERE status = 'holding' GROUP BY include_in_net_worth"
                ).all()
            counts = {bool(flag): count for flag, count in rows}
            self.report.reclassification = {
                "held_assets_included": counts.get(True, 0),
                "held_assets_excluded_as_personal_possessions": counts.get(False, 0),
            }
        finally:
            plain_engine.dispose()
            vault_engine.dispose()

    def _settle(self, key: str) -> None:
        """Fold any WAL into the file so the rename moves every committed page."""
        connection = cipher.connect(self.partial, key)
        try:
            connection.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            mode = str(connection.execute("PRAGMA journal_mode = DELETE").fetchone()[0])
        finally:
            connection.close()
        if mode.lower() != "delete" or Path(f"{self.partial}-wal").exists():
            raise MigrationError("final", "The encrypted database could not be finalised.")

    # ------------------------------------------------------------------- run

    def run(self) -> MigrationReport:
        report = self.report
        logger.info("migration_started")
        try:
            if self.settings.db_path.exists():
                raise MigrationError("precheck", "An encrypted database already exists.")
            if not self.settings.legacy_db_path.exists():
                raise MigrationError("precheck", "No OpenISave 2.0 database was found.")
            self.settings.ensure_directories()
            legacy_hashes = {p.name: _sha256(p) for p in _legacy_files(self.settings.legacy_db_path)}

            work_db = self._copy_originals()
            self._write_plaintext_backup(work_db)

            connection = cipher.connect(work_db, None)
            try:
                self._check_and_repair(connection)
                connection.execute("PRAGMA wal_checkpoint(TRUNCATE)")
                connection.execute("PRAGMA journal_mode = DELETE")
                source = fingerprint.database_fingerprint(connection, self._salt)
            finally:
                connection.close()

            key = self._key()
            self._export(work_db, key)
            self._verify_encrypted(key, source, "verify_encrypted")
            report.checks.update(
                cipher_integrity_ok=True,
                integrity_ok=True,
                foreign_keys_ok=True,
                not_readable_as_plain_sqlite=True,
                records_identical=True,
            )
            report.tables = {
                name: {"rows": entry["rows"], "content_match": True}
                for name, entry in source["tables"].items()
            }

            # Snapshot of the upgraded work copy is taken inside the compare.
            self._upgrade_and_compare(work_db, key)

            # Reopen from scratch with the key as stored in the OS key store.
            stored = self.key_store.get()
            if stored is None:
                raise MigrationError("reopen", "The key disappeared from Windows Credential Manager.")
            connection = cipher.connect(work_db, None)
            try:
                upgraded = fingerprint.database_fingerprint(connection, self._salt)
            finally:
                connection.close()
            self._settle(stored)
            self._verify_encrypted(stored, upgraded, "reopen")
            report.checks["reopen_with_stored_key_ok"] = True

            after = {p.name: _sha256(p) for p in _legacy_files(self.settings.legacy_db_path)}
            report.legacy_untouched = after == legacy_hashes
            if not report.legacy_untouched:
                raise MigrationError("final", "The original database changed during migration.")

            os.replace(self.partial, self.settings.db_path)
            logger.info("encryption_enabled")
        except Exception as exc:
            step = exc.step if isinstance(exc, MigrationError) else "unexpected"
            report.status = "failed"
            report.failure_step = step
            report.failure_reason = str(exc) if isinstance(exc, MigrationError) else type(exc).__name__
            # Exception messages can carry SQL parameters (amounts); log the
            # type and code locations only.
            frames = " | ".join(
                f"{frame.filename}:{frame.lineno}:{frame.name}"
                for frame in traceback.extract_tb(exc.__traceback__)
            )
            logger.error("migration_failed step=%s type=%s at=%s", step, type(exc).__name__, frames)
            self.partial.unlink(missing_ok=True)
            self._cleanup_work()
            self._write_report()
            return report

        self._cleanup_work()
        report.status = "succeeded"
        report.finished_at = now_iso()
        self._write_report()
        StorageMeta(self.settings.config_dir).update(
            vault_created_at=now_iso(),
            migration={
                "migrated_at": report.finished_at,
                "legacy_db": report.legacy_db,
                "legacy_root": str(self.settings.legacy_data_root),
                "plaintext_backup": report.plaintext_backup,
                "report": str(self.folder / "migration-report.json"),
                "plaintext_removed_at": None,
            },
        )
        logger.info("migration_completed")
        return report

    def _cleanup_work(self) -> None:
        """The work folder holds plaintext copies; scrub it either way."""
        try:
            remove_tree_securely(self.work)
        except OSError:  # pragma: no cover - reported via leftover folder
            logger.warning("migration_work_cleanup_failed")
        for suffix in ("-wal", "-shm", "-journal"):
            leftover = Path(f"{self.partial}{suffix}")
            if leftover.exists():
                secure_delete(leftover)

    def _write_report(self) -> None:
        self.folder.mkdir(parents=True, exist_ok=True)
        (self.folder / "migration-report.json").write_text(
            json.dumps(self.report.to_dict(), indent=2), encoding="utf-8"
        )
