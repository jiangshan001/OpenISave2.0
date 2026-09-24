"""Best-effort secure deletion of plaintext financial files.

Each file is overwritten in place with random bytes, flushed to disk, renamed
to a random name and then unlinked. On SSDs and copy-on-write or journaled
filesystems the old blocks may survive in spare areas; full-disk encryption
(BitLocker) is the only complete answer, and the documentation says so.
"""

from __future__ import annotations

import os
import secrets
from pathlib import Path

_CHUNK = 1024 * 1024


def secure_delete(path: Path) -> None:
    path = Path(path)
    if not path.exists():
        return
    size = path.stat().st_size
    with open(path, "r+b", buffering=0) as handle:
        remaining = size
        while remaining > 0:
            step = min(_CHUNK, remaining)
            handle.write(os.urandom(step))
            remaining -= step
        handle.flush()
        os.fsync(handle.fileno())
    scrambled = path.with_name(f".deleted-{secrets.token_hex(8)}")
    os.replace(path, scrambled)
    scrambled.unlink()


def remove_tree_securely(directory: Path) -> int:
    """Securely delete every file below `directory`, then the empty folders."""
    directory = Path(directory)
    if not directory.exists():
        return 0
    removed = 0
    for path in sorted(directory.rglob("*"), key=lambda p: len(p.parts), reverse=True):
        if path.is_file():
            secure_delete(path)
            removed += 1
        elif path.is_dir():
            try:
                path.rmdir()
            except OSError:
                pass
    try:
        directory.rmdir()
    except OSError:
        pass
    return removed
