"""Database preparation for the packaged desktop application.

The desktop build has no shell for `alembic upgrade head`, so the app applies
its own migrations at startup. A copy of the database is taken first, because
the architecture requires a backup before any schema change.
"""

from __future__ import annotations

import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

BACKUP_KEEP = 10


def _backend_root() -> Path:
    """Where alembic.ini and the migration scripts live.

    PyInstaller unpacks bundled data into sys._MEIPASS; a normal checkout uses
    the repository layout.
    """
    bundled = getattr(sys, "_MEIPASS", None)
    if bundled:
        return Path(bundled)
    return Path(__file__).resolve().parents[2]


def alembic_config() -> Config:
    root = _backend_root()
    config = Config(str(root / "alembic.ini"))
    config.set_main_option("script_location", str(root / "alembic"))
    config.set_main_option("sqlalchemy.url", settings.sqlalchemy_url)
    return config


def _pending_revisions(config: Config) -> bool:
    from app.db.session import get_engine

    script = ScriptDirectory.from_config(config)
    head = script.get_current_head()
    with get_engine().connect() as connection:
        current = MigrationContext.configure(connection).get_current_revision()
    return current != head


def backup_database(reason: str = "migration") -> Path | None:
    """Copy the live database aside. Returns the backup path, or None."""
    source = settings.db_path
    if not source.exists():
        return None
    settings.ensure_directories()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    target = settings.backup_dir / f"finance-{stamp}-{reason}.db"
    shutil.copy2(source, target)
    _prune_backups()
    logger.info("backup_created reason=%s", reason)
    return target


def _prune_backups() -> None:
    backups = sorted(
        settings.backup_dir.glob("finance-*.db"), key=lambda path: path.stat().st_mtime
    )
    for stale in backups[:-BACKUP_KEEP]:
        try:
            stale.unlink()
        except OSError:  # pragma: no cover - best effort housekeeping
            logger.warning("backup_prune_failed")


def prepare_database() -> None:
    """Ensure the database exists and is migrated to the current schema."""
    settings.ensure_directories()
    config = alembic_config()

    existed = settings.db_path.exists()
    if existed and _pending_revisions(config):
        backup_database("pre-migration")

    command.upgrade(config, "head")
    logger.info("database_ready new=%s", not existed)
