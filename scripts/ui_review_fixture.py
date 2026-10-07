"""Seed a running scratch backend with synthetic, anonymised data for UI screenshots.

Never point this at the real vault. Start the backend on a throwaway data root
with an in-memory key store first, e.g. (PowerShell):

    $env:OPENISAVE_DATA_ROOT = "$env:TEMP\\openisave-ui-fixture\\data"
    $env:OPENISAVE_LEGACY_DATA_ROOT = "$env:TEMP\\openisave-ui-fixture\\no-legacy"
    $env:OPENISAVE_KEY_STORE = "memory"
    $env:OPENISAVE_CREDENTIAL_SERVICE = "OpenISave2-UIFixture/DatabaseEncryptionKey"
    backend\\.venv\\Scripts\\python.exe -m uvicorn app.main:app --app-dir backend --port 8756

then run:  backend\\.venv\\Scripts\\python.exe scripts\\ui_review_fixture.py

Every name and amount below is invented. The random generator is seeded, so the
same data is produced on every run (dates are relative to today).
"""

from __future__ import annotations

import json
import random
import sys
import urllib.request
from datetime import date, timedelta

API = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8756/api/v1"
TODAY = date.today()
rng = random.Random(20260930)


def call(method: str, path: str, body: object | None = None) -> object:
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        API + path, data=data, method=method, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(request) as response:  # noqa: S310 - loopback only
        raw = response.read()
        return json.loads(raw) if raw else None


def guard() -> None:
    status = call("GET", "/security/status")
    location = str(status.get("data_location", ""))  # type: ignore[union-attr]
    if "OpenISave2Data" in location and "openisave-ui-fixture" not in location:
        sys.exit(f"Refusing to seed: backend is using {location!r}, not a scratch data root.")
    if call("GET", "/accounts"):
        sys.exit("Refusing to seed: the scratch vault already has accounts.")


def fen(amount: float) -> int:
    return int(round(amount * 100))


def category_ids() -> dict[tuple[str, str], int]:
    ids: dict[tuple[str, str], int] = {}
    for kind in ("expense", "income"):
        rows = call("GET", f"/categories?kind={kind}")
        by_id = {row["id"]: row for row in rows}  # type: ignore[union-attr]
        for row in rows:  # type: ignore[union-attr]
            parent = by_id.get(row["parent_id"])
            ids[(kind, f"{parent['name']}/{row['name']}" if parent else row["name"])] = row["id"]
    return ids


def account(name, account_type, currency, opening, institution=None, purpose=None):
    return call(
        "POST",
        "/accounts",
        {
            "name": name,
            "institution": institution,
            "account_type": account_type,
            "currency": currency,
            "purpose": purpose,
            "opening_balance_minor": fen(opening),
        },
    )["id"]  # type: ignore[index]


def tx(kind, account_id, amount, day, description, category_id):
    call(
        "POST",
        "/transactions",
        {
            "type": kind,
            "account_id": account_id,
            "amount_minor": fen(amount),
            "transaction_date": day.isoformat(),
            "description": description,
            "category_id": category_id,
        },
    )


def main() -> None:
    guard()
    rates = {"GBP": "9.1520", "USD": "7.1250", "EUR": "7.8930", "JPY": "0.0487",
             "CAD": "5.2210", "AUD": "4.7180"}
    for code, rate in rates.items():
        call("POST", "/fx/rates", {"from_currency": code, "to_currency": "CNY", "rate": rate,
                                   "rate_date": TODAY.isoformat()})

    cats = category_ids()
    # Real institution names are used only so the account theme system can be
    # reviewed; every balance and account name is invented.
    hsbc = account("HSBC Current", "bank", "GBP", 3400, "HSBC")
    main_bank = account("Salary Account", "bank", "CNY", 38200, "Bank of China",
                        "daily_spending")
    monzo = account("Monzo Current", "bank", "GBP", 820, "Monzo", "travel")
    wallet = account("WeChat Wallet", "ewallet", "CNY", 2150, "WeChat Pay", "daily_spending")
    cmb = account("Everyday Card", "bank", "CNY", 12400, "招商银行", "bills")
    local = account("Community Account", "bank", "CNY", 8600, "Lakeside Credit Union",
                    "long_term_savings")
    saver = account("Reserve Saver", "savings", "CNY", 126000, "Harbour Bank", "emergency_fund")
    invest = account("Index Portfolio", "investment", "CNY", 84500, "Meridian Invest")
    card = account("Travel Card", "credit_card", "CNY", 0, "Harbour Bank")
    account("Cash", "cash", "CNY", 640)

    spend = [
        ("Food/Groceries", "Weekly groceries", 90, 320, 0.5),
        ("Food/Restaurants", "Dinner out", 80, 420, 0.25),
        ("Food/Coffee", "Coffee", 18, 42, 0.45),
        ("Transport/Public Transport", "Metro top-up", 20, 100, 0.2),
        ("Transport/Taxi", "Taxi", 25, 90, 0.12),
        ("Lifestyle/Shopping", "Household items", 60, 680, 0.08),
        ("Lifestyle/Subscriptions", "Streaming plan", 25, 68, 0.03),
        ("Health/Pharmacy", "Pharmacy", 30, 160, 0.03),
    ]
    start = TODAY - timedelta(days=364)
    for offset in range(365):
        day = start + timedelta(days=offset)
        for key, text, low, high, chance in spend:
            if rng.random() < chance:
                source = wallet if rng.random() < 0.35 else main_bank
                tx("expense", source, round(rng.uniform(low, high), 2), day, text,
                   cats[("expense", key)])
        if day.day == 1:
            tx("expense", main_bank, 6800, day, "Monthly rent", cats[("expense", "Housing/Rent")])
            tx("expense", main_bank, round(rng.uniform(260, 420), 2), day, "Utilities",
               cats[("expense", "Housing/Utilities")])
        if day.day == 2:
            call("POST", "/transfers", {"from_account_id": main_bank, "to_account_id": wallet,
                                        "amount_minor": fen(2600),
                                        "transaction_date": day.isoformat(),
                                        "description": "Wallet top-up"})
        if day.day == 10:
            tx("income", main_bank, 24500, day, "Salary", cats[("income", "Salary")])
        if day.day == 20 and rng.random() < 0.4:
            tx("income", main_bank, round(rng.uniform(1200, 4800), 2), day,
               "Design project", cats[("income", "Freelance")])
    for day_offset, amount in ((5, 386.4), (12, 1240.0), (19, 218.9)):
        tx("expense", card, amount, TODAY - timedelta(days=day_offset), "Hotel and travel",
           cats[("expense", "Travel/Accommodation")])
    tx("income", saver, 312.55, TODAY.replace(day=1), "Savings interest",
       cats[("income", "Interest")])

    year, month = TODAY.year, TODAY.month
    budget = [("Food", 4200), ("Transport", 900), ("Lifestyle", 1500), ("Housing", 7600),
              ("Health", 400)]
    call("PUT", f"/budgets/{year}/{month}", {"entries": [
        {"category_id": cats[("expense", name)], "amount_minor": fen(amount)}
        for name, amount in budget]})

    call("POST", "/goals", {"name": "Emergency Fund", "currency": "CNY",
                            "target_amount_minor": fen(180000), "account_ids": [saver]})
    call("POST", "/goals", {"name": "Travel", "currency": "CNY",
                            "target_amount_minor": fen(36000), "account_ids": [monzo, hsbc]})
    call("POST", "/goals", {"name": "Home deposit", "currency": "CNY",
                            "target_amount_minor": fen(600000),
                            "deadline": f"{year + 3}-06-30",
                            "account_ids": [saver, invest, hsbc]})
    call("POST", "/goals", {"name": "General Savings", "currency": "CNY",
                            "target_amount_minor": fen(100000), "account_ids": [cmb, local]})

    asset_cats = {row["name"]: row["id"] for row in call("GET", "/assets/categories")}  # type: ignore[union-attr]
    call("POST", "/assets", {"name": "Laptop", "asset_category_id": asset_cats["Electronics"],
                             "purchase_date": (TODAY - timedelta(days=410)).isoformat(),
                             "purchase_price_minor": fen(12999), "purchase_currency": "CNY",
                             "payment": {"account_id": main_bank, "financed_amount_minor": 0}})

    for name, amount, dom, key in (("Broadband", 129, 15, "Housing/Utilities"),
                                   ("Gym membership", 299, (TODAY + timedelta(days=4)).day,
                                    "Lifestyle/Fitness")):
        call("POST", "/recurring", {"name": name, "transaction_type": "expense",
                                    "account_id": main_bank, "category_id": cats[("expense", key)],
                                    "amount_minor": fen(amount), "frequency": "monthly",
                                    "start_date": (TODAY + timedelta(days=1)).isoformat(),
                                    "day_of_month": dom})
    print("Synthetic UI fixture seeded.")


if __name__ == "__main__":
    main()
