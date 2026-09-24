"""Net worth counts stores of wealth only.

Personal possessions (electronics, vehicles, furniture, collectibles) remain
fully tracked but never enter Total Assets or Net Worth unless the user opts an
asset in. The classification lives in the asset service, not the frontend.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import select

from app.core.money import to_minor
from app.models.posting import Posting
from app.models.transaction import Transaction
from tests.conftest import make_account

TODAY = date.today()


def _category(assets, name: str) -> int:
    return next(row.id for row in assets.categories() if row.name == name)


def _buy(assets, name, category, price, *, account=None, **extra):
    data = {
        "name": name,
        "asset_category_id": _category(assets, category) if category else None,
        "purchase_date": TODAY,
        "purchase_price_minor": to_minor(price, "CNY"),
        "purchase_currency": "CNY",
    }
    if account is not None:
        data["payment"] = {"account_id": account.id, "financed_amount_minor": 0}
    data.update(extra)
    return assets.purchase(data)


def _ledger_snapshot(session) -> list[tuple]:
    transactions = session.scalars(select(Transaction).order_by(Transaction.id)).all()
    postings = session.scalars(select(Posting).order_by(Posting.id)).all()
    return [
        *(
            (t.id, t.type, t.amount_minor, t.base_amount_minor, str(t.fx_rate_to_base))
            for t in transactions
        ),
        *(
            (p.id, p.transaction_id, p.account_id, p.asset_id, p.amount_minor, p.base_amount_minor)
            for p in postings
        ),
    ]


# ---------------------------------------------------------- category defaults


def test_category_defaults_follow_the_product_definition(assets):
    defaults = {row.name: row.include_in_net_worth_default for row in assets.categories()}
    assert defaults["Electronics"] is False
    assert defaults["Vehicle"] is False
    assert defaults["Furniture"] is False
    assert defaults["Collectibles"] is False
    assert defaults["Other"] is False
    assert defaults["Property"] is True


# ------------------------------------------------------------ required cases


def test_electronics_is_excluded_from_total_assets_and_net_worth(accounts, assets, networth):
    """1. Electronics 18,000, default exclude: bank -18,000, net worth -18,000."""
    bank = make_account(accounts, "招商银行", "CNY", "50000.00")
    before = networth.calculate()

    macbook = _buy(assets, "MacBook Pro", "Electronics", "18000.00", account=bank)

    after = networth.calculate()
    assert macbook.include_in_net_worth is False
    assert macbook.include_in_net_worth_manual is False
    assert accounts.balance_for(bank.id).balance_minor == to_minor("32000.00", "CNY")
    assert after.total_assets_minor == before.total_assets_minor - to_minor("18000.00", "CNY")
    assert after.net_worth_minor == before.net_worth_minor - to_minor("18000.00", "CNY")
    assert after.physical_assets_minor == 0
    assert after.personal_possessions_minor == to_minor("18000.00", "CNY")


def test_vehicle_is_excluded(assets, networth):
    """2. Vehicle, default exclude."""
    before = networth.calculate()
    car = _buy(assets, "Car", "Vehicle", "150000.00")
    after = networth.calculate()
    assert car.include_in_net_worth is False
    assert after.net_worth_minor == before.net_worth_minor
    assert after.total_assets_minor == before.total_assets_minor
    assert after.personal_possessions_minor == to_minor("150000.00", "CNY")


def test_property_is_included(assets, networth):
    """3. Property 500,000, default include."""
    before = networth.calculate()
    flat = _buy(assets, "Flat", "Property", "500000.00")
    after = networth.calculate()
    assert flat.include_in_net_worth is True
    assert after.total_assets_minor == before.total_assets_minor + to_minor("500000.00", "CNY")
    assert after.net_worth_minor == before.net_worth_minor + to_minor("500000.00", "CNY")
    assert after.physical_assets_minor == to_minor("500000.00", "CNY")
    assert after.personal_possessions_minor == 0


def test_property_with_mortgage_contributes_its_equity(accounts, assets, liabilities, networth):
    """4. Property 500,000 bought with a 300,000 mortgage: net contribution 200,000.

    The 200,000 deposit comes out of the bank, so buying converts cash into
    equity and net worth is unchanged; the property's net contribution (asset
    minus its mortgage) is 200,000.
    """
    bank = make_account(accounts, "招商银行", "CNY", "250000.00")
    mortgage = liabilities.create(
        {
            "name": "Mortgage",
            "liability_type": "mortgage",
            "currency": "CNY",
            "original_amount_minor": to_minor("300000.00", "CNY"),
            "outstanding_amount_minor": 0,
        }
    )
    before = networth.calculate()

    assets.purchase(
        {
            "name": "Flat",
            "asset_category_id": _category(assets, "Property"),
            "purchase_date": TODAY,
            "purchase_price_minor": to_minor("500000.00", "CNY"),
            "purchase_currency": "CNY",
            "linked_liability_id": mortgage.id,
            "payment": {
                "account_id": bank.id,
                "cash_amount_minor": to_minor("200000.00", "CNY"),
                "liability_account_id": mortgage.account_id,
                "financed_amount_minor": to_minor("300000.00", "CNY"),
            },
        }
    )

    after = networth.calculate()
    assert after.physical_assets_minor == to_minor("500000.00", "CNY")
    assert after.total_liabilities_minor - before.total_liabilities_minor == to_minor(
        "300000.00", "CNY"
    )
    contribution = after.physical_assets_minor - (
        after.total_liabilities_minor - before.total_liabilities_minor
    )
    assert contribution == to_minor("200000.00", "CNY")
    # Cash became equity: the 200,000 deposit is now inside the property.
    assert after.net_worth_minor == before.net_worth_minor


def test_financed_laptop_lowers_net_worth_by_its_full_price(
    accounts, assets, liabilities, networth
):
    """5. Laptop 20,000 = 8,000 cash + 12,000 financing, excluded: net worth -20,000."""
    bank = make_account(accounts, "招商银行", "CNY", "50000.00")
    financing = liabilities.create(
        {
            "name": "Laptop Financing",
            "liability_type": "financing",
            "currency": "CNY",
            "original_amount_minor": to_minor("12000.00", "CNY"),
            "outstanding_amount_minor": 0,
        }
    )
    before = networth.calculate()

    laptop = assets.purchase(
        {
            "name": "Laptop",
            "asset_category_id": _category(assets, "Electronics"),
            "purchase_date": TODAY,
            "purchase_price_minor": to_minor("20000.00", "CNY"),
            "purchase_currency": "CNY",
            "linked_liability_id": financing.id,
            "payment": {
                "account_id": bank.id,
                "cash_amount_minor": to_minor("8000.00", "CNY"),
                "liability_account_id": financing.account_id,
                "financed_amount_minor": to_minor("12000.00", "CNY"),
            },
        }
    )

    after = networth.calculate()
    assert laptop.include_in_net_worth is False
    assert accounts.balance_for(bank.id).balance_minor == to_minor("42000.00", "CNY")
    assert after.total_liabilities_minor - before.total_liabilities_minor == to_minor(
        "12000.00", "CNY"
    )
    assert after.physical_assets_minor == 0
    assert after.net_worth_minor == before.net_worth_minor - to_minor("20000.00", "CNY")
    # Holding cost tracking is unaffected by the classification.
    view = assets.view(laptop)
    assert view.holding_cost_per_day_minor == to_minor("20000.00", "CNY")


def test_manually_included_possession_enters_net_worth(accounts, assets, networth):
    """6. The same laptop, manually included, counts like a store of wealth."""
    bank = make_account(accounts, "招商银行", "CNY", "50000.00")
    before = networth.calculate()

    laptop = _buy(
        assets, "Laptop", "Electronics", "18000.00", account=bank, include_in_net_worth=True
    )

    after = networth.calculate()
    assert laptop.include_in_net_worth is True
    assert laptop.include_in_net_worth_manual is True
    assert after.physical_assets_minor == to_minor("18000.00", "CNY")
    assert after.net_worth_minor == before.net_worth_minor
    assert after.personal_possessions_minor == 0


def test_changing_the_flag_updates_net_worth_but_not_the_ledger(
    session, accounts, assets, networth
):
    """7. Toggling inclusion moves net worth at once and leaves history alone."""
    bank = make_account(accounts, "招商银行", "CNY", "50000.00")
    laptop = _buy(assets, "Laptop", "Electronics", "18000.00", account=bank)
    ledger_before = _ledger_snapshot(session)
    excluded = networth.calculate()

    assets.update(laptop.id, {"include_in_net_worth": True})
    included = networth.calculate()
    assert included.net_worth_minor == excluded.net_worth_minor + to_minor("18000.00", "CNY")
    assert included.total_assets_minor == excluded.total_assets_minor + to_minor(
        "18000.00", "CNY"
    )

    assets.update(laptop.id, {"include_in_net_worth": False})
    assert networth.calculate().net_worth_minor == excluded.net_worth_minor

    assert _ledger_snapshot(session) == ledger_before
    assert accounts.balance_for(bank.id).balance_minor == to_minor("32000.00", "CNY")


# ------------------------------------------------------ manual vs category


def test_null_resets_an_asset_to_its_category_default(assets):
    laptop = _buy(assets, "Laptop", "Electronics", "18000.00", include_in_net_worth=True)
    assets.update(laptop.id, {"include_in_net_worth": None})
    assert laptop.include_in_net_worth is False
    assert laptop.include_in_net_worth_manual is False


def test_recategorising_moves_an_asset_that_follows_its_category(assets, networth):
    thing = _buy(assets, "Thing", "Other", "1000.00")
    assert thing.include_in_net_worth is False
    assets.update(thing.id, {"asset_category_id": _category(assets, "Property")})
    assert thing.include_in_net_worth is True
    assert networth.calculate().physical_assets_minor == to_minor("1000.00", "CNY")


def test_recategorising_respects_a_manual_choice(assets):
    laptop = _buy(assets, "Laptop", "Electronics", "18000.00", include_in_net_worth=False)
    assets.update(laptop.id, {"asset_category_id": _category(assets, "Property")})
    assert laptop.include_in_net_worth is False
    assert laptop.include_in_net_worth_manual is True


def test_uncategorised_asset_is_a_personal_possession(assets):
    loose = _buy(assets, "Loose", None, "500.00")
    assert loose.include_in_net_worth is False


def test_category_default_change_moves_following_assets_only(assets):
    follows = _buy(assets, "Painting", "Collectibles", "5000.00")
    manual = _buy(assets, "Stamp", "Collectibles", "100.00", include_in_net_worth=False)
    assets.set_category_default(_category(assets, "Collectibles"), True)
    assert follows.include_in_net_worth is True
    assert manual.include_in_net_worth is False


def test_custom_investment_category_can_default_to_included(assets):
    category = assets.create_category("Investment Asset", include_in_net_worth_default=True)
    gold = assets.purchase(
        {
            "name": "Gold bar",
            "asset_category_id": category.id,
            "purchase_date": TODAY,
            "purchase_price_minor": to_minor("30000.00", "CNY"),
            "purchase_currency": "CNY",
        }
    )
    assert gold.include_in_net_worth is True


def test_sold_possession_is_neither_counted_nor_listed(accounts, assets, networth):
    bank = make_account(accounts, "招商银行", "CNY", "0.00")
    laptop = _buy(assets, "Laptop", "Electronics", "18000.00")
    assets.sell(
        laptop.id,
        {"sale_price_minor": to_minor("9000.00", "CNY"), "destination_account_id": bank.id},
    )
    result = networth.calculate()
    assert result.personal_possessions_minor == 0
    assert result.net_worth_minor == to_minor("9000.00", "CNY")
