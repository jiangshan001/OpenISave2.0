"""Liabilities: one outstanding balance, held by the liability account."""

from __future__ import annotations

from datetime import date

import pytest

from app.core.exceptions import ConflictError, ValidationError
from app.core.money import to_minor
from tests.conftest import make_account

TODAY = date.today()


def _financing(liabilities, outstanding="12000.00", original="12000.00"):
    return liabilities.create(
        {
            "name": "Apple Financing",
            "liability_type": "financing",
            "currency": "CNY",
            "original_amount_minor": to_minor(original, "CNY"),
            "outstanding_amount_minor": to_minor(outstanding, "CNY"),
            "lender": "Apple",
            "start_date": TODAY,
        }
    )


def test_creating_a_liability_creates_its_account(liabilities, accounts):
    liability = _financing(liabilities)
    account = accounts.get(liability.account_id)
    assert account.name == "Apple Financing"
    assert accounts.is_liability_account(account) is True
    # Debt is carried as a negative balance.
    assert account.opening_balance_minor == to_minor("-12000.00", "CNY")


def test_outstanding_comes_from_the_account(liabilities, accounts):
    liability = _financing(liabilities)
    view = liabilities.view(liability)
    assert view.outstanding_minor == to_minor("12000.00", "CNY")
    assert view.account_id == liability.account_id


def test_outstanding_has_a_single_source_of_truth(liabilities, accounts, ledger):
    """Repaying through the ledger must move the one stored balance."""
    liability = _financing(liabilities)
    cmb = make_account(accounts, "招商银行", "CNY", "50000.00")

    ledger.create_transfer(
        {
            "from_account_id": cmb.id,
            "to_account_id": liability.account_id,
            "amount_minor": to_minor("2000.00", "CNY"),
            "transaction_date": TODAY,
        }
    )

    view = liabilities.view(liabilities.get(liability.id))
    assert view.outstanding_minor == to_minor("10000.00", "CNY")
    assert view.repaid_minor == to_minor("2000.00", "CNY")
    assert accounts.balance_for(cmb.id).balance_minor == to_minor("48000.00", "CNY")
    # The liability row itself stores no balance at all.
    assert not hasattr(liability, "outstanding_minor")


def test_liability_reduces_net_worth(liabilities, accounts, networth):
    make_account(accounts, "招商银行", "CNY", "50000.00")
    before = networth.calculate()
    _financing(liabilities)
    after = networth.calculate()
    assert after.total_liabilities_minor == to_minor("12000.00", "CNY")
    assert after.net_worth_minor == before.net_worth_minor - to_minor("12000.00", "CNY")


def test_repayment_does_not_change_net_worth(liabilities, accounts, ledger, networth):
    liability = _financing(liabilities)
    cmb = make_account(accounts, "招商银行", "CNY", "50000.00")
    before = networth.calculate().net_worth_minor
    ledger.create_transfer(
        {
            "from_account_id": cmb.id,
            "to_account_id": liability.account_id,
            "amount_minor": to_minor("2000.00", "CNY"),
            "transaction_date": TODAY,
        }
    )
    assert networth.calculate().net_worth_minor == before


def test_liability_can_attach_to_an_existing_account(liabilities, accounts):
    card = make_account(accounts, "CMB Credit Card", "CNY", "-3000.00", account_type="credit_card")
    liability = liabilities.create(
        {
            "name": "CMB Card Contract",
            "liability_type": "credit_card",
            "account_id": card.id,
            "original_amount_minor": to_minor("3000.00", "CNY"),
        }
    )
    assert liability.account_id == card.id
    assert liabilities.view(liability).outstanding_minor == to_minor("3000.00", "CNY")


def test_an_asset_account_cannot_hold_a_debt(liabilities, accounts):
    savings = make_account(accounts, "Savings", "CNY", "1000.00", account_type="savings")
    with pytest.raises(ValidationError):
        liabilities.create(
            {"name": "Bad", "liability_type": "loan", "account_id": savings.id}
        )


def test_one_account_cannot_back_two_liabilities(liabilities, accounts):
    card = make_account(accounts, "Card", "CNY", "-1000.00", account_type="credit_card")
    liabilities.create({"name": "First", "liability_type": "credit_card", "account_id": card.id})
    with pytest.raises(ConflictError):
        liabilities.create(
            {"name": "Second", "liability_type": "credit_card", "account_id": card.id}
        )


# ------------------------------------------------------- financed purchase


def test_financed_purchase_does_not_overstate_net_worth(
    accounts, assets, liabilities, networth
):
    """An asset opted into net worth: 20,000 = 8,000 cash + 12,000 financed.

    Because the asset counts, net worth does not move. The default case -- a
    laptop as a personal possession -- is covered in
    test_networth_classification.py.
    """
    cmb = make_account(accounts, "招商银行", "CNY", "50000.00")
    financing = _financing(liabilities, outstanding="0.00", original="12000.00")
    before = networth.calculate().net_worth_minor

    asset = assets.purchase(
        {
            "name": "Laptop",
            "purchase_date": TODAY,
            "purchase_price_minor": to_minor("20000.00", "CNY"),
            "purchase_currency": "CNY",
            "include_in_net_worth": True,
            "linked_liability_id": financing.id,
            "payment": {
                "account_id": cmb.id,
                "cash_amount_minor": to_minor("8000.00", "CNY"),
                "liability_account_id": financing.account_id,
                "financed_amount_minor": to_minor("12000.00", "CNY"),
            },
        }
    )

    assert accounts.balance_for(cmb.id).balance_minor == to_minor("42000.00", "CNY")
    view = liabilities.view(liabilities.get(financing.id))
    assert view.outstanding_minor == to_minor("12000.00", "CNY")

    after = networth.calculate()
    assert after.physical_assets_minor == to_minor("20000.00", "CNY")
    assert after.total_liabilities_minor == to_minor("12000.00", "CNY")
    assert after.net_worth_minor == before
    assert assets.view(asset).liability_name == "Apple Financing"


def test_financed_purchase_postings_balance(accounts, assets, liabilities, ledger):
    cmb = make_account(accounts, "招商银行", "CNY", "50000.00")
    financing = _financing(liabilities, outstanding="0.00")
    assets.purchase(
        {
            "name": "Laptop",
            "purchase_date": TODAY,
            "purchase_price_minor": to_minor("20000.00", "CNY"),
            "purchase_currency": "CNY",
            "payment": {
                "account_id": cmb.id,
                "cash_amount_minor": to_minor("8000.00", "CNY"),
                "liability_account_id": financing.account_id,
                "financed_amount_minor": to_minor("12000.00", "CNY"),
            },
        }
    )
    transaction = next(
        row for row in ledger.list(limit=10) if row.type == "asset_purchase"
    )
    assert len(transaction.postings) == 3
    assert sum(posting.base_amount_minor for posting in transaction.postings) == 0


def test_deleting_a_liability_keeps_the_account_and_unlinks_assets(
    accounts, assets, liabilities
):
    financing = _financing(liabilities)
    asset = assets.purchase(
        {
            "name": "Laptop",
            "purchase_date": TODAY,
            "purchase_price_minor": to_minor("20000.00", "CNY"),
            "purchase_currency": "CNY",
            "linked_liability_id": financing.id,
        }
    )
    account_id = financing.account_id
    liabilities.delete(financing.id)
    assert accounts.get(account_id) is not None
    assert assets.get(asset.id).linked_liability_id is None
