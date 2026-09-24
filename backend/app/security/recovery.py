"""Human-transcribable recovery key.

The recovery key is the database key itself, encoded for people: Base32
(no 0/1/8/9 look-alikes), a 16-bit checksum to catch typos, grouped in fives.

    OIS1-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX

Encoding the key directly (rather than wrapping it) keeps recovery dependent on
nothing but the recovery key and an encrypted database or backup: no extra key
file has to survive a disk failure or a Windows reinstall. It is therefore
exactly as sensitive as the database key, and is only ever produced on an
explicit user request -- never written to the data directory or logs.
"""

from __future__ import annotations

import base64
import hashlib

from app.security.cipher import KEY_BYTES, check_key

PREFIX = "OIS1"
_CHECKSUM_BYTES = 2
_GROUP = 5
#: Characters people commonly type for the Base32 letters they resemble.
_LOOKALIKES = str.maketrans({"0": "O", "1": "I", "8": "B"})


class RecoveryKeyError(ValueError):
    pass


def _checksum(raw: bytes) -> bytes:
    return hashlib.sha256(b"OpenISave2 recovery" + raw).digest()[:_CHECKSUM_BYTES]


def encode(key_hex: str) -> str:
    raw = bytes.fromhex(check_key(key_hex))
    body = base64.b32encode(raw + _checksum(raw)).decode("ascii").rstrip("=")
    groups = [body[i : i + _GROUP] for i in range(0, len(body), _GROUP)]
    return "-".join([PREFIX, *groups])


def decode(text: str) -> str:
    """Parse a recovery key typed or pasted by a person. Returns the hex key."""
    cleaned = "".join(ch for ch in (text or "").upper() if ch.isalnum())
    if cleaned.startswith(PREFIX):
        cleaned = cleaned[len(PREFIX) :]
    cleaned = cleaned.translate(_LOOKALIKES)
    if not cleaned:
        raise RecoveryKeyError("Enter your recovery key.")
    padding = "=" * (-len(cleaned) % 8)
    try:
        payload = base64.b32decode(cleaned + padding)
    except (ValueError, base64.binascii.Error) as exc:
        raise RecoveryKeyError("That is not a valid OpenISave recovery key.") from exc
    if len(payload) != KEY_BYTES + _CHECKSUM_BYTES:
        raise RecoveryKeyError("That recovery key is incomplete or has extra characters.")
    raw, checksum = payload[:KEY_BYTES], payload[KEY_BYTES:]
    if _checksum(raw) != checksum:
        raise RecoveryKeyError("That recovery key contains a typo — check each group again.")
    return raw.hex()
