from __future__ import annotations

import pytest

from app.core.exceptions import ConflictError, ValidationError
from app.core.money import to_minor
from tests.conftest import make_account


def test_opening_balance_is_the_starting_balance(accounts):
    account = make_account(accounts, "招商银行", "CNY", "20000.00")
    assert accounts.balance_for(account.id).balance_minor == to_minor("20000.00", "CNY")


def test_account_is_created_with_purpose_and_institution(accounts):
    account = make_account(
        accounts,
        "中国银行",
        "CNY",
        "50000.00",
        institution="Bank of China",
        purpose="emergency_fund",
    )
    assert account.institution == "Bank of China"
    assert account.purpose == "emergency_fund"
    assert account.is_active and not account.is_archived


def test_foreign_currency_account_reports_a_cny_value(accounts):
    account = make_account(accounts, "Monzo", "GBP", "2000.00")
    balance = accounts.balance_for(account.id)
    assert balance.balance_minor == to_minor("2000.00", "GBP")
    # 2,000 GBP at the stubbed 9.65 -> 19,300 CNY
    assert balance.base_balance_minor == to_minor("19300.00", "CNY")


def test_duplicate_account_name_is_rejected(accounts):
    make_account(accounts, "Monzo", "GBP", "100.00")
    with pytest.raises(ConflictError):
        make_account(accounts, "Monzo", "GBP", "100.00")


def test_unsupported_currency_is_rejected(accounts):
    with pytest.raises(ValidationError):
        accounts.create(
            {
                "name": "Weird",
                "currency": "XXX",
                "account_type": "bank",
                "opening_balance_minor": 100,
            }
        )


def test_archived_account_cannot_receive_transactions(accounts):
    account = make_account(accounts, "Old Card", "CNY", "0.00")
    accounts.archive(account.id)
    with pytest.raises(ValidationError):
        accounts.get_active(account.id)


def test_liability_account_classification(accounts):
    card = make_account(
        accounts, "CMB Credit Card", "CNY", "-3000.00", account_type="credit_card"
    )
    assert accounts.is_liability_account(card) is True
    assert accounts.balance_for(card.id).balance_minor == to_minor("-3000.00", "CNY")
