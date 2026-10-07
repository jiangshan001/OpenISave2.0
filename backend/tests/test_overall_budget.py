"""Independent monthly limits: ledger eligibility, category compatibility and HTTP."""
from datetime import date

import pytest

from app.core.exceptions import ValidationError
from tests.conftest import category_id, make_account
from tests.test_api_end_to_end import build_client

PERIOD = (2026, 10)
DAY = date(2026, 10, 4)


def expense(ledger, account, amount, category=None, day=DAY):
    return ledger.create_transaction({
        "type": "expense", "account_id": account.id, "amount_minor": amount,
        "transaction_date": day, "category_id": category, "description": "Synthetic",
    })


def test_overall_create_update_clear_leaves_categories_untouched(budgets, session):
    budgets.replace_period(*PERIOD, [{"category_id": category_id(session, "Food"), "amount_minor": 400_000}])
    before = budgets.get_period(*PERIOD).lines
    assert budgets.set_overall_limit(*PERIOD, 1_500_000).overall_limit_minor == 1_500_000
    assert budgets.set_overall_limit(*PERIOD, 1_600_001).overall_limit_minor == 1_600_001
    cleared = budgets.set_overall_limit(*PERIOD, None)
    assert cleared.overall_limit_minor is None
    assert cleared.overall_remaining_minor is None
    assert cleared.overall_used_percent is None
    assert cleared.lines == before


@pytest.mark.parametrize("invalid", [0, -1, 1.5, True, "15000", 9_007_199_254_740_992])
def test_overall_rejects_invalid_minor_units(budgets, invalid):
    with pytest.raises(ValidationError):
        budgets.set_overall_limit(*PERIOD, invalid)
    assert budgets.get_period(*PERIOD).overall_limit_minor is None


@pytest.mark.parametrize("actual,remaining,percent", [
    (0, 100_000, 0.0), (84_200, 15_800, 84.2),
    (100_000, 0, 100.0), (112_400, -12_400, 112.4),
])
def test_remaining_and_true_percentage(budgets, accounts, ledger, actual, remaining, percent):
    bank = make_account(accounts, "Synthetic", "CNY", "50000")
    if actual:
        expense(ledger, bank, actual)
    period = budgets.set_overall_limit(*PERIOD, 100_000)
    assert period.overall_actual_minor == actual
    assert period.overall_remaining_minor == remaining
    assert period.overall_used_percent == percent
    assert period.lines == []


def test_ledger_eligibility_and_period_bounds(budgets, accounts, ledger, assets, session):
    bank = make_account(accounts, "Synthetic bank", "CNY", "50000")
    other = make_account(accounts, "Synthetic wallet", "CNY", "1000")
    expense(ledger, bank, 10_001, category_id(session, "Groceries"), date(2026, 10, 1))
    expense(ledger, bank, 20_002, day=date(2026, 10, 31))  # uncategorised is eligible
    voided = expense(ledger, bank, 90_000)
    ledger.void(voided.id)
    expense(ledger, bank, 80_000, day=date(2026, 9, 30))
    expense(ledger, bank, 70_000, day=date(2026, 11, 1))
    ledger.create_transaction({"type": "income", "account_id": bank.id, "amount_minor": 60_000,
                               "transaction_date": DAY, "description": "Synthetic income"})
    ledger.create_transfer({"from_account_id": bank.id, "to_account_id": other.id,
                            "amount_minor": 50_000, "fee_minor": 100,
                            "transaction_date": DAY})
    asset = assets.purchase({"name": "Synthetic asset", "asset_category_id": assets.categories()[0].id,
                             "purchase_date": DAY, "purchase_price_minor": 40_000,
                             "purchase_currency": "CNY", "payment": {"account_id": bank.id}})
    assets.sell(asset.id, {"sale_date": DAY, "sale_price_minor": 30_000,
                          "sale_currency": "CNY", "destination_account_id": bank.id})
    period = budgets.set_overall_limit(*PERIOD, 100_000)
    # LedgerService records a transfer fee as its own expense; the transfer
    # principal remains excluded. Preserve that existing accounting rule.
    assert period.overall_actual_minor == 30_103


def test_foreign_expense_uses_frozen_base_amount(budgets, accounts, ledger, fx, session):
    bank = make_account(accounts, "Synthetic GBP", "GBP", "1000")
    tx = expense(ledger, bank, 2000, category_id(session, "Coffee"))
    assert tx.base_amount_minor == 19_300
    fx.set_manual_rate("GBP", "CNY", "10", DAY)
    assert budgets.set_overall_limit(*PERIOD, 100_000).overall_actual_minor == 19_300


def test_overlap_never_doubles_overall_and_category_writes_never_change_limit(budgets, accounts, ledger, session):
    bank = make_account(accounts, "Synthetic", "CNY", "50000")
    child = category_id(session, "Groceries")
    expense(ledger, bank, 20_000, child)
    expense(ledger, bank, 30_000)  # outside any category budget
    budgets.set_overall_limit(*PERIOD, 10_000)
    period = budgets.replace_period(*PERIOD, [
        {"category_id": category_id(session, "Food"), "amount_minor": 40_000},
        {"category_id": child, "amount_minor": 30_000},
    ])
    assert [line.actual_minor for line in period.lines] == [20_000, 20_000]
    assert period.total_actual_minor == 40_000  # legacy aggregate unchanged
    assert period.overall_actual_minor == 50_000
    assert period.overall_limit_minor == 10_000  # category sum may exceed overall
    assert budgets.replace_period(*PERIOD, []).overall_limit_minor == 10_000


@pytest.mark.parametrize("overall,categories", [(None, False), (None, True), (100_000, False), (100_000, True)])
def test_dashboard_modes(budgets, dashboard, session, overall, categories):
    if categories:
        budgets.replace_period(*PERIOD, [{"category_id": category_id(session, "Food"), "amount_minor": 400_000}])
    budgets.set_overall_limit(*PERIOD, overall)
    data = dashboard.build(DAY)["budget"]
    assert data["overall_limit_minor"] == overall
    assert data["overall_actual_minor"] == 0
    assert data["overall_remaining_minor"] == overall
    assert data["overall_used_percent"] == (0.0 if overall else None)
    assert len(data["lines"]) == int(categories)


def test_http_set_update_clear_and_legacy_put_are_independent(session):
    with build_client(session) as client:
        path = "/api/v1/budgets/2026/10"
        assert client.get(path).json()["overall_limit_minor"] is None
        entries = [{"category_id": category_id(session, "Food"), "amount_minor": 400_000}]
        assert client.put(path, json={"entries": entries}).status_code == 200
        for limit in (1_500_000, 2_000_000, None):
            response = client.patch(path + "/overall", json={"overall_limit_minor": limit})
            assert response.status_code == 200
            assert response.json()["overall_limit_minor"] == limit
            assert response.json()["lines"][0]["budget_minor"] == 400_000
        client.patch(path + "/overall", json={"overall_limit_minor": 100_000})
        assert client.put(path, json={"entries": []}).json()["overall_limit_minor"] == 100_000


@pytest.mark.parametrize("payload", [{}, {"overall_limit_minor": 0}, {"overall_limit_minor": -1},
                                    {"overall_limit_minor": 0.5}, {"overall_limit_minor": True},
                                    {"overall_limit_minor": "100"}])
def test_http_invalid_budget_rejected(session, payload):
    with build_client(session) as client:
        assert client.patch("/api/v1/budgets/2026/10/overall", json=payload).status_code == 422


@pytest.mark.parametrize("year,month", [(1899, 10), (3000, 10), (2026, 0), (2026, 13)])
def test_http_period_validation(session, year, month):
    with build_client(session) as client:
        assert client.patch(f"/api/v1/budgets/{year}/{month}/overall",
                            json={"overall_limit_minor": 100}).status_code == 422
