from __future__ import annotations

from datetime import date

import pytest

from app.core.exceptions import ValidationError
from app.core.money import to_minor
from tests.conftest import category_id, make_account

TODAY = date.today()


def _expense(ledger, account, amount, category, currency="CNY", on=TODAY):
    return ledger.create_transaction(
        {
            "type": "expense",
            "account_id": account.id,
            "amount_minor": to_minor(amount, currency),
            "transaction_date": on,
            "description": "test",
            "category_id": category,
        }
    )


# ---------------------------------------------------------------------- budget


def test_budget_actual_is_derived_from_the_ledger(accounts, ledger, budgets, session):
    account = make_account(accounts, "招商银行", "CNY", "20000.00")
    food = category_id(session, "Food")
    _expense(ledger, account, "2860.00", category_id(session, "Restaurants"))

    period = budgets.replace_period(
        TODAY.year, TODAY.month, [{"category_id": food, "amount_minor": to_minor("3500.00", "CNY")}]
    )
    line = period.lines[0]
    assert line.budget_minor == to_minor("3500.00", "CNY")
    assert line.actual_minor == to_minor("2860.00", "CNY")
    assert line.remaining_minor == to_minor("640.00", "CNY")
    assert line.used_percent == 81.7


def test_budget_on_a_parent_absorbs_child_spending(accounts, ledger, budgets, session):
    account = make_account(accounts, "招商银行", "CNY", "20000.00")
    _expense(ledger, account, "100.00", category_id(session, "Groceries"))
    _expense(ledger, account, "50.00", category_id(session, "Coffee"))
    period = budgets.replace_period(
        TODAY.year,
        TODAY.month,
        [{"category_id": category_id(session, "Food"), "amount_minor": to_minor("500.00", "CNY")}],
    )
    assert period.lines[0].actual_minor == to_minor("150.00", "CNY")


def test_budget_ignores_spending_from_another_month(accounts, ledger, budgets, session):
    account = make_account(accounts, "招商银行", "CNY", "50000.00")
    other_month = date(2000, 1, 15)
    _expense(ledger, account, "999.00", category_id(session, "Groceries"), on=other_month)
    period = budgets.replace_period(
        TODAY.year,
        TODAY.month,
        [{"category_id": category_id(session, "Food"), "amount_minor": to_minor("500.00", "CNY")}],
    )
    assert period.lines[0].actual_minor == 0


def test_foreign_expense_counts_towards_the_cny_budget(accounts, ledger, budgets, session):
    monzo = make_account(accounts, "Monzo", "GBP", "2000.00")
    _expense(ledger, monzo, "20.00", category_id(session, "Groceries"), currency="GBP")
    period = budgets.replace_period(
        TODAY.year,
        TODAY.month,
        [{"category_id": category_id(session, "Food"), "amount_minor": to_minor("3000.00", "CNY")}],
    )
    # 20 GBP at 9.65 -> 193 CNY
    assert period.lines[0].actual_minor == to_minor("193.00", "CNY")


def test_budget_rejects_an_income_category(budgets, session):
    with pytest.raises(ValidationError):
        budgets.replace_period(
            TODAY.year,
            TODAY.month,
            [{"category_id": category_id(session, "Salary", "income"), "amount_minor": 1000}],
        )


# ----------------------------------------------------------------------- goals


def test_goal_progress_tracks_the_linked_account(accounts, goals):
    boc = make_account(accounts, "中国银行", "CNY", "35000.00")
    goal = goals.create(
        {
            "name": "Emergency Fund",
            "currency": "CNY",
            "target_amount_minor": to_minor("100000.00", "CNY"),
            "account_ids": [boc.id],
        }
    )
    progress = goals.progress(goal)
    assert progress.current_amount_minor == to_minor("35000.00", "CNY")
    assert progress.progress_percent == 35.0
    assert progress.remaining_minor == to_minor("65000.00", "CNY")
    assert [item.account_name for item in progress.contributions] == ["中国银行"]


def test_goal_progress_follows_new_transactions(accounts, ledger, goals, session):
    boc = make_account(accounts, "中国银行", "CNY", "35000.00")
    goal = goals.create(
        {
            "name": "Emergency Fund",
            "currency": "CNY",
            "target_amount_minor": to_minor("100000.00", "CNY"),
            "account_ids": [boc.id],
        }
    )
    ledger.create_transaction(
        {
            "type": "income",
            "account_id": boc.id,
            "amount_minor": to_minor("15000.00", "CNY"),
            "transaction_date": TODAY,
            "description": "Saving",
            "category_id": category_id(session, "Salary", "income"),
        }
    )
    assert goals.progress(goal).progress_percent == 50.0


def test_goal_without_a_target_reports_accumulation_only(accounts, goals):
    account = make_account(accounts, "HSBC Savings", "GBP", "1000.00")
    goal = goals.create(
        {"name": "General Savings", "currency": "GBP", "account_ids": [account.id]}
    )
    progress = goals.progress(goal)
    assert progress.current_amount_minor == to_minor("1000.00", "GBP")
    assert progress.progress_percent is None
    assert progress.remaining_minor is None


def test_goal_converts_a_foreign_linked_account(accounts, goals):
    monzo = make_account(accounts, "Monzo", "GBP", "1000.00")
    goal = goals.create(
        {
            "name": "Travel",
            "currency": "CNY",
            "target_amount_minor": to_minor("20000.00", "CNY"),
            "account_ids": [monzo.id],
        }
    )
    assert goals.progress(goal).current_amount_minor == to_minor("9650.00", "CNY")


def test_goal_does_not_change_net_worth(accounts, goals, networth):
    boc = make_account(accounts, "中国银行", "CNY", "50000.00")
    before = networth.calculate().net_worth_minor
    goals.create(
        {
            "name": "Emergency Fund",
            "currency": "CNY",
            "target_amount_minor": to_minor("100000.00", "CNY"),
            "account_ids": [boc.id],
        }
    )
    assert networth.calculate().net_worth_minor == before


# ------------------------------------------------------------------- dashboard


def test_dashboard_totals_assets_liabilities_and_net_worth(accounts, dashboard):
    make_account(accounts, "招商银行", "CNY", "20000.00")
    make_account(accounts, "Monzo", "GBP", "2000.00")
    make_account(accounts, "Credit Card", "CNY", "-3000.00", account_type="credit_card")
    data = dashboard.build(TODAY)
    assert data["total_assets_minor"] == to_minor("39300.00", "CNY")  # 20000 + 19300
    assert data["total_liabilities_minor"] == to_minor("3000.00", "CNY")
    assert data["net_worth_minor"] == to_minor("36300.00", "CNY")


def test_dashboard_reports_monthly_cash_flow(accounts, ledger, dashboard, session):
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
    _expense(ledger, account, "200.00", category_id(session, "Restaurants"))
    data = dashboard.build(TODAY)
    assert data["month_income_minor"] == to_minor("10000.00", "CNY")
    assert data["month_expense_minor"] == to_minor("200.00", "CNY")
    assert data["net_cash_flow_minor"] == to_minor("9800.00", "CNY")
    assert data["savings_rate_percent"] == 98.0


def test_account_excluded_from_net_worth_is_not_counted(accounts, networth):
    make_account(accounts, "招商银行", "CNY", "20000.00")
    make_account(accounts, "Shared Pot", "CNY", "5000.00", include_in_net_worth=False)
    assert networth.calculate().net_worth_minor == to_minor("20000.00", "CNY")


# ----------------------------------------------------------------------- report


def test_monthly_report_shows_account_movement(accounts, ledger, reports, session):
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
    _expense(ledger, account, "200.00", category_id(session, "Restaurants"))

    report = reports.monthly(TODAY.year, TODAY.month)
    assert report["summary"]["income_minor"] == to_minor("10000.00", "CNY")
    assert report["summary"]["expense_minor"] == to_minor("200.00", "CNY")
    movement = next(
        row for row in report["account_movement"] if row["account_name"] == "招商银行"
    )
    assert movement["opening_balance_minor"] == to_minor("20000.00", "CNY")
    assert movement["deposits_minor"] == to_minor("10000.00", "CNY")
    assert movement["withdrawals_minor"] == to_minor("200.00", "CNY")
    assert movement["closing_balance_minor"] == to_minor("29800.00", "CNY")


def test_monthly_report_expense_breakdown(accounts, ledger, reports, session):
    account = make_account(accounts, "招商银行", "CNY", "20000.00")
    _expense(ledger, account, "300.00", category_id(session, "Groceries"))
    _expense(ledger, account, "100.00", category_id(session, "Coffee"))
    report = reports.monthly(TODAY.year, TODAY.month)
    amounts = {row["category_name"]: row["amount_minor"] for row in report["expense_by_category"]}
    assert amounts["Groceries"] == to_minor("300.00", "CNY")
    assert amounts["Coffee"] == to_minor("100.00", "CNY")
