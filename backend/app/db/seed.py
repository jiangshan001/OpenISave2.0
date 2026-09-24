"""Reference data seeding.

Only currencies, settings and the default category tree are seeded. No sample
accounts, balances or transactions are ever created -- a new installation opens
on a genuinely empty ledger.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import CategoryKind
from app.core.money import CURRENCY_METADATA
from app.models.asset import AssetCategory
from app.models.category import Category
from app.models.currency import Currency
from app.models.setting import AppSetting

EXPENSE_TREE: dict[str, list[str]] = {
    "Housing": ["Rent", "Mortgage", "Utilities", "Maintenance", "Property Fees"],
    "Food": ["Groceries", "Restaurants", "Coffee", "Delivery"],
    "Transport": ["Public Transport", "Taxi", "Fuel", "Rail", "Flights"],
    "Lifestyle": ["Entertainment", "Shopping", "Clothing", "Subscriptions", "Fitness"],
    "Education": ["Tuition", "Books", "Courses"],
    "Health": ["Medical", "Pharmacy", "Insurance"],
    "Travel": ["Accommodation", "Transport", "Activities"],
    "Fees & Charges": [],
    "Other": [],
}

#: Asset category -> whether its assets count towards net worth by default.
#: Only stores of wealth do; personal possessions are tracked but excluded.
ASSET_CATEGORIES: dict[str, bool] = {
    "Electronics": False,
    "Vehicle": False,
    "Furniture": False,
    "Collectibles": False,
    "Property": True,
    "Other": False,
}

INCOME_CATEGORIES: list[str] = [
    "Salary",
    "Bonus",
    "Freelance",
    "Part-Time",
    "Investment Income",
    "Interest",
    "Gift",
    "Other",
]


def seed_currencies(session: Session) -> int:
    created = 0
    for code, (symbol, digits, display_name) in CURRENCY_METADATA.items():
        if session.get(Currency, code) is not None:
            continue
        session.add(
            Currency(
                code=code, symbol=symbol, minor_unit_digits=digits, display_name=display_name
            )
        )
        created += 1
    return created


def seed_settings(session: Session) -> None:
    if session.get(AppSetting, 1) is None:
        session.add(AppSetting(id=1))


def _existing(session: Session, kind: str) -> dict[tuple[str, int | None], Category]:
    rows = session.scalars(select(Category).where(Category.kind == kind))
    return {(row.name, row.parent_id): row for row in rows}


def seed_categories(session: Session) -> int:
    created = 0
    expense = _existing(session, CategoryKind.EXPENSE.value)
    for order, (parent_name, children) in enumerate(EXPENSE_TREE.items()):
        parent = expense.get((parent_name, None))
        if parent is None:
            parent = Category(
                name=parent_name,
                kind=CategoryKind.EXPENSE.value,
                parent_id=None,
                sort_order=order * 100,
            )
            session.add(parent)
            session.flush()
            expense[(parent_name, None)] = parent
            created += 1
        for child_order, child_name in enumerate(children):
            if (child_name, parent.id) in expense:
                continue
            session.add(
                Category(
                    name=child_name,
                    kind=CategoryKind.EXPENSE.value,
                    parent_id=parent.id,
                    sort_order=order * 100 + child_order + 1,
                )
            )
            created += 1

    income = _existing(session, CategoryKind.INCOME.value)
    for order, name in enumerate(INCOME_CATEGORIES):
        if (name, None) in income:
            continue
        session.add(
            Category(name=name, kind=CategoryKind.INCOME.value, parent_id=None, sort_order=order)
        )
        created += 1
    return created


def seed_asset_categories(session: Session) -> int:
    """Add missing default categories. Existing rows are never changed, so a
    user's choice of default survives every restart."""
    existing = {row.name for row in session.scalars(select(AssetCategory))}
    created = 0
    for order, (name, counts) in enumerate(ASSET_CATEGORIES.items()):
        if name in existing:
            continue
        session.add(
            AssetCategory(name=name, sort_order=order, include_in_net_worth_default=counts)
        )
        created += 1
    return created


def seed_all(session: Session) -> dict[str, int]:
    currencies = seed_currencies(session)
    seed_settings(session)
    session.flush()
    categories = seed_categories(session)
    asset_categories = seed_asset_categories(session)
    session.commit()
    return {
        "currencies": currencies,
        "categories": categories,
        "asset_categories": asset_categories,
    }
