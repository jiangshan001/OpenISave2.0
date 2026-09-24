"""The storage runtime: decides at startup how the vault is opened.

    vault exists ----- key in Credential Manager opens it ---> READY
         |        \--- key missing / does not open --------> LOCKED (recovery key)
         |
    no vault -- storage.json says one existed -------------> VAULT_MISSING (restore)
         |
         |---- OpenISave 2.0 plaintext DB present ----------> migrate -> READY
         |                                   \-- failure ---> MIGRATION_FAILED
         |                                                    (original untouched,
         |                                                     no empty vault made)
         \---- nothing yet: new key, new encrypted DB ------> READY

READY then runs schema migrations (after a mandatory encrypted backup), seeds
reference data and takes the scheduled daily/weekly/monthly backups.

The frontend never sees the key. The API is gated: until the vault is READY,
only the status and recovery endpoints answer.
"""

from __future__ import annotations

import os
import shutil
import threading
import time
from contextlib import contextmanager
from datetime import datetime
from enum import Enum
from pathlib import Path

from app.core.config import Settings, settings as default_settings
from app.core.exceptions import AppError
from app.core.logging import get_logger
from app.security import cipher, recovery
from app.security.backups import BackupError, BackupManager
from app.security.keystore import KeyStore, KeyStoreError, build_key_store
from app.security.migration import LegacyMigration
from app.security.secure_delete import remove_tree_securely, secure_delete
from app.security.storage_meta import StorageMeta, now_iso

logger = get_logger(__name__)


class VaultState(str, Enum):
    STARTING = "starting"
    READY = "ready"
    LOCKED = "locked"
    MIGRATION_FAILED = "migration_failed"
    VAULT_MISSING = "vault_missing"
    ERROR = "error"


class VaultLockedError(AppError):
    status_code = 423
    code = "vault_locked"


class SecurityError(AppError):
    status_code = 409
    code = "security_error"


class StorageRuntime:
    def __init__(self, settings: Settings, key_store: KeyStore | None = None) -> None:
        self.settings = settings
        self._key_store = key_store
        self._key: str | None = None
        self.state = VaultState.STARTING
        self.reason: str | None = None
        self.message: str | None = None
        self.last_migration: dict | None = None
        self.cipher_info: dict[str, str] = {}
        self.meta = StorageMeta(settings.config_dir)
        self.backups = BackupManager(settings, self.require_key)
        self._lock = threading.RLock()
        # Maintenance gate: requests in flight, and whether new ones may start.
        self._inflight = 0
        self._inflight_lock = threading.Lock()
        self._maintenance = False

    # ------------------------------------------------------------ key access

    @property
    def key_store(self) -> KeyStore:
        if self._key_store is None:
            self._key_store = build_key_store(self.settings)
        return self._key_store

    def require_key(self) -> str:
        if self._key is None:
            raise VaultLockedError(self.message or "Your encrypted database is locked.")
        return self._key

    def _set(self, state: VaultState, reason: str | None = None, message: str | None = None):
        self.state, self.reason, self.message = state, reason, message
        logger.info("vault_state state=%s reason=%s", state.value, reason or "-")

    # --------------------------------------------------------------- startup

    def start(self) -> VaultState:
        """Open (or create, or migrate into) the vault. Never raises."""
        with self._lock:
            try:
                self._open_or_create()
                if self.state == VaultState.READY:
                    self._finish_startup()
            except Exception as exc:  # noqa: BLE001 - reported, never swallowed silently
                logger.exception("vault_start_failed type=%s", type(exc).__name__)
                self._key = None
                self._set(
                    VaultState.ERROR,
                    "startup_failed",
                    "OpenISave could not open your encrypted database. Nothing was changed; "
                    "see the log for details.",
                )
            return self.state

    def _stored_key(self) -> str | None:
        try:
            key = self.key_store.get()
        except KeyStoreError:
            return None
        try:
            return cipher.check_key(key) if key else None
        except ValueError:
            return None

    def _open_or_create(self) -> None:
        self.settings.ensure_directories()
        db = self.settings.db_path
        if db.exists():
            key = self._stored_key()
            if key is None:
                self._set(
                    VaultState.LOCKED,
                    "key_missing",
                    "The encryption key for your database is not in Windows Credential Manager "
                    "on this computer. Enter your recovery key to unlock it.",
                )
                return
            if not cipher.can_open(db, key):
                self._set(
                    VaultState.LOCKED,
                    "key_mismatch",
                    "The key in Windows Credential Manager does not open this database. "
                    "Enter your recovery key to unlock it.",
                )
                return
            self._key = key
            self._set(VaultState.READY)
            return

        meta = self.meta.read()
        if meta.get("vault_created_at"):
            self._key = self._stored_key()
            self._set(
                VaultState.VAULT_MISSING,
                "vault_missing",
                "Your encrypted database file is missing. Restore it from a backup.",
            )
            return

        if self.settings.legacy_db_path.exists():
            report = LegacyMigration(self.settings, self.key_store).run()
            self.last_migration = report.to_dict()
            if report.status != "succeeded":
                self._set(
                    VaultState.MIGRATION_FAILED,
                    report.failure_step,
                    f"Encrypting your existing data did not complete: {report.failure_reason} "
                    f"Your original database is untouched at {self.settings.legacy_db_path}.",
                )
                return
            self._key = self._stored_key()
            self.last_migration["just_migrated"] = True
            self._set(VaultState.READY, "migrated")
            return

        key = self._stored_key()
        if key is None:
            key = cipher.generate_key()
            self.key_store.set(key)
            if self._stored_key() != key:
                raise KeyStoreError("The new key could not be read back from the key store.")
            logger.info("encryption_key_generated store=%s", self.key_store.kind)
        self._key = key
        self.meta.update(vault_created_at=now_iso())
        self._set(VaultState.READY, "created")
        logger.info("encryption_enabled")

    def _finish_startup(self) -> None:
        from app.db import bootstrap
        from app.db.seed import seed_all
        from app.db.session import dispose_engine, get_engine, session_scope

        if get_runtime() is not self:
            raise RuntimeError("This storage runtime is not the one bound to the session layer.")
        dispose_engine()
        engine = get_engine()
        bootstrap.upgrade(
            engine, before_change=lambda: self.backups.create("safety", reason="pre-migration")
        )
        with session_scope() as session:
            seed_all(session)
        connection = cipher.connect(self.settings.db_path, self.require_key())
        try:
            self.cipher_info = cipher.cipher_details(connection)
        finally:
            connection.close()
        logger.info("database_opened")
        try:
            self.backups.run_scheduled()
        except BackupError:
            logger.exception("scheduled_backup_failed")

    def unlock_for_cli(self) -> None:
        """Used by the Alembic CLI: open the vault without seeding or backups."""
        if self._key is None:
            self._open_or_create()
            self.require_key()

    # -------------------------------------------------------------- recovery

    def unlock_with_recovery_key(self, text: str) -> VaultState:
        with self._lock:
            if self.state not in (VaultState.LOCKED, VaultState.VAULT_MISSING):
                raise SecurityError("The database is not locked.")
            try:
                key = recovery.decode(text)
            except recovery.RecoveryKeyError as exc:
                raise SecurityError(str(exc)) from exc
            target = self.settings.db_path
            if target.exists():
                if not cipher.can_open(target, key):
                    raise SecurityError("This recovery key does not unlock this database.")
            else:
                # No live file to test against: the key must open a backup.
                if not any(cipher.can_open(b.path, key) for b in self.backups.list()):
                    raise SecurityError("This recovery key does not unlock any of your backups.")
            self.key_store.set(key)
            if self._stored_key() != key:
                raise SecurityError("The key could not be saved to Windows Credential Manager.")
            logger.info("recovery_key_accepted")
            # Whoever typed it in evidently holds a copy.
            if not self.meta.read().get("recovery_key_exported_at"):
                self.meta.update(recovery_key_exported_at=now_iso())
            self._key = key
            if target.exists():
                self._set(VaultState.READY, "recovered")
                self._finish_startup()
            return self.state

    def export_recovery_key(self) -> str:
        key = self.require_key()
        self.meta.update(recovery_key_exported_at=now_iso())
        logger.info("recovery_key_exported")
        return recovery.encode(key)

    # ------------------------------------------------------ maintenance gate

    def request_started(self) -> bool:
        with self._inflight_lock:
            if self._maintenance:
                return False
            self._inflight += 1
            return True

    def request_finished(self) -> None:
        with self._inflight_lock:
            self._inflight = max(self._inflight - 1, 0)

    @contextmanager
    def maintenance(self, timeout: float = 15.0):
        """Stop new requests and wait for others to finish (the caller's own
        request is still counted, hence `> 1`)."""
        with self._inflight_lock:
            self._maintenance = True
        try:
            deadline = time.monotonic() + timeout
            while time.monotonic() < deadline:
                with self._inflight_lock:
                    if self._inflight <= 1:
                        break
                time.sleep(0.05)
            else:
                raise SecurityError("OpenISave is busy. Try again in a moment.")
            yield
        finally:
            with self._inflight_lock:
                self._maintenance = False

    # ----------------------------------------------------------------- restore

    def _swap_in(self, source: Path) -> None:
        """Replace the live database file with `source` (already verified)."""
        from app.db.session import dispose_engine

        db = self.settings.db_path
        dispose_engine()
        if db.exists():
            connection = cipher.connect(db, self.require_key())
            try:
                busy = connection.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone()[0]
                connection.execute("PRAGMA journal_mode = DELETE")
            finally:
                connection.close()
            if busy:
                raise SecurityError("The database is still in use; restore was not started.")
        staged = db.with_name("finance.db.restoring")
        shutil.copy2(source, staged)
        if not cipher.verify_encrypted_file(staged, self.require_key()).ok:
            staged.unlink(missing_ok=True)
            raise SecurityError("The copied backup failed verification; nothing was changed.")
        for suffix in ("-wal", "-shm"):
            Path(f"{db}{suffix}").unlink(missing_ok=True)
        os.replace(staged, db)

    def restore(self, backup_id: str) -> dict:
        from app.db import bootstrap

        with self._lock:
            if self.state not in (VaultState.READY, VaultState.VAULT_MISSING):
                raise SecurityError("Unlock the database before restoring a backup.")
            try:
                info = self.backups.resolve(backup_id)
            except BackupError as exc:
                raise SecurityError(str(exc)) from exc
            result = self.backups.verify(info, bootstrap.known_revisions())
            if not result.ok:
                raise SecurityError(
                    "This backup cannot be restored: " + ", ".join(result.problems) + "."
                )
            safety = None
            if self.settings.db_path.exists():
                safety = self.backups.create("safety", reason="pre-restore")

            with self.maintenance():
                try:
                    self._swap_in(info.path)
                    self._set(VaultState.READY, "restored")
                    self._finish_startup()
                except Exception:
                    logger.exception("restore_failed")
                    if safety is not None:
                        self._swap_in(safety.path)
                        self._set(VaultState.READY, "restore_rolled_back")
                        self._finish_startup()
                    raise
            logger.info("restore_completed kind=%s", info.kind)
            return {"restored": info.to_dict(), "safety_backup": safety.to_dict() if safety else None}

    # ------------------------------------------------------- plaintext cleanup

    def plaintext_files(self) -> list[Path]:
        """Every plaintext copy left over from OpenISave 2.0 and the migration."""
        migration = self.meta.read().get("migration") or {}
        if not migration or migration.get("plaintext_removed_at"):
            return []
        legacy_root = Path(migration.get("legacy_root") or self.settings.legacy_data_root)
        candidates: list[Path] = []
        legacy_db = Path(migration.get("legacy_db") or self.settings.legacy_db_path)
        candidates += [Path(f"{legacy_db}{s}") for s in ("", "-wal", "-shm", "-journal")]
        backups = legacy_root / "backups"
        if backups.is_dir():
            candidates += [p for p in backups.rglob("*") if p.is_file()]
        if migration.get("plaintext_backup"):
            candidates.append(Path(migration["plaintext_backup"]))
        return [p for p in candidates if p.exists()]

    def remove_plaintext(self) -> dict:
        with self._lock:
            if self.state != VaultState.READY:
                raise SecurityError("Unlock the database first.")
            migration = self.meta.read().get("migration") or {}
            if not migration:
                raise SecurityError("There is no plaintext migration backup to remove.")
            migrated_at = datetime.fromisoformat(migration["migrated_at"]).astimezone().replace(
                tzinfo=None
            )
            verified = [
                b
                for b in self.backups.list()
                if b.created_at >= migrated_at.replace(microsecond=0) and self.backups.verify(b).ok
            ]
            if not verified:
                raise SecurityError(
                    "Create an encrypted backup first, so the plaintext copy is not your only "
                    "rollback."
                )
            files = self.plaintext_files()
            for path in files:
                secure_delete(path)
            legacy_root = Path(migration.get("legacy_root") or self.settings.legacy_data_root)
            remove_tree_securely(legacy_root / "backups")
            for folder in (legacy_root / "data",):
                try:
                    folder.rmdir()
                except OSError:
                    pass
            migration["plaintext_removed_at"] = now_iso()
            self.meta.update(migration=migration)
            logger.info("plaintext_backup_removed files=%s", len(files))
            return {"removed_files": len(files)}

    # ----------------------------------------------------------------- status

    def status(self) -> dict:
        meta = self.meta.read()
        migration = meta.get("migration") or None
        latest = None
        backups: list = []
        counts: dict[str, int] = {}
        try:
            backups = self.backups.list()
            latest = backups[0].to_dict() if backups else None
            for item in backups:
                counts[item.kind] = counts.get(item.kind, 0) + 1
        except OSError:
            pass
        plaintext = [str(p) for p in self.plaintext_files()] if migration else []
        key_present = self._key is not None or self._stored_key() is not None
        return {
            "state": self.state.value,
            "reason": self.reason,
            "message": self.message,
            "app_version": self.settings.app_version,
            "encryption": {
                "enabled": True,
                "engine": "SQLCipher",
                "cipher_version": self.cipher_info.get("cipher_version"),
                "provider": self.cipher_info.get("provider_version"),
                "algorithm": "AES-256 page encryption, HMAC-SHA512 page authentication",
            },
            "key_storage": {
                "kind": self.key_store.kind,
                "label": self.key_store.label,
                "target": self.key_store.target,
                "present": key_present,
            },
            "data_location": str(self.settings.data_root),
            "database_path": str(self.settings.db_path),
            "backup_location": str(self.settings.backup_dir),
            "last_backup": latest,
            "backup_count": len(backups),
            "backup_counts": counts,
            "recovery_key": {
                "configured": bool(meta.get("recovery_key_exported_at")),
                "exported_at": meta.get("recovery_key_exported_at"),
            },
            "migration": {
                "migrated": bool(migration),
                "migrated_at": (migration or {}).get("migrated_at"),
                "report": (migration or {}).get("report"),
                "just_migrated": bool((self.last_migration or {}).get("just_migrated")),
                "plaintext_backup_exists": bool(plaintext),
                "plaintext_files": plaintext,
                "plaintext_removed_at": (migration or {}).get("plaintext_removed_at"),
                "failure": (
                    {
                        "step": self.last_migration.get("failure_step"),
                        "reason": self.last_migration.get("failure_reason"),
                    }
                    if self.last_migration and self.last_migration.get("status") == "failed"
                    else None
                ),
            },
        }


_runtime: StorageRuntime | None = None
_runtime_lock = threading.Lock()


def get_runtime() -> StorageRuntime:
    global _runtime
    with _runtime_lock:
        if _runtime is None:
            _runtime = StorageRuntime(default_settings)
        return _runtime


def set_runtime(runtime: StorageRuntime | None) -> None:
    """Swap the process-wide runtime (tests, and nothing else)."""
    global _runtime
    from app.db.session import dispose_engine

    with _runtime_lock:
        dispose_engine()
        _runtime = runtime
