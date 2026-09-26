"""Logging setup.

Log records describe events and identifiers only — never balances, salaries,
transaction amounts, asset prices, liability amounts, encryption keys or
recovery keys. As a second line of defence every handler runs a redaction
filter that masks anything shaped like a database key or recovery key.
"""

from __future__ import annotations

import logging
import re
from logging.handlers import RotatingFileHandler

from app.core.config import settings

_CONFIGURED = False
_FORMAT = "%(asctime)s %(levelname)s %(name)s %(message)s"
_SECRET_PATTERNS = (
    re.compile(r"\b[0-9a-fA-F]{64}\b"),  # raw 256-bit key
    re.compile(r"x'[0-9a-fA-F]{16,}'"),  # SQLCipher key literal
    re.compile(r"OIS1(?:-?[A-Z2-7]{5}){5,}", re.IGNORECASE),  # recovery key
)


class RedactSecretsFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        redacted = message
        for pattern in _SECRET_PATTERNS:
            redacted = pattern.sub("[REDACTED]", redacted)
        if redacted != message:
            record.msg, record.args = redacted, None
        return True


def configure_logging() -> None:
    global _CONFIGURED
    if _CONFIGURED:
        return
    settings.ensure_directories()
    root = logging.getLogger()
    root.setLevel(settings.log_level.upper())

    redact = RedactSecretsFilter()
    stream = logging.StreamHandler()
    stream.setFormatter(logging.Formatter(_FORMAT))
    stream.addFilter(redact)
    root.addHandler(stream)

    file_handler = RotatingFileHandler(
        settings.log_dir / "openisave2.log", maxBytes=1_000_000, backupCount=5, encoding="utf-8"
    )
    file_handler.setFormatter(logging.Formatter(_FORMAT))
    file_handler.addFilter(redact)
    root.addHandler(file_handler)
    _CONFIGURED = True


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
