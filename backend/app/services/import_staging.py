"""In-memory holding area for parsed statements awaiting review.

Between "Parse" and "Confirm import" the parsed rows live only in this
process's memory under a random token -- never in the database, never on disk.
The original file bytes are not kept at all. Entries expire after 30 minutes,
are dropped once imported, and vanish when the app exits.
"""

from __future__ import annotations

import secrets
import threading
import time
from dataclasses import dataclass, field

from app.core.exceptions import NotFoundError
from app.importers.base import ParsedStatement

TTL_SECONDS = 30 * 60
MAX_STAGED = 4


@dataclass
class StagedStatement:
    token: str
    source: str
    file_name: str | None
    parsed: ParsedStatement
    created_at: float = field(default_factory=time.monotonic)


class ImportStaging:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._items: dict[str, StagedStatement] = {}

    def _expire(self) -> None:
        now = time.monotonic()
        for token in [t for t, item in self._items.items() if now - item.created_at > TTL_SECONDS]:
            del self._items[token]

    def put(self, source: str, file_name: str | None, parsed: ParsedStatement) -> StagedStatement:
        with self._lock:
            self._expire()
            while len(self._items) >= MAX_STAGED:
                oldest = min(self._items.values(), key=lambda item: item.created_at)
                del self._items[oldest.token]
            item = StagedStatement(secrets.token_urlsafe(18), source, file_name, parsed)
            self._items[item.token] = item
            return item

    def get(self, token: str) -> StagedStatement:
        with self._lock:
            self._expire()
            item = self._items.get(token)
        if item is None:
            raise NotFoundError(
                "This import has expired or was already completed. Choose the file again."
            )
        return item

    def discard(self, token: str) -> None:
        with self._lock:
            self._items.pop(token, None)

    def clear(self) -> None:
        with self._lock:
            self._items.clear()


staging = ImportStaging()
