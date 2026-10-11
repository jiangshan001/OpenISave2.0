"""2.4.1: independent usage ranking, category rollups and atomic parent creation."""

from datetime import date, timedelta

import pytest
from sqlalchemy import func, select

from app.core.enums import CategoryKind
from app.core.exceptions import ConflictError, ValidationError
from app.models.category import Category
from app.services.transaction_entry_service import TransactionEntryService
from tests.conftest import make_account
from tests.test_api_end_to_end import build_client

TODAY = date.today()


def tx(ledger, account, kind="expense", category=None, amount=100, on=TODAY):
    return ledger.create_transaction({
        "type": kind, "account_id": account.id, "amount_minor": amount,
        "category_id": category, "transaction_date": on, "description": "fixture",
    })


def test_usage_ranks_currency_groups_and_accounts_independently(accounts, ledger, session):
    unused = make_account(accounts, "Unused", "CNY", "0")
    bank = make_account(accounts, "Bank", "CNY", "0")
    wallet = make_account(accounts, "Wallet", "CNY", "0")
    gbp = make_account(accounts, "GBP", "GBP", "0")
    for _ in range(3):
        tx(ledger, wallet)
    tx(ledger, bank)
    for _ in range(2):
        tx(ledger, gbp)
    for _ in range(4):
        tx(ledger, gbp, "income")
    tx(ledger, bank, "income")
    service = TransactionEntryService(session)
    expense = service.options(CategoryKind.EXPENSE)["currencies"]
    income = service.options(CategoryKind.INCOME)["currencies"]
    assert [g["currency"] for g in expense] == ["CNY", "GBP"]
    assert [a["account_id"] for a in expense[0]["accounts"]] == [wallet.id, bank.id, unused.id]
    assert expense[0]["usage_count"] == 4
    assert [g["currency"] for g in income] == ["GBP", "CNY"]
    assert income[1]["accounts"][0]["account_id"] == bank.id


def test_ranking_ignores_voided_archived_inactive_transfers_and_fees(accounts, ledger, session):
    a = make_account(accounts, "First", "CNY", "100")
    b = make_account(accounts, "Second", "CNY", "100")
    archived = make_account(accounts, "Archived", "GBP", "0")
    inactive = make_account(accounts, "Inactive", "USD", "0")
    tx(ledger, a)
    tx(ledger, archived)
    tx(ledger, inactive)
    ledger.void(tx(ledger, b).id)
    ledger.create_transfer({
        "from_account_id": b.id, "to_account_id": a.id, "amount_minor": 100,
        "fee_minor": 10, "transaction_date": TODAY,
    })
    accounts.archive(archived.id)
    inactive.is_active = False
    session.commit()
    groups = TransactionEntryService(session).options(CategoryKind.EXPENSE)["currencies"]
    assert len(groups) == 1
    assert groups[0]["usage_count"] == 1
    assert groups[0]["accounts"] == [
        {"account_id": a.id, "usage_count": 1}, {"account_id": b.id, "usage_count": 0},
    ]


def test_ranking_ties_use_recency_then_configured_order(accounts, ledger, session):
    a = make_account(accounts, "First", "CNY", "0", sort_order=10)
    b = make_account(accounts, "Second", "CNY", "0", sort_order=0)
    service = TransactionEntryService(session)
    assert service.options(CategoryKind.EXPENSE)["currencies"][0]["accounts"][0]["account_id"] == b.id
    tx(ledger, b, on=TODAY - timedelta(days=1))
    tx(ledger, a)
    assert service.options(CategoryKind.EXPENSE)["currencies"][0]["accounts"][0]["account_id"] == a.id
    # Editing and voiding immediately affect the next read, with no preference cache in the DB.
    ledger.void(ledger.repo.list(account_id=a.id)[0].id)
    assert service.options(CategoryKind.EXPENSE)["currencies"][0]["accounts"][0]["account_id"] == b.id


def test_entry_options_route_precedes_transaction_id_route(session, accounts):
    make_account(accounts, "Fixture", "CNY", "0")
    client = build_client(session)
    response = client.get("/api/v1/transactions/entry-options?type=expense")
    assert response.status_code == 200
    assert response.json()["type"] == "expense"
    assert client.get("/api/v1/transactions/entry-options?type=transfer").status_code == 422


@pytest.mark.parametrize("kind", ["expense", "income"])
def test_parent_rollup_keeps_direct_entries_grandchildren_and_archived_history(
    categories, accounts, ledger, dashboard, session, kind,
):
    root = categories.create({"name": "Fixture transport", "kind": kind})
    taxi = categories.create({"name": "Taxi", "kind": kind, "parent_id": root.id})
    public = categories.create({"name": "Public", "kind": kind, "parent_id": root.id})
    train = categories.create({"name": "Train", "kind": kind, "parent_id": public.id})
    a = make_account(accounts, "CNY", "CNY", "0")
    b = make_account(accounts, "GBP", "GBP", "0")
    tx(ledger, a, kind, root.id, 500)
    tx(ledger, a, kind, taxi.id, 2500)
    tx(ledger, a, kind, public.id, 1000)
    foreign = tx(ledger, b, kind, train.id, 200)
    tx(ledger, a, kind, None, 900)
    ledger.void(tx(ledger, a, kind, taxi.id, 99999).id)
    tx(ledger, a, kind, taxi.id, 99999, on=TODAY - timedelta(days=45))
    categories.archive(public.id)
    start = TODAY.replace(day=1)
    rows = dashboard.parent_category_breakdown(start, TODAY, CategoryKind(kind))
    expected = 4000 + foreign.base_amount_minor
    parent = next(row for row in rows if row["category_id"] == root.id)
    assert parent["amount_minor"] == expected
    assert sum(row["amount_minor"] for row in parent["children"]) == expected
    assert next(row for row in parent["children"] if row["category_id"] == root.id)["amount_minor"] == 500
    public_row = next(row for row in parent["children"] if row["category_id"] == public.id)
    assert {row["category_name"] for row in public_row["children"]} == {"Train", "Public (direct)"}
    assert sum(row["amount_minor"] for row in rows) == expected + 900
    body = build_client(session).get("/api/v1/dashboard").json()
    assert sum(row["amount_minor"] for row in body[f"{kind}_by_parent_category"]) == body[f"month_{kind}_minor"]
    assert len(body[f"{kind}_by_category"]) == 5  # Existing flat reporting is preserved.


@pytest.mark.parametrize("kind", ["expense", "income"])
def test_create_child_and_new_root_together_over_http(session, kind):
    client = build_client(session)
    response = client.post("/api/v1/categories", json={
        "name": "Taxi", "kind": kind, "new_parent_name": "Fixture transport",
    })
    assert response.status_code == 201
    child = response.json()
    parent = session.get(Category, child["parent_id"])
    assert parent.name == "Fixture transport"
    assert parent.kind == kind and parent.parent_id is None
    assert child["depth"] == 1


def test_failed_child_creation_rolls_back_new_parent(categories, session):
    before = session.scalar(select(func.count()).select_from(Category))
    with pytest.raises(ValidationError):
        categories.create({"name": "  ", "kind": "expense", "new_parent_name": "No orphan"})
    assert session.scalar(select(func.count()).select_from(Category)) == before
    assert session.scalar(select(Category).where(Category.name == "No orphan")) is None


def test_duplicate_new_parent_is_rejected_without_writes(categories, session):
    root = categories.create({"name": "Fixture parent", "kind": "expense"})
    before = session.scalar(select(func.count()).select_from(Category))
    with pytest.raises(ConflictError):
        categories.create({"name": "Child", "kind": "expense", "new_parent_name": "fixture PARENT"})
    assert session.scalar(select(func.count()).select_from(Category)) == before
    with pytest.raises(ValidationError):
        categories.create({"name": "Child", "kind": "expense", "parent_id": root.id,
                           "new_parent_name": "Other"})
    categories.archive(root.id)
    with pytest.raises(ValidationError):
        categories.create({"name": "Child", "kind": "expense", "parent_id": root.id})
