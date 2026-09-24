"""Encrypted backups.

Every backup is a SQLCipher database encrypted with the vault key. It is made
with `VACUUM INTO` over a keyed connection -- a consistent snapshot, including
anything still in the WAL, written straight to an encrypted file. A backup is
written under a temporary name, verified (opens with the key, every page's
HMAC checks out, integrity_check passes, not readable as plain SQLite) and only
then given its final name.

Layout and retention:

    backups/daily/     7   one per day, made at startup
    backups/weekly/    4   one per ISO week (copy of that day's daily)
    backups/monthly/  12   one per month   (copy of that day's daily)
    backups/manual/   20   "Back Up Now"
    backups/safety/   10   automatic, before a schema migration or a restore
"""

from __future__ import annotations

import os
import re
import shutil
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from app.core.config import Settings
from app.core.logging import get_logger
from app.security import cipher

logger = get_logger(__name__)

RETENTION: dict[str, int] = {"daily": 7, "weekly": 4, "monthly": 12, "manual": 20, "safety": 10}
_NAME = re.compile(
    r"^finance-(?P<kind>[a-z]+)-(?P<stamp>\d{8}-\d{6})(?:-(?P<reason>[a-z0-9-]+))?\.db$"
)
_STAMP = "%Y%m%d-%H%M%S"


class BackupError(RuntimeError):
    pass


@dataclass(frozen=True)
class BackupInfo:
    id: str  # "<kind>/<file name>", the only form the API accepts
    kind: str
    created_at: datetime  # local time, from the file name
    reason: str | None
    size_bytes: int
    path: Path

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "kind": self.kind,
            "created_at": self.created_at.isoformat(timespec="seconds"),
            "reason": self.reason,
            "size_bytes": self.size_bytes,
        }


class BackupManager:
    def __init__(self, settings: Settings, key_provider: Callable[[], str]) -> None:
        self.settings = settings
        self.root = settings.backup_dir
        self._key = key_provider

    # ---------------------------------------------------------------- listing

    def _parse(self, path: Path) -> BackupInfo | None:
        match = _NAME.match(path.name)
        if not match or match["kind"] != path.parent.name or match["kind"] not in RETENTION:
            return None
        try:
            created = datetime.strptime(match["stamp"], _STAMP)
            size = path.stat().st_size
        except (ValueError, OSError):
            return None
        return BackupInfo(
            id=f"{match['kind']}/{path.name}",
            kind=match["kind"],
            created_at=created,
            reason=match["reason"],
            size_bytes=size,
            path=path,
        )

    def list(self, kind: str | None = None) -> list[BackupInfo]:
        kinds = [kind] if kind else list(RETENTION)
        found: list[BackupInfo] = []
        for name in kinds:
            directory = self.root / name
            if not directory.is_dir():
                continue
            for path in directory.glob("finance-*.db"):
                info = self._parse(path)
                if info is not None:
                    found.append(info)
        return sorted(found, key=lambda item: (item.created_at, item.id), reverse=True)

    def latest(self) -> BackupInfo | None:
        backups = self.list()
        return backups[0] if backups else None

    def resolve(self, backup_id: str) -> BackupInfo:
        """Look a backup up by id. Only ids from `list()` are accepted."""
        for info in self.list():
            if info.id == backup_id:
                return info
        raise BackupError("That backup does not exist.")

    # --------------------------------------------------------------- creating

    def _target(self, kind: str, when: datetime, reason: str | None) -> Path:
        directory = self.root / kind
        directory.mkdir(parents=True, exist_ok=True)
        base = f"finance-{kind}-{when.strftime(_STAMP)}"
        suffix = f"-{reason}" if reason else ""
        candidate = directory / f"{base}{suffix}.db"
        counter = 2
        while candidate.exists():
            tail = f"{reason}-{counter}" if reason else str(counter)
            candidate = directory / f"{base}-{tail}.db"
            counter += 1
        return candidate

    def _finalise(self, partial: Path, target: Path) -> None:
        result = cipher.verify_encrypted_file(partial, self._key())
        if not result.ok:
            partial.unlink(missing_ok=True)
            raise BackupError(f"The new backup failed verification ({', '.join(result.problems)}).")
        os.replace(partial, target)

    def create(
        self,
        kind: str,
        *,
        reason: str | None = None,
        source: Path | None = None,
        now: datetime | None = None,
    ) -> BackupInfo:
        if kind not in RETENTION:
            raise BackupError(f"Unknown backup kind '{kind}'.")
        source = source or self.settings.db_path
        if not source.exists():
            raise BackupError("There is no database to back up yet.")
        target = self._target(kind, now or datetime.now(), reason)
        partial = target.with_name(f".partial-{target.name}")
        partial.unlink(missing_ok=True)

        connection = cipher.connect(source, self._key())
        try:
            connection.execute("VACUUM INTO ?", (str(partial),))
        except cipher.DatabaseError as exc:
            partial.unlink(missing_ok=True)
            raise BackupError("The database could not be copied for backup.") from exc
        finally:
            connection.close()

        self._finalise(partial, target)
        self.prune(kind)
        logger.info("backup_created kind=%s reason=%s", kind, reason or "-")
        return self._parse(target)  # type: ignore[return-value]

    def _copy_as(self, source: BackupInfo, kind: str, now: datetime) -> BackupInfo:
        target = self._target(kind, now, None)
        partial = target.with_name(f".partial-{target.name}")
        shutil.copy2(source.path, partial)
        self._finalise(partial, target)
        self.prune(kind)
        logger.info("backup_created kind=%s reason=rotation", kind)
        return self._parse(target)  # type: ignore[return-value]

    def run_scheduled(self, now: datetime | None = None) -> list[BackupInfo]:
        """Startup policy: one daily backup per day, promoted to weekly/monthly."""
        now = now or datetime.now()
        if not self.settings.db_path.exists():
            return []
        created: list[BackupInfo] = []
        today = [b for b in self.list("daily") if b.created_at.date() == now.date()]
        daily = today[0] if today else self.create("daily", now=now)
        if not today:
            created.append(daily)

        year, week, _ = now.isocalendar()
        if not any(b.created_at.isocalendar()[:2] == (year, week) for b in self.list("weekly")):
            created.append(self._copy_as(daily, "weekly", now))
        if not any(
            (b.created_at.year, b.created_at.month) == (now.year, now.month)
            for b in self.list("monthly")
        ):
            created.append(self._copy_as(daily, "monthly", now))
        return created

    def prune(self, kind: str) -> None:
        keep = RETENTION[kind]
        for stale in self.list(kind)[keep:]:
            try:
                stale.path.unlink()
            except OSError:  # pragma: no cover - best effort housekeeping
                logger.warning("backup_prune_failed kind=%s", kind)

    # -------------------------------------------------------------- verifying

    def verify(self, info: BackupInfo, known_revisions: set[str] | None = None) -> cipher.VerifyResult:
        result = cipher.verify_encrypted_file(info.path, self._key())
        if result.ok and known_revisions is not None and result.revision not in known_revisions:
            result.ok = False
            result.problems.append("schema_newer_than_this_app")
        return result
