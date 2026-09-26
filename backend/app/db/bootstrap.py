"""Schema migrations for the packaged desktop application.

The desktop build has no shell for `alembic upgrade head`, so the app applies
its own migrations at startup -- always over a keyed connection, and always
after a mandatory encrypted backup when an existing database is about to
change (architecture section 34).
"""

from __future__ import annotations

import sys
from collections.abc import Callable
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy.engine import Engine

from app.core.logging import get_logger

logger = get_logger(__name__)


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
    config.attributes["configure_logger"] = False
    return config


def head_revision() -> str:
    return ScriptDirectory.from_config(alembic_config()).get_current_head()


def known_revisions() -> set[str]:
    script = ScriptDirectory.from_config(alembic_config())
    return {revision.revision for revision in script.walk_revisions()}


def current_revision(engine: Engine) -> str | None:
    with engine.connect() as connection:
        return MigrationContext.configure(connection).get_current_revision()


def upgrade(engine: Engine, before_change: Callable[[], object] | None = None) -> bool:
    """Bring the database at `engine` to head. Returns True if anything ran.

    `before_change` runs only when an existing database is about to be
    migrated; it takes the mandatory backup and must raise to abort.
    """
    current = current_revision(engine)
    head = head_revision()
    if current == head:
        return False
    if current is not None and before_change is not None:
        before_change()
    config = alembic_config()
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
    logger.info("schema_migrated from=%s to=%s", current or "empty", head)
    return True
