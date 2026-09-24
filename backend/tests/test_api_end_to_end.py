"""End-to-end API walkthrough of the required V1 scenario.

Runs against the real FastAPI app with an isolated in-memory database and an
offline FX provider.
"""

from __future__ import annotations

from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_fx_service
from app.core.money import to_minor
from app.db.session import get_db
from app.main import create_app
from app.services.fx_service import FxService
from tests.conftest import StubFxProvider

TODAY = date.today().isoformat()


def build_client(session, *, provider: StubFxProvider | None = None) -> TestClient:
    """A TestClient bound to the test session.

    The lifespan is deliberately not run: startup seeds and logs against the
    real application database, which tests must never touch.
    """
    app = create_app(storage="open")
    app.dependency_overrides[get_db] = lambda: session
    app.dependency_overrides[get_fx_service] = lambda: FxService(
        session, provider or StubFxProvider()
    )
    return TestClient(app)


@pytest.fixture()
def client(session):
    test_client = build_client(session)
    test_client.post("/api/v1/fx/refresh")
    return test_client


def _category(client: TestClient, name: str, kind: str = "expense") -> int:
    rows = client.get("/api/v1/categories", params={"kind": kind}).json()
    return next(row["id"] for row in rows if row["name"] == name)


def _create_account(client: TestClient, **payload) -> dict:
    response = client.post("/api/v1/accounts", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_health(client):
    body = client.get("/api/v1/health").json()
    assert body["status"] == "ok"
    assert body["base_currency"] == "CNY"


def test_first_run_starts_with_an_empty_ledger(client):
    assert client.get("/api/v1/accounts").json() == []
    assert client.get("/api/v1/transactions").json()["total"] == 0
    assert client.get("/api/v1/goals").json() == []
    assert len(client.get("/api/v1/currencies").json()) == 7
    assert len(client.get("/api/v1/categories").json()) > 0


def test_full_scenario(client):
    # Steps 1-3: three accounts across two currencies -------------------------
    cmb = _create_account(
        client,
        name="招商银行",
        institution="China Merchants Bank",
        account_type="bank",
        currency="CNY",
        purpose="daily_spending",
        opening_balance_minor=to_minor("20000.00", "CNY"),
    )
    boc = _create_account(
        client,
        name="中国银行",
        institution="Bank of China",
        account_type="savings",
        currency="CNY",
        purpose="emergency_fund",
        opening_balance_minor=to_minor("50000.00", "CNY"),
    )
    monzo = _create_account(
        client,
        name="Monzo",
        institution="Monzo",
        account_type="bank",
        currency="GBP",
        purpose="daily_spending",
        opening_balance_minor=to_minor("2000.00", "GBP"),
    )

    # Step 4: salary into 招商银行 --------------------------------------------
    response = client.post(
        "/api/v1/transactions",
        json={
            "type": "income",
            "account_id": cmb["id"],
            "amount_minor": to_minor("10000.00", "CNY"),
            "transaction_date": TODAY,
            "description": "Salary",
            "category_id": _category(client, "Salary", "income"),
        },
    )
    assert response.status_code == 201, response.text

    # Step 5: restaurant expense ---------------------------------------------
    response = client.post(
        "/api/v1/transactions",
        json={
            "type": "expense",
            "account_id": cmb["id"],
            "amount_minor": to_minor("200.00", "CNY"),
            "transaction_date": TODAY,
            "description": "Restaurant",
            "category_id": _category(client, "Restaurants"),
        },
    )
    assert response.status_code == 201, response.text

    balance = client.get(f"/api/v1/accounts/{cmb['id']}").json()
    assert balance["balance_minor"] == to_minor("29800.00", "CNY")

    # Step 6: same-currency transfer ------------------------------------------
    before = client.get("/api/v1/dashboard").json()
    response = client.post(
        "/api/v1/transfers",
        json={
            "from_account_id": cmb["id"],
            "to_account_id": boc["id"],
            "amount_minor": to_minor("3000.00", "CNY"),
            "transaction_date": TODAY,
        },
    )
    assert response.status_code == 201, response.text
    after = client.get("/api/v1/dashboard").json()

    assert after["net_worth_minor"] == before["net_worth_minor"]
    assert after["month_income_minor"] == before["month_income_minor"]
    assert after["month_expense_minor"] == before["month_expense_minor"]
    assert (
        client.get(f"/api/v1/accounts/{cmb['id']}").json()["balance_minor"]
        == to_minor("26800.00", "CNY")
    )
    assert (
        client.get(f"/api/v1/accounts/{boc['id']}").json()["balance_minor"]
        == to_minor("53000.00", "CNY")
    )

    # Step 7: GBP expense reported in CNY -------------------------------------
    response = client.post(
        "/api/v1/transactions",
        json={
            "type": "expense",
            "account_id": monzo["id"],
            "amount_minor": to_minor("20.00", "GBP"),
            "transaction_date": TODAY,
            "description": "Tesco",
            "category_id": _category(client, "Groceries"),
        },
    )
    assert response.status_code == 201, response.text
    created = response.json()
    assert created["currency"] == "GBP"
    assert created["amount_minor"] == to_minor("20.00", "GBP")
    assert created["base_amount_minor"] == to_minor("193.00", "CNY")

    monzo_balance = client.get(f"/api/v1/accounts/{monzo['id']}").json()
    assert monzo_balance["balance_minor"] == to_minor("1980.00", "GBP")
    assert monzo_balance["base_balance_minor"] == to_minor("19107.00", "CNY")

    # Step 8: goal linked to 中国银行 -----------------------------------------
    response = client.post(
        "/api/v1/goals",
        json={
            "name": "Emergency Fund",
            "currency": "CNY",
            "target_amount_minor": to_minor("100000.00", "CNY"),
            "account_ids": [boc["id"]],
        },
    )
    assert response.status_code == 201, response.text
    goal = response.json()
    assert goal["current_amount_minor"] == to_minor("53000.00", "CNY")
    assert goal["progress_percent"] == 53.0

    # Step 9: budget picks up actual spending ---------------------------------
    year, month = date.today().year, date.today().month
    response = client.put(
        f"/api/v1/budgets/{year}/{month}",
        json={
            "entries": [
                {
                    "category_id": _category(client, "Food"),
                    "amount_minor": to_minor("3000.00", "CNY"),
                }
            ]
        },
    )
    assert response.status_code == 200, response.text
    line = response.json()["lines"][0]
    # 200 CNY restaurant + 20 GBP groceries valued at 193 CNY
    assert line["actual_minor"] == to_minor("393.00", "CNY")
    assert line["remaining_minor"] == to_minor("2607.00", "CNY")

    # Monthly report ----------------------------------------------------------
    report = client.get(f"/api/v1/reports/monthly/{year}/{month}").json()
    assert report["summary"]["income_minor"] == to_minor("10000.00", "CNY")
    assert report["summary"]["expense_minor"] == to_minor("393.00", "CNY")
    assert report["summary"]["net_cash_flow_minor"] == to_minor("9607.00", "CNY")
    assert len(report["account_movement"]) == 3

    # Dashboard ---------------------------------------------------------------
    dashboard = client.get("/api/v1/dashboard").json()
    assert dashboard["base_currency"] == "CNY"
    assert dashboard["total_liabilities_minor"] == 0
    # 26,800 + 53,000 + (1,980 GBP -> 19,107)
    assert dashboard["total_assets_minor"] == to_minor("98907.00", "CNY")
    assert dashboard["net_worth_minor"] == to_minor("98907.00", "CNY")
    assert len(dashboard["recent_transactions"]) == 4


def test_transfer_between_the_same_account_is_rejected_with_a_message(client):
    account = _create_account(
        client, name="招商银行", account_type="bank", currency="CNY", opening_balance_minor=0
    )
    response = client.post(
        "/api/v1/transfers",
        json={
            "from_account_id": account["id"],
            "to_account_id": account["id"],
            "amount_minor": 1000,
            "transaction_date": TODAY,
        },
    )
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "validation_error"
    assert "different" in body["message"].lower()


def test_missing_fx_rate_returns_an_actionable_error(session):
    """With no cached rate a foreign transaction is refused, not valued at 1.0."""
    client = build_client(session, provider=StubFxProvider(fail=True))
    account = _create_account(
        client, name="Monzo", account_type="bank", currency="GBP", opening_balance_minor=0
    )
    response = client.post(
        "/api/v1/transactions",
        json={
            "type": "expense",
            "account_id": account["id"],
            "amount_minor": to_minor("20.00", "GBP"),
            "transaction_date": TODAY,
            "description": "Tesco",
        },
    )
    assert response.status_code == 409
    body = response.json()
    assert body["code"] == "fx_rate_unavailable"
    assert "GBP/CNY" in body["message"]


def test_void_is_used_instead_of_hard_delete(client):
    account = _create_account(
        client,
        name="招商银行",
        account_type="bank",
        currency="CNY",
        opening_balance_minor=to_minor("1000.00", "CNY"),
    )
    created = client.post(
        "/api/v1/transactions",
        json={
            "type": "expense",
            "account_id": account["id"],
            "amount_minor": to_minor("100.00", "CNY"),
            "transaction_date": TODAY,
            "description": "Coffee",
        },
    ).json()

    assert client.delete(f"/api/v1/transactions/{created['id']}").status_code == 200
    stored = client.get(f"/api/v1/transactions/{created['id']}").json()
    assert stored["is_voided"] is True
    assert stored["voided_at"] is not None
    assert (
        client.get(f"/api/v1/accounts/{account['id']}").json()["balance_minor"]
        == to_minor("1000.00", "CNY")
    )
