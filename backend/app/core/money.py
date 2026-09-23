"""Money primitives.

Monetary amounts are stored as integer minor units (fen, pence, cents) plus a
currency code.  Binary floats are never used for money; every intermediate
calculation goes through Decimal.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

# code -> (symbol, minor_unit_digits, display_name)
CURRENCY_METADATA: dict[str, tuple[str, int, str]] = {
    "CNY": ("¥", 2, "Chinese Yuan"),
    "GBP": ("£", 2, "British Pound"),
    "USD": ("$", 2, "US Dollar"),
    "EUR": ("€", 2, "Euro"),
    "JPY": ("¥", 0, "Japanese Yen"),
    "CAD": ("C$", 2, "Canadian Dollar"),
    "AUD": ("A$", 2, "Australian Dollar"),
}

BASE_CURRENCY = "CNY"
SUPPORTED_CURRENCIES = tuple(CURRENCY_METADATA)

RATE_PRECISION = Decimal("0.0000000001")


class MoneyError(ValueError):
    """Raised when a monetary value cannot be interpreted."""


def is_supported(currency: str) -> bool:
    return currency.upper() in CURRENCY_METADATA


def minor_digits(currency: str) -> int:
    try:
        return CURRENCY_METADATA[currency.upper()][1]
    except KeyError as exc:  # pragma: no cover - guarded by validation
        raise MoneyError(f"Unsupported currency: {currency}") from exc


def _scale(currency: str) -> Decimal:
    return Decimal(10) ** minor_digits(currency)


def to_minor(amount: Decimal | int | str, currency: str) -> int:
    """Convert a major-unit amount (e.g. "123.45") to integer minor units."""
    try:
        value = Decimal(str(amount))
    except InvalidOperation as exc:
        raise MoneyError(f"Invalid monetary amount: {amount!r}") from exc
    if not value.is_finite():
        raise MoneyError(f"Invalid monetary amount: {amount!r}")
    return int((value * _scale(currency)).quantize(Decimal(1), rounding=ROUND_HALF_UP))


def to_major(amount_minor: int, currency: str) -> Decimal:
    """Convert integer minor units back to an exact major-unit Decimal."""
    digits = minor_digits(currency)
    quantum = Decimal(1).scaleb(-digits)
    return (Decimal(amount_minor) / _scale(currency)).quantize(quantum, rounding=ROUND_HALF_UP)


def convert_minor(amount_minor: int, from_currency: str, to_currency: str, rate: Decimal) -> int:
    """Convert minor units between currencies using `rate` = to per 1 from.

    Handles differing minor-unit scales (e.g. JPY has 0 decimals).
    """
    if rate <= 0:
        raise MoneyError("Exchange rate must be greater than zero")
    if from_currency.upper() == to_currency.upper():
        return amount_minor
    major = Decimal(amount_minor) / _scale(from_currency)
    converted = major * Decimal(rate)
    return int((converted * _scale(to_currency)).quantize(Decimal(1), rounding=ROUND_HALF_UP))


def quantize_rate(rate: Decimal | str | int) -> Decimal:
    try:
        value = Decimal(str(rate))
    except InvalidOperation as exc:
        raise MoneyError(f"Invalid exchange rate: {rate!r}") from exc
    if not value.is_finite() or value <= 0:
        raise MoneyError(f"Invalid exchange rate: {rate!r}")
    return value.quantize(RATE_PRECISION, rounding=ROUND_HALF_UP)


def format_money(amount_minor: int, currency: str) -> str:
    symbol = CURRENCY_METADATA[currency.upper()][0]
    value = to_major(amount_minor, currency)
    sign = "-" if value < 0 else ""
    return f"{sign}{symbol}{abs(value):,}"
