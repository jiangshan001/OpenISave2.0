"""Content fingerprints for proving two databases hold identical data.

Every table is read in rowid order with NOT INDEXED, so the fingerprint comes
from the table b-trees alone and is immune to index damage. Digests are
HMAC-SHA256 under a random per-run salt that is never stored: they can be
compared within one migration run but cannot be brute-forced afterwards to
recover amounts. Reports only ever show row counts and match booleans.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets


def new_salt() -> bytes:
    return secrets.token_bytes(32)


def user_tables(connection) -> list[str]:
    rows = connection.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' "
        "ORDER BY name"
    ).fetchall()
    return [row[0] for row in rows]


def _quote(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def _canonical(value) -> bytes:
    if value is None:
        return b"N"
    if isinstance(value, bool):
        value = int(value)
    if isinstance(value, int):
        return b"I" + str(value).encode()
    if isinstance(value, float):
        return b"F" + repr(value).encode()
    if isinstance(value, (bytes, bytearray, memoryview)):
        return b"B" + bytes(value).hex().encode()
    text = str(value).encode("utf-8")
    return b"S" + str(len(text)).encode() + b":" + text


def _rows(connection, table: str):
    quoted = _quote(table)
    try:
        return connection.execute(f"SELECT * FROM {quoted} NOT INDEXED ORDER BY rowid")
    except Exception:
        # WITHOUT ROWID tables: order by every column instead.
        count = len(connection.execute(f"PRAGMA table_info({quoted})").fetchall())
        order = ", ".join(str(i) for i in range(1, count + 1))
        return connection.execute(f"SELECT * FROM {quoted} ORDER BY {order}")


def table_fingerprint(connection, table: str, salt: bytes) -> dict:
    mac = hmac.new(salt, digestmod=hashlib.sha256)
    count = 0
    for row in _rows(connection, table):
        mac.update(b"\x1f".join(_canonical(value) for value in row))
        mac.update(b"\x1e")
        count += 1
    return {"rows": count, "digest": mac.hexdigest()}


def schema_fingerprint(connection, salt: bytes) -> str:
    rows = connection.execute(
        "SELECT type, name, tbl_name, sql FROM sqlite_master "
        "WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"
    ).fetchall()
    mac = hmac.new(salt, digestmod=hashlib.sha256)
    for row in rows:
        mac.update(b"\x1f".join(_canonical(value) for value in row) + b"\x1e")
    return mac.hexdigest()


def database_fingerprint(connection, salt: bytes) -> dict:
    return {
        "tables": {
            table: table_fingerprint(connection, table, salt)
            for table in user_tables(connection)
        },
        "schema": schema_fingerprint(connection, salt),
    }


def row_counts(fingerprint: dict) -> dict[str, int]:
    return {name: entry["rows"] for name, entry in fingerprint["tables"].items()}
