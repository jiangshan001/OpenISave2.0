"""Provident-fund income works with new and existing ledgers."""

from datetime import date

import pytest
from sqlalchemy import select

from app.core.money import to_minor
from app.db.seed import seed_all
from app.models.category import Category
from tests.conftest import category_id, make_account


TODAY = date.today()


def remove_new_default(session):
    """Recreate the category state of a ledger from before this release."""
    category = session.scalar(
        select(Category).where(Category.kind == "income", Category.name == "Provident Fund")
    )
    session.delete(category)
    session.flush()


def test_existing_ledger_preserves_salary_and_adds_provident_income(
    session, accounts, ledger, dashboard
):
    remove_new_default(session)
    bank = make_account(accounts, "Salary bank", "CNY", "0.00")
    fund = make_account(accounts, "Housing fund", "CNY", "0.00", account_type="provident_fund")
    salary_id = category_id(session, "Salary", "income")
    salary = ledger.create_transaction({
        "type": "income", "account_id": bank.id, "amount_minor": to_minor("8000", "CNY"),
        "transaction_date": TODAY, "category_id": salary_id, "description": "Net salary",
    })

    seed_all(session)
    seed_all(session)
    matches = list(session.scalars(select(Category).where(
        Category.kind == "income", Category.name == "Provident Fund"
    )))
    assert len(matches) == 1
    assert matches[0].is_active
    assert ledger.get(salary.id).category_id == salary_id
    assert accounts.balance_for(bank.id).balance_minor == to_minor("8000", "CNY")

    ledger.create_transaction({
        "type": "income", "account_id": fund.id, "amount_minor": to_minor("2000", "CNY"),
        "transaction_date": TODAY, "category_id": matches[0].id,
        "description": "Employee and employer contributions",
    })
    overview = dashboard.build(TODAY)
    assert accounts.balance_for(fund.id).balance_minor == to_minor("2000", "CNY")
    assert overview["month_income_minor"] == to_minor("10000", "CNY")
    assert overview["net_worth_minor"] == to_minor("10000", "CNY")
    breakdown = {row["category_name"]: row["amount_minor"] for row in overview["income_by_category"]}
    assert breakdown["Salary"] == to_minor("8000", "CNY")
    assert breakdown["Provident Fund"] == to_minor("2000", "CNY")


@pytest.mark.parametrize(("name", "nested", "active"), [
    ("Provident Fund", False, True),
    ("provident fund", False, True),
    ("住房公积金", False, True),
    ("公积金", True, True),
    ("公积金", False, False),
])
def test_existing_equivalent_category_is_not_duplicated_or_changed(
    session, accounts, ledger, name, nested, active
):
    remove_new_default(session)
    parent_id = category_id(session, "Salary", "income") if nested else None
    existing = Category(name=name, kind="income", parent_id=parent_id, is_active=active)
    session.add(existing)
    session.flush()
    fund = make_account(accounts, "Fund", "CNY", "0.00", account_type="provident_fund")
    transaction = ledger.create_transaction({
        "type": "income", "account_id": fund.id, "amount_minor": to_minor("2000", "CNY"),
        "transaction_date": TODAY, "category_id": existing.id, "description": "Previous entry",
    })

    seed_all(session)
    seed_all(session)
    rows = list(session.scalars(select(Category).where(Category.kind == "income")))
    matching = [row for row in rows if row.name.casefold() in {
        "provident fund", "housing provident fund", "公积金", "住房公积金"
    }]
    assert [row.id for row in matching] == [existing.id]
    assert existing.name == name and existing.parent_id == parent_id and existing.is_active is active
    assert ledger.get(transaction.id).category_id == existing.id
    assert accounts.balance_for(fund.id).balance_minor == to_minor("2000", "CNY")
