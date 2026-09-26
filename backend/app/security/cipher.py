"""SQLCipher primitives.

Uses the `sqlcipher3` DB-API module (SQLCipher 4 community edition, OpenSSL
provider): AES-256 page encryption with a per-page HMAC-SHA512. The key is a
random 256-bit value passed as a raw hex key (`x'...'`), so no passphrase KDF
is involved and a wrong key is detected by the HMAC on page one.

Nothing here logs; callers log events, never keys.
"""

from __future__ import annotations

import re
import secrets
from dataclasses import dataclass, field
from pathlib import Path

import sqlcipher3

KEY_BYTES = 32
SQLITE_HEADER = b"SQLite format 3\x00"
_KEY_PATTERN = re.compile(r"^[0-9a-f]{64}$")

DatabaseError = sqlcipher3.DatabaseError


def generate_key() -> str:
    """A fresh 256-bit key from the OS CSPRNG, as 64 lowercase hex digits."""
    return secrets.token_hex(KEY_BYTES)


def check_key(key: str) -> str:
    if not isinstance(key, str) or not _KEY_PATTERN.match(key):
        raise ValueError("A database key must be 64 lowercase hexadecimal characters.")
    return key


def key_pragma(key: str) -> str:
    """The PRAGMA that unlocks a connection. `check_key` makes it injection-safe."""
    return f"PRAGMA key = \"x'{check_key(key)}'\""


def attach_key_clause(key: str) -> str:
    return f"KEY \"x'{check_key(key)}'\""


def connect(path: Path | str, key: str | None, *, autocommit: bool = True):
    """Open `path` with SQLCipher. `key=None` opens a plaintext SQLite file.

    Opening never validates the key: SQLCipher decrypts lazily, so callers use
    `can_open` or run a query to find out.
    """
    connection = sqlcipher3.connect(
        str(path),
        check_same_thread=False,
        isolation_level=None if autocommit else "",
    )
    # SQLCipher reports failed HMAC checks on stderr by default. They hold no
    # secrets, but a wrong-key probe is expected behaviour, not an error.
    connection.execute("PRAGMA cipher_log_level = NONE")
    if key is not None:
        connection.execute(key_pragma(key))
    return connection


def configure_live_connection(connection) -> None:
    """Pragmas for the application's own connections."""
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA journal_mode = WAL")
    # Financial data: fsync every commit, not just checkpoints.
    connection.execute("PRAGMA synchronous = FULL")
    connection.execute("PRAGMA busy_timeout = 5000")


def is_plaintext_sqlite(path: Path) -> bool:
    """True when ordinary SQLite tools could read the file."""
    try:
        with open(path, "rb") as handle:
            return handle.read(len(SQLITE_HEADER)) == SQLITE_HEADER
    except OSError:
        return False


def can_open(path: Path, key: str | None) -> bool:
    """Whether `key` decrypts `path` (reading the schema proves it)."""
    if not Path(path).exists():
        return False
    try:
        connection = connect(path, key)
    except DatabaseError:
        return False
    try:
        connection.execute("SELECT count(*) FROM sqlite_master").fetchone()
        return True
    except DatabaseError:
        return False
    finally:
        connection.close()


def cipher_integrity_errors(connection) -> list[str]:
    """HMAC verification of every page. An empty list means all pages verify."""
    return [str(row[0]) for row in connection.execute("PRAGMA cipher_integrity_check")]


def integrity_errors(connection, limit: int = 1000) -> list[str]:
    rows = [str(row[0]) for row in connection.execute(f"PRAGMA integrity_check({int(limit)})")]
    return [] if rows == ["ok"] else rows


def foreign_key_violations(connection) -> int:
    return len(connection.execute("PRAGMA foreign_key_check").fetchall())


def cipher_details(connection) -> dict[str, str]:
    def value(pragma: str) -> str:
        row = connection.execute(f"PRAGMA {pragma}").fetchone()
        return str(row[0]) if row else ""

    return {
        "cipher_version": value("cipher_version"),
        "provider": value("cipher_provider"),
        "provider_version": value("cipher_provider_version"),
        "sqlite_version": str(connection.execute("SELECT sqlite_version()").fetchone()[0]),
    }


@dataclass
class VerifyResult:
    ok: bool
    problems: list[str] = field(default_factory=list)
    revision: str | None = None


def verify_encrypted_file(path: Path, key: str) -> VerifyResult:
    """Full check of an encrypted database file (vault copy or backup)."""
    problems: list[str] = []
    if not Path(path).exists():
        return VerifyResult(False, ["file_missing"])
    if is_plaintext_sqlite(path):
        return VerifyResult(False, ["file_is_plaintext"])
    if not can_open(path, key):
        return VerifyResult(False, ["key_does_not_open_file"])
    connection = connect(path, key)
    try:
        if cipher_integrity_errors(connection):
            problems.append("cipher_integrity_failed")
        if integrity_errors(connection):
            problems.append("integrity_check_failed")
        if foreign_key_violations(connection):
            problems.append("foreign_key_violations")
        revision = None
        try:
            row = connection.execute("SELECT version_num FROM alembic_version").fetchone()
            revision = row[0] if row else None
        except DatabaseError:
            problems.append("schema_version_missing")
        return VerifyResult(not problems, problems, revision)
    finally:
        connection.close()
