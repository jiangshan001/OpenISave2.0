"""Non-secret storage metadata (config/storage.json).

Records facts the app needs across launches -- when the vault was created,
whether it came from a V2 plaintext migration, where the plaintext migration
backup lives, whether the recovery key was exported. Never a key.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

FORMAT = 1


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class StorageMeta:
    def __init__(self, config_dir: Path) -> None:
        self.path = config_dir / "storage.json"

    def read(self) -> dict[str, Any]:
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except (OSError, ValueError):
            return {}

    def write(self, data: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {"format": FORMAT, **data}
        temporary = self.path.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
        os.replace(temporary, self.path)

    def update(self, **changes: Any) -> dict[str, Any]:
        data = self.read()
        data.update(changes)
        self.write(data)
        return data
