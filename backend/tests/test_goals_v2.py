"""Savings Goals 2.0 -- one goal spanning several accounts."""

from __future__ import annotations

from datetime import date

import pytest

from app.core.exceptions import ValidationError
from app.core.money import to_minor
from app.services.goal_service import is_eligible_for_goals
from tests.conftest import category_id, make_account

TODAY = date.today()


def _three_year_goal(goals, account_ids, target="500000.00"):
    return goals.create(
        {
            "name": "三年存够50万",
            "currency": "CNY",
            "target_amount_minor": to_minor(target, "CNY"),
            "deadline": date(TODAY.year + 3, 9, 22),
            "account_ids": account_ids,
        }
    )


# ------------------------------------------------------------- aggregation


def test_goal_aggregates_several_accounts(accounts, goals):
    cmb = make_account(accounts, "招商银行", "CNY", "100000.00", account_type="savings")
    boc = make_account(accounts, "中国银行", "CNY", "80000.00", account_type="savings")
    goal = _three_year_goal(goals, [cmb.id, boc.id])

    progress = goals.progress(goal)
    assert progress.current_amount_minor == to_minor("180000.00", "CNY")
    assert progress.account_count == 2
    assert progress.progress_percent == 36.0
    assert progress.remaining_minor == to_minor("320000.00", "CNY")


def test_goal_converts_multi_currency_accounts(accounts, goals):
    cmb = make_account(accounts, "招商银行", "CNY", "80000.00", account_type="savings")
    boc = make_account(accounts, "中国银行", "CNY", "50000.00", account_type="savings")
    hsbc = make_account(accounts, "HSBC Savings", "GBP", "6200.00", account_type="savings")
    goal = _three_year_goal(goals, [cmb.id, boc.id, hsbc.id])

    progress = goals.progress(goal)
    # 6,200 GBP at the stubbed 9.65 -> 59,830 CNY
    assert progress.current_amount_minor == to_minor("189830.00", "CNY")
    by_name = {item.account_name: item for item in progress.contributions}
    assert by_name["HSBC Savings"].balance_minor == to_minor("6200.00", "GBP")
    assert by_name["HSBC Savings"].converted_minor == to_minor("59830.00", "CNY")
    assert by_name["招商银行"].converted_minor == to_minor("80000.00", "CNY")


def test_contributions_sum_to_the_goal_total(accounts, goals):
    cmb = make_account(accounts, "招商银行", "CNY", "12345.67", account_type="savings")
    monzo = make_account(accounts, "Monzo", "GBP", "987.65", account_type="savings")
    goal = _three_year_goal(goals, [cmb.id, monzo.id])
    progress = goals.progress(goal)
    assert sum(item.converted_minor or 0 for item in progress.contributions) == (
        progress.current_amount_minor
    )


def test_goal_follows_account_movements(accounts, ledger, goals, session):
    cmb = make_account(accounts, "招商银行", "CNY", "100000.00", account_type="savings")
    boc = make_account(accounts, "中国银行", "CNY", "80000.00", account_type="savings")
    goal = _three_year_goal(goals, [cmb.id, boc.id])
    assert goals.progress(goal).current_amount_minor == to_minor("180000.00", "CNY")

    ledger.create_transaction(
        {
            "type": "income",
            "account_id": boc.id,
            "amount_minor": to_minor("20000.00", "CNY"),
            "transaction_date": TODAY,
            "description": "Saving",
            "category_id": category_id(session, "Salary", "income"),
        }
    )
    assert goals.progress(goal).current_amount_minor == to_minor("200000.00", "CNY")


def test_overdrawn_account_contributes_zero(accounts, goals):
    cmb = make_account(accounts, "招商银行", "CNY", "100000.00", account_type="savings")
    overdrawn = make_account(accounts, "Overdrawn", "CNY", "-5000.00")
    goal = _three_year_goal(goals, [cmb.id, overdrawn.id])
    assert goals.progress(goal).current_amount_minor == to_minor("100000.00", "CNY")


# --------------------------------------------------------- sharing accounts


def test_same_account_can_belong_to_several_goals(accounts, goals):
    cmb = make_account(accounts, "招商银行", "CNY", "100000.00", account_type="savings")
    emergency = goals.create(
        {
            "name": "Emergency Fund",
            "currency": "CNY",
            "target_amount_minor": to_minor("200000.00", "CNY"),
            "account_ids": [cmb.id],
        }
    )
    house = goals.create(
        {
            "name": "House Deposit",
            "currency": "CNY",
            "target_amount_minor": to_minor("400000.00", "CNY"),
            "account_ids": [cmb.id],
        }
    )
    assert goals.progress(emergency).current_amount_minor == to_minor("100000.00", "CNY")
    assert goals.progress(house).current_amount_minor == to_minor("100000.00", "CNY")


def test_shared_account_is_flagged(accounts, goals):
    cmb = make_account(accounts, "招商银行", "CNY", "100000.00", account_type="savings")
    goals.create({"name": "Goal A", "currency": "CNY", "account_ids": [cmb.id]})
    goal_b = goals.create({"name": "Goal B", "currency": "CNY", "account_ids": [cmb.id]})
    progress = goals.progress(goal_b)
    assert progress.contributions[0].shared_with_goals == 2


def test_sharing_an_account_creates_no_money(accounts, goals, networth):
    cmb = make_account(accounts, "招商银行", "CNY", "100000.00", account_type="savings")
    before = networth.calculate()
    goals.create({"name": "Goal A", "currency": "CNY", "account_ids": [cmb.id]})
    goals.create({"name": "Goal B", "currency": "CNY", "account_ids": [cmb.id]})
    goals.create({"name": "Goal C", "currency": "CNY", "account_ids": [cmb.id]})
    after = networth.calculate()
    assert after.net_worth_minor == before.net_worth_minor
    assert after.total_assets_minor == before.total_assets_minor
    assert accounts.balance_for(cmb.id).balance_minor == to_minor("100000.00", "CNY")


def test_goals_never_affect_income_or_expense(accounts, goals, dashboard):
    cmb = make_account(accounts, "招商银行", "CNY", "100000.00", account_type="savings")
    goals.create({"name": "Goal A", "currency": "CNY", "account_ids": [cmb.id]})
    data = dashboard.build(TODAY)
    assert data["month_income_minor"] == 0
    assert data["month_expense_minor"] == 0


# ------------------------------------------------------------- eligibility


def test_eligibility_rule(accounts):
    savings = make_account(accounts, "Savings", "CNY", "1000.00", account_type="savings")
    card = make_account(accounts, "Card", "CNY", "-500.00", account_type="credit_card")
    loan = make_account(accounts, "Loan", "CNY", "-500.00", account_type="loan")
    excluded = make_account(
        accounts, "Shared Pot", "CNY", "1000.00", include_in_net_worth=False
    )
    archived = make_account(accounts, "Old", "CNY", "100.00")
    accounts.archive(archived.id)

    assert is_eligible_for_goals(savings) is True
    assert is_eligible_for_goals(card) is False
    assert is_eligible_for_goals(loan) is False
    assert is_eligible_for_goals(excluded) is False
    assert is_eligible_for_goals(accounts.get(archived.id)) is False


def test_all_eligible_mode_picks_up_asset_accounts(accounts, goals):
    make_account(accounts, "招商银行", "CNY", "100000.00", account_type="savings")
    make_account(accounts, "Monzo", "GBP", "1000.00")
    make_account(accounts, "Card", "CNY", "-3000.00", account_type="credit_card")
    make_account(accounts, "Shared Pot", "CNY", "9999.00", include_in_net_worth=False)

    goal = goals.create(
        {
            "name": "Everything",
            "currency": "CNY",
            "target_amount_minor": to_minor("500000.00", "CNY"),
            "selection_mode": "all_eligible",
            "account_ids": [],
        }
    )
    progress = goals.progress(goal)
    names = {item.account_name for item in progress.contributions}
    assert names == {"招商银行", "Monzo"}
    # 100,000 + (1,000 GBP at 9.65 = 9,650)
    assert progress.current_amount_minor == to_minor("109650.00", "CNY")


def test_all_eligible_mode_follows_new_accounts(accounts, goals):
    make_account(accounts, "招商银行", "CNY", "100000.00", account_type="savings")
    goal = goals.create(
        {"name": "Everything", "currency": "CNY", "selection_mode": "all_eligible"}
    )
    assert goals.progress(goal).account_count == 1
    make_account(accounts, "中国银行", "CNY", "50000.00", account_type="savings")
    progress = goals.progress(goal)
    assert progress.account_count == 2
    assert progress.current_amount_minor == to_minor("150000.00", "CNY")


def test_archived_account_leaves_an_all_eligible_goal(accounts, goals):
    keep = make_account(accounts, "招商银行", "CNY", "100000.00", account_type="savings")
    drop = make_account(accounts, "中国银行", "CNY", "50000.00", account_type="savings")
    goal = goals.create(
        {"name": "Everything", "currency": "CNY", "selection_mode": "all_eligible"}
    )
    assert goals.progress(goal).current_amount_minor == to_minor("150000.00", "CNY")
    accounts.archive(drop.id)
    progress = goals.progress(goal)
    assert progress.current_amount_minor == to_minor("100000.00", "CNY")
    assert [item.account_name for item in progress.contributions] == [keep.name]


def test_archived_account_stays_visible_in_a_selected_goal(accounts, goals):
    cmb = make_account(accounts, "招商银行", "CNY", "100000.00", account_type="savings")
    old = make_account(accounts, "Old Savings", "CNY", "20000.00", account_type="savings")
    goal = _three_year_goal(goals, [cmb.id, old.id])
    accounts.archive(old.id)
    progress = goals.progress(goal)
    flagged = next(item for item in progress.contributions if item.account_name == "Old Savings")
    assert flagged.is_eligible is False
    # Explicitly chosen accounts keep counting so the total does not silently move.
    assert progress.current_amount_minor == to_minor("120000.00", "CNY")


def test_liability_account_cannot_be_selected(accounts, goals):
    card = make_account(accounts, "Card", "CNY", "-3000.00", account_type="credit_card")
    with pytest.raises(ValidationError):
        goals.create({"name": "Bad Goal", "currency": "CNY", "account_ids": [card.id]})


# ------------------------------------------------------------------ fx gaps


def test_missing_rate_is_reported_not_guessed(session, fx_empty):
    # Deliberately does not request the `accounts` fixture: that one depends on
    # `fx`, which would populate the cache this test needs to be empty.
    from app.services.account_service import AccountService
    from app.services.goal_service import GoalService

    account_service = AccountService(session, fx_empty)
    cmb = make_account(account_service, "招商银行", "CNY", "100000.00", account_type="savings")
    monzo = make_account(account_service, "Monzo", "GBP", "1000.00", account_type="savings")
    service = GoalService(session, account_service, fx_empty)
    goal = service.create(
        {
            "name": "Mixed",
            "currency": "CNY",
            "target_amount_minor": to_minor("500000.00", "CNY"),
            "account_ids": [cmb.id, monzo.id],
        }
    )
    progress = service.progress(goal)
    assert progress.unconverted_accounts == ["Monzo"]
    assert progress.current_amount_minor == to_minor("100000.00", "CNY")
    assert progress.fx_freshness == "missing"


# ----------------------------------------------------------------- editing


def test_updating_accounts_replaces_the_membership(accounts, goals):
    a = make_account(accounts, "A", "CNY", "1000.00", account_type="savings")
    b = make_account(accounts, "B", "CNY", "2000.00", account_type="savings")
    c = make_account(accounts, "C", "CNY", "4000.00", account_type="savings")
    goal = _three_year_goal(goals, [a.id, b.id])
    assert goals.progress(goal).current_amount_minor == to_minor("3000.00", "CNY")

    goals.update(goal.id, {"account_ids": [b.id, c.id]})
    progress = goals.progress(goals.get(goal.id))
    assert {item.account_name for item in progress.contributions} == {"B", "C"}
    assert progress.current_amount_minor == to_minor("6000.00", "CNY")


def test_switching_to_all_eligible_clears_explicit_links(accounts, goals):
    a = make_account(accounts, "A", "CNY", "1000.00", account_type="savings")
    make_account(accounts, "B", "CNY", "2000.00", account_type="savings")
    goal = _three_year_goal(goals, [a.id])
    goals.update(goal.id, {"selection_mode": "all_eligible"})
    progress = goals.progress(goals.get(goal.id))
    assert progress.account_count == 2
    assert goals.repo.linked_account_ids(goal.id) == []


def test_deleting_a_goal_leaves_accounts_untouched(accounts, goals, networth):
    cmb = make_account(accounts, "招商银行", "CNY", "100000.00", account_type="savings")
    goal = _three_year_goal(goals, [cmb.id])
    before = networth.calculate().net_worth_minor
    goals.delete(goal.id)
    assert accounts.balance_for(cmb.id).balance_minor == to_minor("100000.00", "CNY")
    assert networth.calculate().net_worth_minor == before
