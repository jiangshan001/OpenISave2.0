from __future__ import annotations

from decimal import Decimal

import pytest

from app.core.money import MoneyError, convert_minor, format_money, to_major, to_minor


def test_cny_minor_units():
    assert to_minor("123.45", "CNY") == 12345
    assert to_major(12345, "CNY") == Decimal("123.45")


def test_gbp_minor_units():
    assert to_minor("12.50", "GBP") == 1250
    assert to_major(1250, "GBP") == Decimal("12.50")


def test_jpy_has_no_minor_units():
    assert to_minor("1200", "JPY") == 1200
    assert to_major(1200, "JPY") == Decimal("1200")


def test_rounding_is_half_up_not_bankers():
    assert to_minor("0.005", "CNY") == 1
    assert to_minor("2.675", "CNY") == 268


def test_repeated_addition_stays_exact():
    total = sum(to_minor("0.10", "CNY") for _ in range(10))
    assert total == 100
    assert to_major(total, "CNY") == Decimal("1.00")


def test_convert_gbp_to_cny():
    # GBP 1,000 at 9.50 -> CNY 9,500
    assert convert_minor(100_000, "GBP", "CNY", Decimal("9.50")) == 950_000


def test_convert_across_different_minor_scales():
    # JPY 10,000 at 0.048 -> CNY 480.00
    assert convert_minor(10_000, "JPY", "CNY", Decimal("0.048")) == 48_000


def test_convert_same_currency_is_identity():
    assert convert_minor(12345, "CNY", "CNY", Decimal("1")) == 12345


def test_convert_rejects_non_positive_rate():
    with pytest.raises(MoneyError):
        convert_minor(100, "GBP", "CNY", Decimal("0"))


def test_unsupported_currency_rejected():
    with pytest.raises(MoneyError):
        to_minor("1.00", "XXX")


def test_format_money():
    assert format_money(12345, "CNY") == "¥123.45"
    assert format_money(-1250, "GBP") == "-£12.50"
