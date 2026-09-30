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
from app.models.statement_import import CategorisationRule

EXPENSE_TREE: dict[str, list[str]] = {
    "Housing": ["Rent", "Mortgage", "Utilities", "Maintenance", "Property Fees"],
    "Food": ["Groceries", "Restaurants", "Coffee", "Delivery"],
    "Transport": ["Public Transport", "Taxi", "Fuel", "Rail", "Flights"],
    "Lifestyle": [
        "Entertainment",
        "Shopping",
        "Clothing",
        "Subscriptions",
        "Fitness",
        "Software & AI",
    ],
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


#: Built-in categorisation rules:
#: (key, name, field, match, pattern, second field, second pattern, direction,
#:  source, category paths tried in order).
#: Deterministic and explainable -- no AI. A rule whose category path is absent
#: from the user's tree is simply not created.
_FLIGHTS = [("Travel", "Flights"), ("Transport", "Flights")]
_SUBSCRIPTIONS = [("Entertainment", "Subscriptions"), ("Lifestyle", "Subscriptions")]
_SOFTWARE = [("Lifestyle", "Software & AI"), ("Lifestyle", "Subscriptions")]
_DELIVERY = [("Food", "Delivery")]
SYSTEM_RULES: list[tuple] = [
    ("merchant-roofoods", "Deliveroo (ROOFOODS LTD)", "merchant", "exact", "ROOFOODS LTD",
     None, None, "expense", None, _DELIVERY),
    ("merchant-deliveroo", "Deliveroo", "merchant", "contains", "Deliveroo",
     None, None, "expense", None, _DELIVERY),
    ("merchant-eleme", "饿了么", "merchant", "contains", "饿了么",
     None, None, "expense", None, _DELIVERY),
    ("merchant-tongcheng-flight", "同程旅行 flights", "merchant", "contains", "同程旅行",
     "product", "机票", "expense", None, _FLIGHTS),
    ("merchant-ctrip-flight", "携程 flights", "merchant", "contains", "携程",
     "product", "机票", "expense", None, _FLIGHTS),
    ("merchant-tongcheng-hotel", "同程旅行 hotels", "merchant", "contains", "同程旅行",
     "product", "酒店", "expense", None, [("Travel", "Accommodation")]),
    ("merchant-ctrip-hotel", "携程 hotels", "merchant", "contains", "携程",
     "product", "酒店", "expense", None, [("Travel", "Accommodation")]),
    ("merchant-bilibili-subscription", "哔哩哔哩 subscriptions", "merchant", "contains",
     "哔哩哔哩", "product", "连续包月", "expense", None, _SUBSCRIPTIONS),
    ("merchant-deepseek", "DeepSeek (深度求索)", "merchant", "contains", "深度求索",
     None, None, "expense", None, _SOFTWARE),
    ("merchant-didi", "滴滴出行", "merchant", "contains", "滴滴",
     None, None, "expense", None, [("Transport", "Taxi")]),
    ("merchant-railway", "中国铁路", "merchant", "contains", "铁路",
     None, None, "expense", None, [("Transport", "Rail")]),
    ("merchant-starbucks", "星巴克", "merchant", "contains", "星巴克",
     None, None, "expense", None, [("Food", "Coffee")]),
    ("merchant-luckin", "瑞幸咖啡", "merchant", "contains", "瑞幸",
     None, None, "expense", None, [("Food", "Coffee")]),
    ("product-deepseek", "DeepSeek API", "product", "contains", "DeepSeek",
     None, None, "expense", None, _SOFTWARE),
    ("product-openai", "OpenAI", "product", "contains", "OpenAI",
     None, None, "expense", None, _SOFTWARE),
    ("product-anthropic", "Anthropic", "product", "contains", "Anthropic",
     None, None, "expense", None, _SOFTWARE),
    ("product-apple-bill", "Apple subscriptions", "product", "contains", "apple.com/bill",
     None, None, "expense", None, _SUBSCRIPTIONS),
    ("wechat-red-packet-income", "微信红包 received", "source_type", "exact", "微信红包",
     None, None, "income", "wechat", [("Gift",)]),
]


def _category_by_path(session: Session, kind: str, path: tuple[str, ...]) -> Category | None:
    parent_id: int | None = None
    found: Category | None = None
    for name in path:
        parent_clause = (
            Category.parent_id.is_(None) if parent_id is None else Category.parent_id == parent_id
        )
        found = session.scalar(
            select(Category).where(Category.kind == kind, Category.name == name, parent_clause)
        )
        if found is None:
            return None
        parent_id = found.id
    return found


def seed_categorisation_rules(session: Session) -> int:
    """Add missing built-in rules. Existing ones (possibly edited or disabled
    by the user) are never touched; a deleted one is not resurrected either,
    because deletion only happens to user rules -- built-ins can be disabled."""
    existing = {
        key for key in session.scalars(select(CategorisationRule.system_key)) if key is not None
    }
    created = 0
    for order, spec in enumerate(SYSTEM_RULES):
        key, name, field, match, pattern, field2, pattern2, direction, source, paths = spec
        system_key = f"sys:{key}"
        if system_key in existing:
            continue
        category = next(
            (c for c in (_category_by_path(session, direction, p) for p in paths) if c), None
        )
        if category is None:
            continue
        session.add(
            CategorisationRule(
                name=name,
                origin="system",
                system_key=system_key,
                source=source,
                match_field=field,
                match_type=match,
                pattern=pattern,
                secondary_field=field2,
                secondary_pattern=pattern2,
                direction=direction,
                category_id=category.id,
                priority=order,
                is_enabled=True,
            )
        )
        created += 1
    return created


def seed_all(session: Session) -> dict[str, int]:
    currencies = seed_currencies(session)
    seed_settings(session)
    session.flush()
    categories = seed_categories(session)
    asset_categories = seed_asset_categories(session)
    session.flush()
    rules = seed_categorisation_rules(session)
    session.commit()
    return {
        "currencies": currencies,
        "categories": categories,
        "asset_categories": asset_categories,
        "categorisation_rules": rules,
    }
