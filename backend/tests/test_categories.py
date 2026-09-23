"""Category management: hierarchy, archiving and history safety."""

from __future__ import annotations

from datetime import date

import pytest

from app.core.exceptions import ConflictError, ValidationError
from app.core.money import to_minor
from tests.conftest import category_id, make_account

TODAY = date.today()


def _named(categories, name: str, kind: str = "expense"):
    nodes = categories.list_nodes(kind=kind, include_inactive=True)
    return next(node for node in nodes if node.category.name == name)


def test_create_top_level_category(categories):
    created = categories.create({"name": "Pets", "kind": "expense"})
    assert created.parent_id is None
    assert created.is_active is True


def test_create_nested_tree(categories, session):
    lifestyle = category_id(session, "Lifestyle")
    electronics = categories.create(
        {"name": "Electronics", "kind": "expense", "parent_id": lifestyle}
    )
    accessories = categories.create(
        {"name": "Computer Accessories", "kind": "expense", "parent_id": electronics.id}
    )
    assert accessories.parent_id == electronics.id
    assert _named(categories, "Computer Accessories").depth == 2


def test_nesting_is_capped(categories, session):
    lifestyle = category_id(session, "Lifestyle")
    level1 = categories.create({"name": "L1", "kind": "expense", "parent_id": lifestyle})
    level2 = categories.create({"name": "L2", "kind": "expense", "parent_id": level1.id})
    with pytest.raises(ValidationError):
        categories.create({"name": "L3", "kind": "expense", "parent_id": level2.id})


def test_duplicate_sibling_name_rejected(categories, session):
    food = category_id(session, "Food")
    with pytest.raises(ConflictError):
        categories.create({"name": "Groceries", "kind": "expense", "parent_id": food})


def test_same_name_allowed_under_different_parents(categories, session):
    # "Groceries" already exists under Food; the same name under Travel is fine.
    travel = category_id(session, "Travel")
    created = categories.create({"name": "Groceries", "kind": "expense", "parent_id": travel})
    assert created.id is not None
    assert created.parent_id == travel


def test_rename(categories, session):
    coffee = categories.get(category_id(session, "Coffee"))
    categories.update(coffee.id, {"name": "Coffee & Tea"})
    assert categories.get(coffee.id).name == "Coffee & Tea"


def test_change_parent(categories, session):
    coffee = category_id(session, "Coffee")
    lifestyle = category_id(session, "Lifestyle")
    categories.update(coffee, {"parent_id": lifestyle})
    assert categories.get(coffee).parent_id == lifestyle


def test_move_to_top_level(categories, session):
    coffee = category_id(session, "Coffee")
    categories.update(coffee, {"parent_id": None})
    assert categories.get(coffee).parent_id is None


# ------------------------------------------------------------ cycle safety


def test_category_cannot_be_its_own_parent(categories, session):
    food = category_id(session, "Food")
    with pytest.raises(ValidationError):
        categories.update(food, {"parent_id": food})


def test_category_cannot_move_into_its_own_child(categories, session):
    food = category_id(session, "Food")
    groceries = category_id(session, "Groceries")
    with pytest.raises(ValidationError):
        categories.update(food, {"parent_id": groceries})


def test_category_cannot_move_into_a_deeper_descendant(categories, session):
    lifestyle = category_id(session, "Lifestyle")
    electronics = categories.create(
        {"name": "Electronics", "kind": "expense", "parent_id": lifestyle}
    )
    with pytest.raises(ValidationError):
        categories.update(lifestyle, {"parent_id": electronics.id})


def test_kind_cannot_change(categories, session):
    food = category_id(session, "Food")
    with pytest.raises(ValidationError):
        categories.update(food, {"kind": "income"})


def test_parent_must_share_kind(categories, session):
    salary = category_id(session, "Salary", "income")
    with pytest.raises(ValidationError):
        categories.create({"name": "Odd", "kind": "expense", "parent_id": salary})


# ------------------------------------------------------ archive / restore


def test_archive_and_restore(categories, session):
    coffee = category_id(session, "Coffee")
    categories.archive(coffee)
    assert categories.get(coffee).is_active is False
    categories.archive(coffee, archived=False)
    assert categories.get(coffee).is_active is True


def test_archiving_a_parent_hides_the_branch(categories, session):
    food = category_id(session, "Food")
    categories.archive(food)
    assert categories.get(category_id(session, "Groceries") if False else food).is_active is False
    active_names = {node.category.name for node in categories.list_nodes(kind="expense", include_inactive=False)}
    assert "Food" not in active_names
    assert "Groceries" not in active_names


def test_child_cannot_be_restored_inside_an_archived_parent(categories, session):
    food = category_id(session, "Food")
    groceries = category_id(session, "Groceries")
    categories.archive(food)
    with pytest.raises(ValidationError):
        categories.archive(groceries, archived=False)


def test_archived_category_is_hidden_from_pickers(categories, session):
    coffee = category_id(session, "Coffee")
    categories.archive(coffee)
    active = {node.category.id for node in categories.list_nodes(kind="expense", include_inactive=False)}
    assert coffee not in active
    everything = {node.category.id for node in categories.list_nodes(kind="expense", include_inactive=True)}
    assert coffee in everything


def test_history_survives_archiving(accounts, ledger, categories, session):
    account = make_account(accounts, "招商银行", "CNY", "20000.00")
    coffee = category_id(session, "Coffee")
    transaction = ledger.create_transaction(
        {
            "type": "expense",
            "account_id": account.id,
            "amount_minor": to_minor("35.00", "CNY"),
            "transaction_date": TODAY,
            "description": "Latte",
            "category_id": coffee,
        }
    )
    categories.archive(coffee)
    stored = ledger.get(transaction.id)
    assert stored.category_id == coffee
    assert categories.get(coffee).name == "Coffee"
    assert accounts.balance_for(account.id).balance_minor == to_minor("19965.00", "CNY")


# -------------------------------------------------------------- deletion


def test_unused_category_can_be_deleted(categories):
    created = categories.create({"name": "Temporary", "kind": "expense"})
    categories.delete(created.id)
    remaining = {node.category.name for node in categories.list_nodes(include_inactive=True)}
    assert "Temporary" not in remaining


def test_used_category_cannot_be_deleted(accounts, ledger, categories, session):
    account = make_account(accounts, "招商银行", "CNY", "20000.00")
    coffee = category_id(session, "Coffee")
    ledger.create_transaction(
        {
            "type": "expense",
            "account_id": account.id,
            "amount_minor": to_minor("35.00", "CNY"),
            "transaction_date": TODAY,
            "description": "Latte",
            "category_id": coffee,
        }
    )
    with pytest.raises(ConflictError) as excinfo:
        categories.delete(coffee)
    assert "archive" in str(excinfo.value).lower()


def test_category_with_children_cannot_be_deleted(categories, session):
    with pytest.raises(ConflictError):
        categories.delete(category_id(session, "Food"))


def test_budgeted_category_cannot_be_deleted(categories, budgets, session):
    food = category_id(session, "Food")
    budgets.replace_period(
        TODAY.year, TODAY.month, [{"category_id": food, "amount_minor": to_minor("100.00", "CNY")}]
    )
    coffee = category_id(session, "Coffee")
    budgets.replace_period(
        TODAY.year,
        TODAY.month,
        [{"category_id": coffee, "amount_minor": to_minor("100.00", "CNY")}],
    )
    with pytest.raises(ConflictError):
        categories.delete(coffee)


# ----------------------------------------------------------- usage counts


def test_usage_counts(accounts, ledger, categories, session):
    account = make_account(accounts, "招商银行", "CNY", "20000.00")
    groceries = category_id(session, "Groceries")
    for _ in range(3):
        ledger.create_transaction(
            {
                "type": "expense",
                "account_id": account.id,
                "amount_minor": to_minor("10.00", "CNY"),
                "transaction_date": TODAY,
                "description": "Shop",
                "category_id": groceries,
            }
        )
    assert _named(categories, "Groceries").transaction_count == 3
    # A parent reports what its whole branch has been used for.
    assert _named(categories, "Food").subtree_count == 3
    assert _named(categories, "Food").transaction_count == 0


def test_voided_transactions_do_not_count(accounts, ledger, categories, session):
    account = make_account(accounts, "招商银行", "CNY", "20000.00")
    groceries = category_id(session, "Groceries")
    transaction = ledger.create_transaction(
        {
            "type": "expense",
            "account_id": account.id,
            "amount_minor": to_minor("10.00", "CNY"),
            "transaction_date": TODAY,
            "description": "Shop",
            "category_id": groceries,
        }
    )
    assert _named(categories, "Groceries").transaction_count == 1
    ledger.void(transaction.id)
    assert _named(categories, "Groceries").transaction_count == 0
