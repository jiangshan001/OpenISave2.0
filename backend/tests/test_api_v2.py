"""HTTP-level checks for the V2 endpoints."""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.core.money import to_minor
from tests.test_api_end_to_end import build_client

TODAY = date.today()
TODAY_ISO = TODAY.isoformat()


@pytest.fixture()
def client(session):
    test_client = build_client(session)
    test_client.post("/api/v1/fx/refresh")
    return test_client


def _account(client, name, currency="CNY", opening="0.00", account_type="savings"):
    response = client.post(
        "/api/v1/accounts",
        json={
            "name": name,
            "account_type": account_type,
            "currency": currency,
            "opening_balance_minor": to_minor(opening, currency),
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


# ------------------------------------------------------------------- goals


def test_goal_spans_multiple_accounts_over_http(client):
    cmb = _account(client, "招商银行", opening="100000.00")
    boc = _account(client, "中国银行", opening="80000.00")
    hsbc = _account(client, "HSBC Savings", currency="GBP", opening="6200.00")

    response = client.post(
        "/api/v1/goals",
        json={
            "name": "三年存够50万",
            "currency": "CNY",
            "target_amount_minor": to_minor("500000.00", "CNY"),
            "deadline": f"{TODAY.year + 3}-09-22",
            "account_ids": [cmb["id"], boc["id"], hsbc["id"]],
        },
    )
    assert response.status_code == 201, response.text
    goal = response.json()
    assert goal["account_count"] == 3
    assert goal["current_amount_minor"] == to_minor("239830.00", "CNY")
    assert len(goal["contributions"]) == 3
    assert goal["selection_mode"] == "selected"

    hsbc_row = next(c for c in goal["contributions"] if c["account_name"] == "HSBC Savings")
    assert hsbc_row["balance_minor"] == to_minor("6200.00", "GBP")
    assert hsbc_row["converted_minor"] == to_minor("59830.00", "CNY")


def test_goal_requires_accounts_or_all_eligible(client):
    response = client.post("/api/v1/goals", json={"name": "Empty", "currency": "CNY"})
    assert response.status_code == 422
    assert "at least one account" in response.json()["message"]


def test_all_eligible_goal_over_http(client):
    _account(client, "招商银行", opening="100000.00")
    _account(client, "Card", opening="0.00", account_type="credit_card")
    response = client.post(
        "/api/v1/goals",
        json={"name": "Everything", "currency": "CNY", "selection_mode": "all_eligible"},
    )
    assert response.status_code == 201, response.text
    goal = response.json()
    assert goal["account_count"] == 1
    assert goal["current_amount_minor"] == to_minor("100000.00", "CNY")


# ------------------------------------------------------------------ assets


def test_asset_lifecycle_over_http(client):
    cmb = _account(client, "招商银行", opening="50000.00", account_type="bank")
    categories = client.get("/api/v1/assets/categories").json()
    electronics = next(row["id"] for row in categories if row["name"] == "Electronics")

    purchased_on = TODAY - timedelta(days=264)
    response = client.post(
        "/api/v1/assets",
        json={
            "name": "MacBook Pro",
            "asset_category_id": electronics,
            "purchase_date": purchased_on.isoformat(),
            "purchase_price_minor": to_minor("18000.00", "CNY"),
            "purchase_currency": "CNY",
            "payment": {"account_id": cmb["id"], "financed_amount_minor": 0},
        },
    )
    assert response.status_code == 201, response.text
    asset = response.json()
    assert asset["days_held"] == 264
    assert asset["holding_cost_per_day_minor"] == to_minor("68.18", "CNY")
    assert asset["current_value"]["source"] == "purchase_price"
    assert asset["category_name"] == "Electronics"

    balance = client.get(f"/api/v1/accounts/{cmb['id']}").json()
    assert balance["balance_minor"] == to_minor("32000.00", "CNY")

    dashboard = client.get("/api/v1/dashboard").json()
    assert dashboard["physical_assets_minor"] == to_minor("18000.00", "CNY")
    assert dashboard["month_expense_minor"] == 0

    # Valuation
    response = client.post(
        f"/api/v1/assets/{asset['id']}/valuations",
        json={"value_minor": to_minor("12000.00", "CNY"), "valuation_date": TODAY_ISO},
    )
    assert response.status_code == 201, response.text
    refreshed = client.get(f"/api/v1/assets/{asset['id']}").json()
    assert refreshed["current_value"]["value_minor"] == to_minor("12000.00", "CNY")
    assert refreshed["current_value"]["source"] == "valuation"
    assert len(refreshed["valuations"]) == 1

    # Sale
    response = client.post(
        f"/api/v1/assets/{asset['id']}/sell",
        json={
            "sale_date": TODAY_ISO,
            "sale_price_minor": to_minor("8000.00", "CNY"),
            "sale_currency": "CNY",
            "destination_account_id": cmb["id"],
        },
    )
    assert response.status_code == 200, response.text
    sold = response.json()
    assert sold["status"] == "sold"
    assert sold["net_cost_minor"] == to_minor("10000.00", "CNY")
    assert sold["days_held"] == 264
    assert sold["effective_cost_per_day_minor"] == to_minor("37.88", "CNY")

    banked = client.get(f"/api/v1/accounts/{cmb['id']}").json()
    assert banked["balance_minor"] == to_minor("40000.00", "CNY")

    dashboard = client.get("/api/v1/dashboard").json()
    assert dashboard["physical_assets_minor"] == 0
    assert dashboard["month_income_minor"] == 0

    holding = client.get("/api/v1/assets", params={"status": "holding"}).json()
    assert holding == []
    sold_list = client.get("/api/v1/assets", params={"status": "sold"}).json()
    assert len(sold_list) == 1


# ------------------------------------------------------------- liabilities


def test_liability_and_repayment_over_http(client):
    cmb = _account(client, "招商银行", opening="50000.00", account_type="bank")
    response = client.post(
        "/api/v1/liabilities",
        json={
            "name": "Apple Financing",
            "liability_type": "financing",
            "currency": "CNY",
            "original_amount_minor": to_minor("12000.00", "CNY"),
            "outstanding_amount_minor": to_minor("12000.00", "CNY"),
            "lender": "Apple",
        },
    )
    assert response.status_code == 201, response.text
    liability = response.json()
    assert liability["outstanding_minor"] == to_minor("12000.00", "CNY")

    dashboard = client.get("/api/v1/dashboard").json()
    assert dashboard["total_liabilities_minor"] == to_minor("12000.00", "CNY")

    response = client.post(
        f"/api/v1/liabilities/{liability['id']}/repayments",
        json={
            "from_account_id": cmb["id"],
            "amount_minor": to_minor("2000.00", "CNY"),
            "transaction_date": TODAY_ISO,
        },
    )
    assert response.status_code == 201, response.text

    refreshed = client.get(f"/api/v1/liabilities/{liability['id']}").json()
    assert refreshed["outstanding_minor"] == to_minor("10000.00", "CNY")
    assert refreshed["repaid_minor"] == to_minor("2000.00", "CNY")
    # A repayment is a transfer, so it is neither income nor expense.
    dashboard = client.get("/api/v1/dashboard").json()
    assert dashboard["month_expense_minor"] == 0


# -------------------------------------------------------------- categories


def test_category_tree_management_over_http(client):
    everything = client.get(
        "/api/v1/categories", params={"kind": "expense", "include_inactive": True}
    ).json()
    lifestyle = next(row["id"] for row in everything if row["name"] == "Lifestyle")

    electronics = client.post(
        "/api/v1/categories",
        json={"name": "Electronics", "kind": "expense", "parent_id": lifestyle},
    )
    assert electronics.status_code == 201, electronics.text
    electronics_id = electronics.json()["id"]

    accessories = client.post(
        "/api/v1/categories",
        json={"name": "Computer Accessories", "kind": "expense", "parent_id": electronics_id},
    )
    assert accessories.status_code == 201, accessories.text
    accessories_id = accessories.json()["id"]
    assert accessories.json()["depth"] == 2

    # Usable on a transaction straight away.
    account = _account(client, "招商银行", opening="5000.00", account_type="bank")
    created = client.post(
        "/api/v1/transactions",
        json={
            "type": "expense",
            "account_id": account["id"],
            "amount_minor": to_minor("199.00", "CNY"),
            "transaction_date": TODAY_ISO,
            "description": "Keyboard",
            "category_id": accessories_id,
        },
    )
    assert created.status_code == 201, created.text

    usage = client.get(
        "/api/v1/categories", params={"kind": "expense", "include_inactive": True}
    ).json()
    row = next(item for item in usage if item["id"] == accessories_id)
    assert row["transaction_count"] == 1

    # Archiving keeps the history readable but hides it from pickers.
    archived = client.post(f"/api/v1/categories/{accessories_id}/archive")
    assert archived.status_code == 200, archived.text
    assert archived.json()["is_active"] is False

    active_ids = {item["id"] for item in client.get("/api/v1/categories").json()}
    assert accessories_id not in active_ids

    stored = client.get(f"/api/v1/transactions/{created.json()['id']}").json()
    assert stored["category_id"] == accessories_id

    # Restore works.
    restored = client.post(
        f"/api/v1/categories/{accessories_id}/archive", params={"archived": False}
    )
    assert restored.json()["is_active"] is True


def test_used_category_delete_is_refused_with_advice(client):
    everything = client.get("/api/v1/categories", params={"kind": "expense"}).json()
    coffee = next(row["id"] for row in everything if row["name"] == "Coffee")
    account = _account(client, "招商银行", opening="500.00", account_type="bank")
    client.post(
        "/api/v1/transactions",
        json={
            "type": "expense",
            "account_id": account["id"],
            "amount_minor": to_minor("35.00", "CNY"),
            "transaction_date": TODAY_ISO,
            "description": "Latte",
            "category_id": coffee,
        },
    )
    response = client.delete(f"/api/v1/categories/{coffee}")
    assert response.status_code == 409
    assert "archive" in response.json()["message"].lower()


def test_category_cycle_refused_over_http(client):
    rows = client.get("/api/v1/categories", params={"kind": "expense"}).json()
    food = next(row["id"] for row in rows if row["name"] == "Food")
    groceries = next(row["id"] for row in rows if row["name"] == "Groceries")
    response = client.patch(f"/api/v1/categories/{food}", json={"parent_id": groceries})
    assert response.status_code == 422
    assert "subcategories" in response.json()["message"]
