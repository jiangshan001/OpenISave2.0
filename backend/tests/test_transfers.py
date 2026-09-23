from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from app.core.exceptions import ValidationError
from app.core.money import to_minor
from tests.conftest import make_account

TODAY = date.today()


def test_same_currency_transfer_moves_money_between_accounts(accounts, ledger):
    source = make_account(accounts, "招商银行", "CNY", "20000.00")
    destination = make_account(accounts, "中国银行", "CNY", "50000.00")
    ledger.create_transfer(
        {
            "from_account_id": source.id,
            "to_account_id": destination.id,
            "amount_minor": to_minor("5000.00", "CNY"),
            "transaction_date": TODAY,
        }
    )
    assert accounts.balance_for(source.id).balance_minor == to_minor("15000.00", "CNY")
    assert accounts.balance_for(destination.id).balance_minor == to_minor("55000.00", "CNY")


def test_transfer_is_not_income_or_expense(accounts, ledger, dashboard):
    source = make_account(accounts, "招商银行", "CNY", "20000.00")
    destination = make_account(accounts, "中国银行", "CNY", "50000.00")
    ledger.create_transfer(
        {
            "from_account_id": source.id,
            "to_account_id": destination.id,
            "amount_minor": to_minor("3000.00", "CNY"),
            "transaction_date": TODAY,
        }
    )
    data = dashboard.build(TODAY)
    assert data["month_income_minor"] == 0
    assert data["month_expense_minor"] == 0


def test_transfer_does_not_change_net_worth(accounts, ledger, networth):
    source = make_account(accounts, "招商银行", "CNY", "20000.00")
    destination = make_account(accounts, "中国银行", "CNY", "50000.00")
    before = networth.calculate().net_worth_minor
    ledger.create_transfer(
        {
            "from_account_id": source.id,
            "to_account_id": destination.id,
            "amount_minor": to_minor("3000.00", "CNY"),
            "transaction_date": TODAY,
        }
    )
    assert networth.calculate().net_worth_minor == before


def test_cross_currency_transfer_records_both_sides(accounts, ledger):
    hsbc = make_account(accounts, "HSBC UK", "GBP", "10000.00")
    cmb = make_account(accounts, "招商银行", "CNY", "20000.00")
    transfer = ledger.create_transfer(
        {
            "from_account_id": hsbc.id,
            "to_account_id": cmb.id,
            "amount_minor": to_minor("1000.00", "GBP"),
            "dest_amount_minor": to_minor("9650.00", "CNY"),
            "transaction_date": TODAY,
        }
    )
    assert transfer.currency == "GBP"
    assert transfer.amount_minor == to_minor("1000.00", "GBP")
    assert transfer.dest_currency == "CNY"
    assert transfer.dest_amount_minor == to_minor("9650.00", "CNY")
    assert Decimal(transfer.transfer_rate) == Decimal("9.6500000000")

    assert accounts.balance_for(hsbc.id).balance_minor == to_minor("9000.00", "GBP")
    assert accounts.balance_for(cmb.id).balance_minor == to_minor("29650.00", "CNY")


def test_cross_currency_transfer_legs_net_to_zero_in_base(accounts, ledger, networth):
    hsbc = make_account(accounts, "HSBC UK", "GBP", "10000.00")
    cmb = make_account(accounts, "招商银行", "CNY", "20000.00")
    before = networth.calculate().net_worth_minor
    transfer = ledger.create_transfer(
        {
            "from_account_id": hsbc.id,
            "to_account_id": cmb.id,
            "amount_minor": to_minor("1000.00", "GBP"),
            "dest_amount_minor": to_minor("9650.00", "CNY"),
            "transaction_date": TODAY,
        }
    )
    assert sum(posting.base_amount_minor for posting in transfer.postings) == 0
    assert networth.calculate().net_worth_minor == before


def test_transfer_to_the_same_account_is_rejected(accounts, ledger):
    account = make_account(accounts, "招商银行", "CNY", "20000.00")
    with pytest.raises(ValidationError):
        ledger.create_transfer(
            {
                "from_account_id": account.id,
                "to_account_id": account.id,
                "amount_minor": 1000,
                "transaction_date": TODAY,
            }
        )


def test_cross_currency_transfer_requires_the_received_amount(accounts, ledger):
    hsbc = make_account(accounts, "HSBC UK", "GBP", "10000.00")
    cmb = make_account(accounts, "招商银行", "CNY", "20000.00")
    with pytest.raises(ValidationError):
        ledger.create_transfer(
            {
                "from_account_id": hsbc.id,
                "to_account_id": cmb.id,
                "amount_minor": to_minor("1000.00", "GBP"),
                "transaction_date": TODAY,
            }
        )


def test_transfer_fee_becomes_a_linked_expense(accounts, ledger, dashboard):
    hsbc = make_account(accounts, "HSBC UK", "GBP", "10000.00")
    cmb = make_account(accounts, "招商银行", "CNY", "20000.00")
    transfer = ledger.create_transfer(
        {
            "from_account_id": hsbc.id,
            "to_account_id": cmb.id,
            "amount_minor": to_minor("1000.00", "GBP"),
            "dest_amount_minor": to_minor("9650.00", "CNY"),
            "fee_minor": to_minor("5.00", "GBP"),
            "transaction_date": TODAY,
        }
    )
    # The fee leaves the source account on top of the transferred amount.
    assert accounts.balance_for(hsbc.id).balance_minor == to_minor("8995.00", "GBP")
    data = dashboard.build(TODAY)
    assert data["month_expense_minor"] == to_minor("48.25", "CNY")  # 5 GBP at 9.65
    assert data["month_income_minor"] == 0

    children = ledger.repo.children_of(transfer.id)
    assert len(children) == 1 and children[0].type == "expense"


def test_voiding_a_transfer_also_voids_its_fee(accounts, ledger):
    hsbc = make_account(accounts, "HSBC UK", "GBP", "10000.00")
    cmb = make_account(accounts, "招商银行", "CNY", "20000.00")
    transfer = ledger.create_transfer(
        {
            "from_account_id": hsbc.id,
            "to_account_id": cmb.id,
            "amount_minor": to_minor("1000.00", "GBP"),
            "dest_amount_minor": to_minor("9650.00", "CNY"),
            "fee_minor": to_minor("5.00", "GBP"),
            "transaction_date": TODAY,
        }
    )
    ledger.void(transfer.id)
    assert accounts.balance_for(hsbc.id).balance_minor == to_minor("10000.00", "GBP")
    assert all(child.is_voided for child in ledger.repo.children_of(transfer.id))
