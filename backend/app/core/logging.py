"""Logging setup.

Log records describe events and identifiers only — never balances, salaries or
transaction amounts.
"""

from __future__ import annotations

import logging
from logging.handlers import RotatingFileHandler

from app.core.config import settings

_CONFIGURED = False
_FORMAT = "%(asctime)s %(levelname)s %(name)s %(message)s"


def configure_logging() -> None:
    global _CONFIGURED
    if _CONFIGURED:
        return
    settings.ensure_directories()
    root = logging.getLogger()
    root.setLevel(settings.log_level.upper())

    stream = logging.StreamHandler()
    stream.setFormatter(logging.Formatter(_FORMAT))
    root.addHandler(stream)

    file_handler = RotatingFileHandler(
        settings.log_dir / "openisave2.log", maxBytes=1_000_000, backupCount=5, encoding="utf-8"
    )
    file_handler.setFormatter(logging.Formatter(_FORMAT))
    root.addHandler(file_handler)
    _CONFIGURED = True


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
