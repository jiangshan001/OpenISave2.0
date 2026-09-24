"""Engine and session management for the encrypted vault.

The engine is built lazily from the storage runtime, which owns the key; if
the vault is locked, asking for a session raises VaultLockedError instead of
ever opening the file without a key.
"""

from __future__ import annotations

import threading
from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.db.engine import build_engine

_lock = threading.RLock()
_engine: Engine | None = None
_SessionFactory: sessionmaker[Session] | None = None


def get_engine() -> Engine:
    global _engine
    with _lock:
        if _engine is None:
            from app.security.runtime import get_runtime

            runtime = get_runtime()
            runtime.require_key()  # fail fast while locked
            _engine = build_engine(runtime.settings.db_path, runtime.require_key)
        return _engine


def get_session_factory() -> sessionmaker[Session]:
    global _SessionFactory
    with _lock:
        if _SessionFactory is None:
            _SessionFactory = sessionmaker(
                bind=get_engine(), autoflush=False, expire_on_commit=False
            )
        return _SessionFactory


def dispose_engine() -> None:
    """Close every pooled connection and forget the engine.

    Used before the database file is swapped (restore) or when the runtime is
    rebound in tests. The next request builds a fresh engine.
    """
    global _engine, _SessionFactory
    with _lock:
        if _engine is not None:
            _engine.dispose()
        _engine = None
        _SessionFactory = None


def get_db() -> Iterator[Session]:
    """FastAPI dependency yielding a request-scoped session."""
    session = get_session_factory()()
    try:
        yield session
    finally:
        session.close()


@contextmanager
def session_scope() -> Iterator[Session]:
    session = get_session_factory()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
