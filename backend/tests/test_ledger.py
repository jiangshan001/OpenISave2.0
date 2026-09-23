from __future__ import annotations

from datetime import date

import pytest

from app.core.exceptions import ValidationError
from app.core.money import to_minor
from tests.conftest import category_id, make_account

TODAY = date.today()


def test_income_increases_the_account(accounts, ledger, session):
    account = make_account(accounts, "招商银行", "CNY", "20000.00")
    ledger.create_transaction(
        {
            "type": "income",
            "account_id": account.id,
            "amount_minor": to_minor("10000.00", "CNY"),
            "transaction_date": TODAY,
            "description": "Salary",
            "category_id": category_id(session, "Salary", "income"),
        }
    )
    assert accounts.balance_for(account.id).balance_minor == to_minor("30000.00", "CNY")


def test_expense_decreases_the_account(accounts, ledger, session):
    account = make_account(accounts, "招商银行", "CNY", "20000.00")
    ledger.create_transaction(
        {
            "type": "expense",
            "account_id": account.id,
            "amount_minor": to_minor("200.00", "CNY"),
            "transaction_date": TODAY,
            "description": "Restaurant",
            "category_id": category_id(session, "Restaurants"),
        }
    )
    assert accounts.balance_for(account.id).balance_minor == to_minor("19800.00", "CNY")


def test_expense_creates_an_account_leg_and_a_category_leg(accounts, ledger, session):
    account = make_account(accounts, "Monzo", "GBP", "2000.00")
    tx = ledger.create_transaction(
        {
            "type": "expense",
            "account_id": account.id,
            "amount_minor": to_minor("45.50", "GBP"),
            "transaction_date": TODAY,
            "description": "Tesco",
            "category_id": category_id(session, "Groceries"),
        }
    )
    assert len(tx.postings) == 2
    account_leg = next(p for p in tx.postings if p.account_id is not None)
    category_leg = next(p for p in tx.postings if p.category_id is not None)
    assert account_leg.amount_minor == -to_minor("45.50", "GBP")
    assert category_leg.amount_minor == to_minor("45.50", "GBP")
    assert account_leg.amount_minor + category_leg.amount_minor == 0


def test_native_currency_is_retained_and_cny_value_recorded(accounts, ledger, session):
    account = make_account(accounts, "Monzo", "GBP", "2000.00")
    tx = ledger.create_transaction(
        {
            "type": "expense",
            "account_id": account.id,
            "amount_minor": to_minor("20.00", "GBP"),
            "transaction_date": TODAY,
            "description": "Pret",
            "category_id": category_id(session, "Coffee"),
        }
    )
    assert tx.currency == "GBP"
    assert tx.amount_minor == to_minor("20.00", "GBP")
    # 20 GBP at the stubbed 9.65 -> 193.00 CNY
    assert tx.base_amount_minor == to_minor("193.00", "CNY")
    assert tx.base_currency == "CNY"


def test_amount_must_be_positive(accounts, ledger):
    account = make_account(accounts, "招商银行", "CNY", "100.00")
    with pytest.raises(ValidationError):
        ledger.create_transaction(
            {
                "type": "expense",
                "account_id": account.id,
                "amount_minor": 0,
                "transaction_date": TODAY,
                "description": "",
            }
        )


def test_income_category_cannot_be_used_for_an_expense(accounts, ledger, session):
    account = make_account(accounts, "招商银行", "CNY", "100.00")
    with pytest.raises(ValidationError):
        ledger.create_transaction(
            {
                "type": "expense",
                "account_id": account.id,
                "amount_minor": 100,
                "transaction_date": TODAY,
                "description": "",
                "category_id": category_id(session, "Salary", "income"),
            }
        )


def test_voiding_removes_the_effect_on_the_balance(accounts, ledger, session):
    account = make_account(accounts, "招商银行", "CNY", "20000.00")
    tx = ledger.create_transaction(
        {
            "type": "expense",
            "account_id": account.id,
            "amount_minor": to_minor("500.00", "CNY"),
            "transaction_date": TODAY,
            "description": "Rent",
            "category_id": category_id(session, "Rent"),
        }
    )
    assert accounts.balance_for(account.id).balance_minor == to_minor("19500.00", "CNY")
    ledger.void(tx.id)
    assert accounts.balance_for(account.id).balance_minor == to_minor("20000.00", "CNY")
    assert ledger.get(tx.id).is_voided is True
    assert ledger.get(tx.id).voided_at is not None


def test_transfer_cannot_be_created_through_the_transaction_endpoint(accounts, ledger):
    account = make_account(accounts, "招商银行", "CNY", "100.00")
    with pytest.raises(ValidationError):
        ledger.create_transaction(
            {
                "type": "transfer",
                "account_id": account.id,
                "amount_minor": 100,
                "transaction_date": TODAY,
                "description": "",
            }
        )
