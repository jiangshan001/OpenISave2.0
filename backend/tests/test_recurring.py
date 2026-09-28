"""Recurring transactions: schedule maths, lifecycle and idempotent generation."""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import func, select

from app.core.enums import RecurringFrequency as F
from app.core.exceptions import ConflictError, ValidationError
from app.core.money import to_minor
from app.models.recurring import RecurringOccurrence
from app.models.transaction import Transaction
from app.services import recurrence
from app.services.recurring_service import RecurringService
from tests.conftest import category_id, make_account
from tests.test_api_end_to_end import build_client


def sched(freq, start, interval=1, end=None, day=None):
    return recurrence.Schedule(F(freq), interval, start, end, day)


def dates(schedule, start, end):
    return list(recurrence.occurrences(schedule, start, end))


# ------------------------------------------------------------ schedule maths


def test_monthly_on_the_first_and_28th():
    first = sched("monthly", date(2026, 1, 1))
    assert dates(first, date(2026, 1, 1), date(2026, 4, 30)) == [
        date(2026, 1, 1), date(2026, 2, 1), date(2026, 3, 1), date(2026, 4, 1)
    ]
    salary = sched("monthly", date(2026, 1, 28))
    assert dates(salary, date(2026, 1, 1), date(2026, 3, 31)) == [
        date(2026, 1, 28), date(2026, 2, 28), date(2026, 3, 28)
    ]


def test_31st_clamps_to_short_months_and_never_drifts():
    rule = sched("monthly", date(2026, 1, 31))
    assert dates(rule, date(2026, 1, 1), date(2026, 5, 31)) == [
        date(2026, 1, 31), date(2026, 2, 28), date(2026, 3, 31), date(2026, 4, 30), date(2026, 5, 31)
    ]


def test_month_end_via_day_31_and_leap_february():
    month_end = sched("monthly", date(2028, 1, 15), day=31)
    assert dates(month_end, date(2028, 1, 1), date(2028, 4, 30)) == [
        date(2028, 1, 31), date(2028, 2, 29), date(2028, 3, 31), date(2028, 4, 30)
    ]


def test_day_of_month_before_start_day_begins_next_month():
    rent = sched("monthly", date(2026, 9, 20), day=11)
    assert recurrence.first_on_or_after(rent, date(2026, 9, 1)) == date(2026, 10, 11)


def test_every_two_months_and_every_two_weeks():
    bimonthly = sched("monthly", date(2026, 1, 30), interval=2)
    assert dates(bimonthly, date(2026, 1, 1), date(2026, 7, 31)) == [
        date(2026, 1, 30), date(2026, 3, 30), date(2026, 5, 30), date(2026, 7, 30)
    ]
    fortnightly = sched("weekly", date(2026, 9, 4), interval=2)
    assert dates(fortnightly, date(2026, 9, 1), date(2026, 10, 10)) == [
        date(2026, 9, 4), date(2026, 9, 18), date(2026, 10, 2)
    ]


def test_yearly_and_leap_day():
    insurance = sched("yearly", date(2026, 3, 15))
    assert dates(insurance, date(2026, 1, 1), date(2028, 12, 31)) == [
        date(2026, 3, 15), date(2027, 3, 15), date(2028, 3, 15)
    ]
    leap = sched("yearly", date(2028, 2, 29))
    assert dates(leap, date(2028, 1, 1), date(2032, 12, 31)) == [
        date(2028, 2, 29), date(2029, 2, 28), date(2030, 2, 28), date(2031, 2, 28), date(2032, 2, 29)
    ]


def test_end_date_stops_the_schedule():
    rule = sched("monthly", date(2026, 1, 10), end=date(2026, 3, 10))
    assert dates(rule, date(2026, 1, 1), date(2026, 12, 31)) == [
        date(2026, 1, 10), date(2026, 2, 10), date(2026, 3, 10)
    ]
    assert recurrence.first_after(rule, date(2026, 3, 10)) is None


def test_far_future_lookup_is_direct():
    rule = sched("weekly", date(2000, 1, 3))
    assert recurrence.first_on_or_after(rule, date(2026, 9, 26)) == date(2026, 9, 28)
    assert recurrence.is_occurrence(rule, date(2026, 9, 28))
    assert not recurrence.is_occurrence(rule, date(2026, 9, 27))


def test_invalid_schedules_are_rejected():
    with pytest.raises(ValueError):
        sched("monthly", date(2026, 1, 1), interval=0)
    with pytest.raises(ValueError):
        sched("monthly", date(2026, 1, 1), end=date(2025, 1, 1))


# ------------------------------------------------------------------ service


@pytest.fixture()
def recurring(session, ledger) -> RecurringService:
    return RecurringService(session, ledger)


@pytest.fixture()
def bank(accounts):
    return make_account(accounts, "HSBC Current", "CNY", "10000.00")


def _rule(recurring, account, **overrides):
    payload = {
        "name": "Rent",
        "transaction_type": "expense",
        "account_id": account.id,
        "amount_minor": to_minor("2100.00", "CNY"),
        "frequency": "monthly",
        "interval": 1,
        "start_date": date(2026, 1, 11),
    }
    payload.update(overrides)
    return recurring.create(payload)


def _tx_count(session, rule_id=None):
    stmt = select(func.count(Transaction.id)).where(Transaction.is_voided.is_(False))
    if rule_id is not None:
        stmt = stmt.where(Transaction.recurring_rule_id == rule_id)
    return session.scalar(stmt)


def test_new_rule_defaults_to_review_and_nothing_is_written(recurring, bank, session):
    rule = _rule(recurring, bank)
    assert rule.mode == "review"
    assert rule.next_run_date == date(2026, 1, 11)
    assert rule.day_of_month == 11
    assert _tx_count(session) == 0


def test_monthly_expense_generates_through_the_ledger(recurring, bank, accounts, session):
    rent = category_id(session, "Rent")
    rule = _rule(recurring, bank, category_id=rent)
    occurrence = recurring.generate(rule.id, date(2026, 1, 11), today=date(2026, 1, 20))
    tx = session.get(Transaction, occurrence.transaction_id)
    assert tx.type == "expense" and tx.category_id == rent
    assert tx.transaction_date == date(2026, 1, 11)
    assert tx.recurring_rule_id == rule.id
    assert sum(p.base_amount_minor for p in tx.postings) == 0
    assert accounts.balance_minor(bank) == to_minor("7900.00", "CNY")
    assert rule.next_run_date == date(2026, 2, 11)
    assert rule.last_generated_at is not None


def test_monthly_income(recurring, bank, accounts, session):
    salary = category_id(session, "Salary", "income")
    rule = _rule(
        recurring, bank, name="Salary", transaction_type="income", category_id=salary,
        amount_minor=to_minor("30000.00", "CNY"), start_date=date(2026, 1, 28),
    )
    recurring.generate(rule.id, date(2026, 1, 28), today=date(2026, 1, 28))
    assert accounts.balance_minor(bank) == to_minor("40000.00", "CNY")


def test_transfer_is_not_income_or_expense(recurring, bank, accounts, session, reports):
    savings = make_account(accounts, "Savings", "CNY", "0.00", account_type="savings")
    rule = _rule(
        recurring, bank, name="Save", transaction_type="transfer",
        destination_account_id=savings.id, amount_minor=to_minor("500.00", "CNY"),
    )
    occ = recurring.generate(rule.id, date(2026, 1, 11), today=date(2026, 1, 11))
    tx = session.get(Transaction, occ.transaction_id)
    assert tx.type == "transfer" and tx.category_id is None
    assert accounts.balance_minor(savings) == to_minor("500.00", "CNY")
    summary = reports.monthly(2026, 1)["summary"]
    assert summary["income_minor"] == 0 and summary["expense_minor"] == 0


def test_cross_currency_rule_freezes_fx_on_the_occurrence_date(recurring, accounts, session):
    gbp = make_account(accounts, "Monzo", "GBP", "1000.00")
    rule = _rule(recurring, gbp, name="Netflix", amount_minor=to_minor("10.99", "GBP"))
    occ = recurring.generate(rule.id, date(2026, 1, 11), today=date(2026, 1, 11))
    tx = session.get(Transaction, occ.transaction_id)
    assert tx.currency == "GBP" and tx.fx_source != "identity"
    assert tx.base_amount_minor == to_minor("106.05", "CNY")  # 10.99 x 9.65


def test_transfer_rule_validation(recurring, bank):
    with pytest.raises(ValidationError):
        _rule(recurring, bank, transaction_type="transfer")
    with pytest.raises(ValidationError):
        _rule(recurring, bank, transaction_type="transfer", destination_account_id=bank.id)


def test_category_kind_and_archived_category_rejected(recurring, bank, session, categories):
    with pytest.raises(ValidationError):
        _rule(recurring, bank, category_id=category_id(session, "Salary", "income"))
    coffee = category_id(session, "Coffee")
    categories.archive(coffee, True)
    with pytest.raises(ValidationError):
        _rule(recurring, bank, category_id=coffee)


def test_generation_is_idempotent(recurring, bank, session):
    rule = _rule(recurring, bank)
    first = recurring.generate(rule.id, date(2026, 1, 11), today=date(2026, 1, 11))
    again = recurring.generate(rule.id, date(2026, 1, 11), today=date(2026, 1, 11))
    assert again.id == first.id and again.transaction_id == first.transaction_id
    assert _tx_count(session, rule.id) == 1


def test_database_constraint_blocks_a_racing_duplicate(recurring, bank, session):
    """Bypass the service's own check to prove the UNIQUE key is the real guard."""
    rule = _rule(recurring, bank)
    first = recurring.generate(rule.id, date(2026, 1, 11), today=date(2026, 1, 11))
    from app.core.enums import OccurrenceStatus

    rule.next_run_date = date(2026, 1, 11)  # pretend a stale cursor, as after a crash
    result = recurring._record(rule, date(2026, 1, 11), OccurrenceStatus.GENERATED)
    assert result.id == first.id
    assert _tx_count(session, rule.id) == 1
    assert session.scalar(select(func.count(RecurringOccurrence.id))) == 1


def test_failure_mid_generation_leaves_nothing_behind(recurring, bank, session, monkeypatch):
    rule = _rule(recurring, bank)

    def boom(*_args, **_kwargs):
        raise RuntimeError("crash after the ledger write")

    monkeypatch.setattr(recurring, "_recompute_cursor", boom)
    with pytest.raises(RuntimeError):
        recurring.generate(rule.id, date(2026, 1, 11), today=date(2026, 1, 11))
    monkeypatch.undo()
    assert _tx_count(session) == 0
    assert session.scalar(select(func.count(RecurringOccurrence.id))) == 0
    recurring.generate(rule.id, date(2026, 1, 11), today=date(2026, 1, 11))
    assert _tx_count(session) == 1


def test_void_does_not_regenerate(recurring, bank, ledger, session):
    rule = _rule(recurring, bank, mode="automatic")
    occ = recurring.generate(rule.id, date(2026, 1, 11), today=date(2026, 1, 11))
    ledger.void(occ.transaction_id)
    result = recurring.process_due(date(2026, 1, 20))
    assert result.generated == []
    assert _tx_count(session) == 0


def test_review_first_lists_due_and_skip_advances(recurring, bank, session):
    rule = _rule(recurring, bank)
    assert recurring.due_dates(rule, date(2026, 3, 12)) == [
        date(2026, 1, 11), date(2026, 2, 11), date(2026, 3, 11)
    ]
    assert recurring.process_due(date(2026, 3, 12)).generated == []  # review rules wait
    recurring.skip(rule.id, date(2026, 1, 11), today=date(2026, 3, 12))
    recurring.generate(rule.id, date(2026, 2, 11), today=date(2026, 3, 12))
    assert recurring.due_dates(rule, date(2026, 3, 12)) == [date(2026, 3, 11)]
    assert _tx_count(session) == 1


def test_out_of_order_confirmation_keeps_earlier_due(recurring, bank):
    rule = _rule(recurring, bank)
    recurring.generate(rule.id, date(2026, 2, 11), today=date(2026, 2, 20))
    assert rule.next_run_date == date(2026, 1, 11)
    assert recurring.due_dates(rule, date(2026, 2, 20)) == [date(2026, 1, 11)]


def test_cannot_generate_future_or_unscheduled_dates(recurring, bank):
    rule = _rule(recurring, bank)
    with pytest.raises(ValidationError):
        recurring.generate(rule.id, date(2026, 2, 11), today=date(2026, 2, 10))
    with pytest.raises(ValidationError):
        recurring.generate(rule.id, date(2026, 1, 12), today=date(2026, 2, 10))


def test_automatic_generates_all_due_once(recurring, bank, session):
    rule = _rule(recurring, bank, mode="automatic")
    first = recurring.process_due(date(2026, 3, 15))
    assert [d for _, d, _ in first.generated] == [
        date(2026, 1, 11), date(2026, 2, 11), date(2026, 3, 11)
    ]
    second = recurring.process_due(date(2026, 3, 15))  # restart / trigger twice
    assert second.generated == []
    assert _tx_count(session, rule.id) == 3
    assert rule.next_run_date == date(2026, 4, 11)


def test_automatic_failure_stops_that_rule_only(recurring, bank, accounts, session):
    ok = _rule(recurring, bank, name="OK", mode="automatic")
    other = make_account(accounts, "Other", "CNY", "0.00")
    broken = _rule(recurring, other, name="Broken", mode="automatic")
    accounts.archive(other.id, True)
    result = recurring.process_due(date(2026, 1, 11))
    assert [r for r, _, _ in result.generated] == [ok.id]
    assert [r for r, _, _ in result.failed] == [broken.id]
    assert "no longer active" in result.failed[0][2]


def test_pause_resume_skips_the_paused_period(recurring, bank, session):
    rule = _rule(recurring, bank, mode="automatic")
    recurring.process_due(date(2026, 1, 11))
    recurring.pause(rule.id)
    assert recurring.process_due(date(2026, 4, 1)).generated == []
    assert recurring.due_dates(rule, date(2026, 4, 1)) == []
    with pytest.raises(ConflictError):
        recurring.generate(rule.id, date(2026, 2, 11), today=date(2026, 4, 1))
    recurring.resume(rule.id, today=date(2026, 4, 1))
    assert rule.next_run_date == date(2026, 4, 11)
    recurring.process_due(date(2026, 4, 11))
    assert _tx_count(session, rule.id) == 2


def test_end_date_completes_the_rule(recurring, bank, session):
    rule = _rule(recurring, bank, mode="automatic", end_date=date(2026, 2, 28))
    recurring.process_due(date(2026, 12, 31))
    assert _tx_count(session, rule.id) == 2
    assert rule.next_run_date is None


def test_archive_stops_generation_but_keeps_history(recurring, bank, session):
    rule = _rule(recurring, bank, mode="automatic")
    recurring.process_due(date(2026, 1, 11))
    recurring.archive(rule.id)
    assert recurring.process_due(date(2026, 6, 1)).generated == []
    assert rule not in recurring.list()
    assert _tx_count(session, rule.id) == 1
    with pytest.raises(ConflictError):
        recurring.update(rule.id, {"amount_minor": 1})


def test_editing_the_schedule_moves_the_cursor(recurring, bank):
    rule = _rule(recurring, bank)
    recurring.generate(rule.id, date(2026, 1, 11), today=date(2026, 1, 11))
    recurring.update(rule.id, {"day_of_month": 25})
    assert rule.next_run_date == date(2026, 1, 25)
    recurring.update(rule.id, {"amount_minor": to_minor("2200.00", "CNY")})
    assert rule.next_run_date == date(2026, 1, 25)


def test_generated_transactions_reach_reports_and_budget(
    recurring, bank, session, budgets, reports
):
    rent = category_id(session, "Rent")
    housing = category_id(session, "Housing")
    salary = category_id(session, "Salary", "income")
    today = date.today()
    start = date(today.year, today.month, 1)
    _rule(recurring, bank, category_id=rent, start_date=start, mode="automatic")
    _rule(
        recurring, bank, name="Salary", transaction_type="income", category_id=salary,
        amount_minor=to_minor("30000.00", "CNY"), start_date=start, mode="automatic",
    )
    budgets.replace_period(
        today.year, today.month, [{"category_id": housing, "amount_minor": to_minor("3000", "CNY")}]
    )
    recurring.process_due(today)
    report = reports.monthly(today.year, today.month)
    assert report["summary"]["expense_minor"] == to_minor("2100.00", "CNY")
    assert report["summary"]["income_minor"] == to_minor("30000.00", "CNY")
    assert report["budget"]["total_actual_minor"] == to_minor("2100.00", "CNY")
    rows = {row["category_name"]: row["amount_minor"] for row in report["expense_by_category"]}
    assert rows == {"Rent": to_minor("2100.00", "CNY")}


def test_upcoming_lists_due_and_next_days(recurring, bank):
    _rule(recurring, bank, name="Rent", start_date=date(2026, 1, 11))
    _rule(recurring, bank, name="Broadband", day_of_month=30, start_date=date(2026, 1, 30))
    items = recurring.upcoming(date(2026, 1, 20), days=14)
    assert [(i.rule.name, i.occurrence_date, i.is_due) for i in items] == [
        ("Rent", date(2026, 1, 11), True),
        ("Broadband", date(2026, 1, 30), False),
    ]
    assert items[1].days_until == 10


# --------------------------------------------------------------------- HTTP


def test_recurring_api_round_trip(session):
    client = build_client(session)
    client.post("/api/v1/fx/refresh")
    account = client.post(
        "/api/v1/accounts",
        json={"name": "Bank", "account_type": "bank", "currency": "CNY", "opening_balance_minor": 0},
    ).json()
    today = date.today()
    created = client.post(
        "/api/v1/recurring",
        json={
            "name": "Broadband", "transaction_type": "expense", "account_id": account["id"],
            "amount_minor": 2500, "frequency": "monthly", "start_date": today.isoformat(),
        },
    )
    assert created.status_code == 201, created.text
    rule = created.json()
    assert rule["mode"] == "review" and rule["due_count"] == 1

    upcoming = client.get("/api/v1/recurring/upcoming").json()
    assert upcoming[0]["is_due"] and upcoming[0]["days_until"] == 0

    url = f"/api/v1/recurring/{rule['id']}/occurrences/{today.isoformat()}/generate"
    first = client.post(url).json()
    second = client.post(url).json()
    assert first["transaction_id"] == second["transaction_id"]
    tx = client.get(f"/api/v1/transactions/{first['transaction_id']}").json()
    assert tx["recurring_rule_id"] == rule["id"]

    assert client.post(f"/api/v1/recurring/{rule['id']}/pause").json()["status"] == "paused"
    assert client.post(f"/api/v1/recurring/{rule['id']}/resume").json()["status"] == "active"
    bad = client.post(f"/api/v1/recurring/{rule['id']}/resume")
    assert bad.status_code == 409
    assert client.post("/api/v1/recurring/process-due").json()["generated"] == []
    assert client.post(f"/api/v1/recurring/{rule['id']}/archive").json()["status"] == "archived"
    assert client.get("/api/v1/recurring").json() == []
