"""Statement importers, keyed by source. Register new sources here."""

from __future__ import annotations

from app.importers.base import StatementImporter, UnsupportedStatementError
from app.importers.wechat import WeChatStatementImporter

IMPORTERS: dict[str, StatementImporter] = {
    WeChatStatementImporter.source: WeChatStatementImporter(),
}


def get_importer(source: str) -> StatementImporter:
    try:
        return IMPORTERS[source]
    except KeyError as exc:
        raise UnsupportedStatementError(f"Unknown statement source '{source}'.") from exc


__all__ = ["IMPORTERS", "StatementImporter", "UnsupportedStatementError", "get_importer"]
