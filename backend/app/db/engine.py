"""SQLAlchemy engines over SQLCipher.

SQLAlchemy stays the only data-access layer; only the DB-API underneath
changes. The stock `sqlite+pysqlite` dialect is pointed at the `sqlcipher3`
module, and every pooled connection is opened by `creator`, which applies the
key before anything else can touch the file. (The bundled `pysqlcipher`
dialect is avoided on purpose: it re-issues `PRAGMA key` from the URL
password, which would put the key into a URL string.)
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

import sqlcipher3
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.pool import QueuePool

from app.security import cipher


def build_engine(path: Path, key_provider: Callable[[], str | None]) -> Engine:
    """An engine whose connections are opened with the key from `key_provider`.

    The provider is called per new connection so the key is held by the vault
    runtime, not captured in engine configuration. Returning None opens a
    plaintext file -- used only on throwaway copies during migration checks.
    """

    def creator():
        connection = cipher.connect(path, key_provider(), autocommit=False)
        cipher.configure_live_connection(connection)
        return connection

    return create_engine(
        "sqlite+pysqlite://",
        module=sqlcipher3,
        creator=creator,
        poolclass=QueuePool,
        pool_size=5,
        max_overflow=10,
        future=True,
        echo=False,
    )
