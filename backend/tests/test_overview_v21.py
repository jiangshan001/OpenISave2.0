"""V2.1.x Overview: daily activity heatmap, budget usage, category splits and
the net worth definition as the Overview endpoint reports it."""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.core.exceptions import ValidationError
from app.core.money import to_minor
from app.services.activity_service import ActivityService, intensity_level, window_start
from tests.conftest import category_id, make_account
from tests.test_api_end_to_end import build_client

TODAY = date.today()


def _tx(ledger, kind, account, amount, category, *, on=TODAY, currency="CNY"):
    return ledger.create_transaction(
        {
            "type": kind,
            "account_id": account.id,
            "amount_minor": to_minor(amount, currency),
            "transaction_date": on,
            "description": "test",
            "category_id": category,
        }
    )


def _day(series: dict, on: date) -> dict | None:
    return next((row for row in series["days"] if row["date"] == on.isoformat()), None)


# ------------------------------------------------------------ activity window


def test_window_covers_twelve_calendar_months_ending_today():
    assert window_start(date(2026, 9, 23), 12) == date(2025, 10, 1)
    assert window_start(date(2026, 1, 5), 12) == date(2025, 2, 1)
    assert window_start(date(2026, 9, 23), 1) == date(2026, 9, 1)


def test_intensity_levels_rank_days_into_quartiles():
    active = [100, 200, 300, 400, 100_000]
    assert [intensity_level(amount, active) for amount in active] == [1, 2, 3, 4, 4]
    assert intensity_level(0, active) == 0
    assert intensity_level(500, []) == 0


def test_repeated_amounts_still_reach_the_top_level():
    salaries_and_bonus = sorted([2_500_000] * 12 + [300_000])
    assert intensity_level(2_500_000, salaries_and_bonus) == 4
    assert intensity_level(300_000, salaries_and_bonus) == 1


def test_months_out_of_range_is_rejected(session):
    with pytest.raises(ValidationError):
        ActivityService(session).daily_activity(TODAY, months=0)


# ------------------------------------------------------- activity aggregation


def test_daily_activity_sums_per_day_in_base_currency(accounts, ledger, session):
    cny = make_account(accounts, "招商银行", "CNY", "50000.00")
    gbp = make_account(accounts, "Monzo", "GBP", "2000.00")
    other = make_account(accounts, "中国银行", "CNY", "1000.00")
    groceries = category_id(session, "Groceries")
    salary = category_id(session, "Salary", "income")
    yesterday = TODAY - timedelta(days=1)

    _tx(ledger, "expense", cny, "120.00", groceries)
    _tx(ledger, "expense", cny, "30.00", groceries)
    _tx(ledger, "expense", gbp, "10.00", groceries, currency="GBP")  # 96.50 CNY
    _tx(ledger, "expense", cny, "40.00", groceries, on=yesterday)
    _tx(ledger, "income", cny, "8000.00", salary, on=yesterday)
    voided = _tx(ledger, "expense", cny, "999.00", groceries)
    ledger.void(voided.id)
    ledger.create_transfer(
        {
            "from_account_id": cny.id,
            "to_account_id": other.id,
            "amount_minor": to_minor("500.00", "CNY"),
            "transaction_date": TODAY,
        }
    )

    data = ActivityService(session).daily_activity(TODAY)
    expense = data["series"]["expense"]
    income = data["series"]["income"]

    assert data["base_currency"] == "CNY"
    assert data["start"] == window_start(TODAY, 12).isoformat()
    assert data["end"] == TODAY.isoformat()
    today_row = _day(expense, TODAY)
    assert today_row["amount_minor"] == to_minor("246.50", "CNY")  # 120 + 30 + 96.50
    assert today_row["count"] == 3  # voided row and transfer are excluded
    assert _day(expense, yesterday)["amount_minor"] == to_minor("40.00", "CNY")
    assert expense["total_minor"] == to_minor("286.50", "CNY")
    assert expense["active_days"] == 2
    assert expense["max_minor"] == to_minor("246.50", "CNY")
    assert _day(income, yesterday)["amount_minor"] == to_minor("8000.00", "CNY")
    assert _day(income, TODAY) is None
    assert income["total_minor"] == to_minor("8000.00", "CNY")


def test_daily_activity_ignores_days_before_the_window(accounts, ledger, session):
    account = make_account(accounts, "招商银行", "CNY", "50000.00")
    groceries = category_id(session, "Groceries")
    before_window = window_start(TODAY, 12) - timedelta(days=1)
    _tx(ledger, "expense", account, "75.00", groceries, on=before_window)
    _tx(ledger, "expense", account, "25.00", groceries)

    expense = ActivityService(session).daily_activity(TODAY)["series"]["expense"]
    assert [row["date"] for row in expense["days"]] == [TODAY.isoformat()]
    assert expense["total_minor"] == to_minor("25.00", "CNY")


def test_empty_ledger_gives_empty_series(session):
    data = ActivityService(session).daily_activity(TODAY)
    for kind in ("expense", "income"):
        assert data["series"][kind]["days"] == []
        assert data["series"][kind]["total_minor"] == 0
        assert data["series"][kind]["active_days"] == 0


def test_activity_endpoint_returns_both_series(session):
    client = build_client(session)
    response = client.get("/api/v1/dashboard/activity")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["months"] == 12
    assert set(body["series"]) == {"expense", "income"}
    assert client.get("/api/v1/dashboard/activity?months=0").status_code == 422
    assert client.get("/api/v1/dashboard/activity?months=6").json()["months"] == 6


# --------------------------------------------------------------- budget usage


def test_budget_usage_reports_live_actual_percent_and_remaining(
    accounts, ledger, budgets, dashboard, session
):
    account = make_account(accounts, "招商银行", "CNY", "50000.00")
    food = category_id(session, "Food")
    _tx(ledger, "expense", account, "500.00", category_id(session, "Groceries"))
    _tx(ledger, "expense", account, "180.00", category_id(session, "Restaurants"))
    budgets.replace_period(
        TODAY.year, TODAY.month, [{"category_id": food, "amount_minor": to_minor("1000", "CNY")}]
    )

    budget = dashboard.build(TODAY)["budget"]
    line = next(row for row in budget["lines"] if row["category_id"] == food)
    assert line["budget_minor"] == to_minor("1000.00", "CNY")
    assert line["actual_minor"] == to_minor("680.00", "CNY")
    assert line["used_percent"] == 68.0
    assert line["remaining_minor"] == to_minor("320.00", "CNY")
    assert budget["total_used_percent"] == 68.0


def test_budget_usage_lists_every_active_line_and_handles_overspend(
    accounts, ledger, budgets, dashboard, session
):
    account = make_account(accounts, "招商银行", "CNY", "50000.00")
    names = ["Rent", "Utilities", "Groceries", "Restaurants", "Coffee", "Taxi", "Fuel"]
    budgets.replace_period(
        TODAY.year,
        TODAY.month,
        [
            {"category_id": category_id(session, name), "amount_minor": to_minor("100", "CNY")}
            for name in names
        ],
    )
    _tx(ledger, "expense", account, "150.00", category_id(session, "Coffee"))

    budget = dashboard.build(TODAY)["budget"]
    assert len(budget["lines"]) == len(names)
    coffee = next(row for row in budget["lines"] if row["category_name"] == "Coffee")
    assert coffee["used_percent"] == 150.0
    assert coffee["remaining_minor"] == -to_minor("50.00", "CNY")


def test_budget_usage_without_budget_has_no_percent(dashboard):
    budget = dashboard.build(TODAY)["budget"]
    assert budget["lines"] == []
    assert budget["total_used_percent"] is None


# ---------------------------------------------------------- category splits


def test_dashboard_splits_income_and_expense_by_category(accounts, ledger, dashboard, session):
    account = make_account(accounts, "招商银行", "CNY", "50000.00")
    _tx(ledger, "income", account, "9000.00", category_id(session, "Salary", "income"))
    _tx(ledger, "income", account, "1000.00", category_id(session, "Bonus", "income"))
    _tx(ledger, "expense", account, "300.00", category_id(session, "Groceries"))

    data = dashboard.build(TODAY)
    income = {row["category_name"]: row["amount_minor"] for row in data["income_by_category"]}
    expense = {row["category_name"]: row["amount_minor"] for row in data["expense_by_category"]}
    assert income == {"Salary": to_minor("9000.00", "CNY"), "Bonus": to_minor("1000.00", "CNY")}
    assert data["income_by_category"][0]["category_name"] == "Salary"
    assert expense == {"Groceries": to_minor("300.00", "CNY")}


def test_dashboard_without_income_returns_empty_income_split(dashboard):
    assert dashboard.build(TODAY)["income_by_category"] == []


# ------------------------------------------------------------ net worth scope


def _asset_category(assets, name: str) -> int:
    return next(row.id for row in assets.categories() if row.name == name)


def _buy(assets, name, category, price):
    return assets.purchase(
        {
            "name": name,
            "asset_category_id": _asset_category(assets, category),
            "purchase_date": TODAY,
            "purchase_price_minor": to_minor(price, "CNY"),
            "purchase_currency": "CNY",
        }
    )


def test_overview_net_worth_counts_stores_of_wealth_only(accounts, assets, dashboard):
    make_account(accounts, "Cash", "CNY", "2000.00", account_type="cash")
    make_account(accounts, "招商银行", "CNY", "30000.00", account_type="bank")
    make_account(accounts, "Savings", "CNY", "50000.00", account_type="savings")
    make_account(accounts, "Fund", "CNY", "10000.00", account_type="investment")
    make_account(accounts, "公积金", "CNY", "40000.00", account_type="provident_fund")
    _buy(assets, "Flat", "Property", "500000.00")
    _buy(assets, "MacBook", "Electronics", "18000.00")
    _buy(assets, "Car", "Vehicle", "150000.00")
    _buy(assets, "Sofa", "Furniture", "6000.00")

    data = dashboard.build(TODAY)
    included = to_minor("632000.00", "CNY")  # 2k + 30k + 50k + 10k + 40k + 500k
    assert data["net_worth_assets_minor"] == included
    assert data["total_assets_minor"] == included
    assert data["net_worth_minor"] == included
    assert data["physical_assets_minor"] == to_minor("500000.00", "CNY")
    assert data["groups"]["physical_assets"] == to_minor("500000.00", "CNY")
    assert data["groups"]["cash"] == to_minor("32000.00", "CNY")
    assert data["groups"]["savings"] == to_minor("50000.00", "CNY")
    assert data["personal_possessions_minor"] == to_minor("174000.00", "CNY")
    # The group breakdown adds up to net worth: possessions are nowhere in it.
    assert sum(data["groups"].values()) == data["net_worth_minor"]
