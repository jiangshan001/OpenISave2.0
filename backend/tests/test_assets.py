"""Physical assets: purchase, valuation, holding cost, sale and net worth."""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.core.exceptions import ConflictError, ValidationError
from app.core.money import to_minor
from app.services.asset_service import days_held
from tests.conftest import make_account

TODAY = date.today()


def _category(assets, name="Electronics") -> int:
    return next(row.id for row in assets.categories() if row.name == name)


def _macbook(assets, *, purchase_date=None, price="18000.00", payment=None, **kwargs):
    data = {
        "name": "MacBook Pro",
        "asset_category_id": _category(assets),
        "purchase_date": purchase_date or date(2026, 1, 1),
        "purchase_price_minor": to_minor(price, "CNY"),
        "purchase_currency": "CNY",
        "include_in_net_worth": True,
        "payment": payment,
    }
    data.update(kwargs)
    return assets.purchase(data)


# ------------------------------------------------------------ days held


def test_days_held_is_elapsed_days():
    assert days_held(date(2026, 1, 1), date(2026, 9, 22)) == 264
    assert days_held(date(2026, 1, 1), date(2026, 1, 2)) == 1


def test_days_held_on_the_purchase_day_is_one():
    assert days_held(date(2026, 1, 1), date(2026, 1, 1)) == 1


def test_days_held_is_leap_year_aware():
    assert days_held(date(2024, 1, 1), date(2024, 3, 1)) == 60


# ------------------------------------------------------------- creation


def test_create_asset_records_purchase_details(assets):
    asset = _macbook(assets)
    assert asset.name == "MacBook Pro"
    assert asset.purchase_price_minor == to_minor("18000.00", "CNY")
    assert asset.purchase_currency == "CNY"
    assert asset.status == "holding"


def test_holding_cost_per_day(assets):
    asset = _macbook(assets)
    view = assets.view(asset, today=date(2026, 9, 22))
    assert view.days_held == 264
    # 18,000 / 264 = 68.18 per day
    assert view.holding_cost_per_day_minor == to_minor("68.18", "CNY")


def test_purchase_price_must_be_positive(assets):
    with pytest.raises(ValidationError):
        assets.purchase(
            {
                "name": "Nothing",
                "purchase_date": TODAY,
                "purchase_price_minor": 0,
                "purchase_currency": "CNY",
            }
        )


def test_purchase_date_cannot_be_in_the_future(assets):
    with pytest.raises(ValidationError):
        _macbook(assets, purchase_date=TODAY + timedelta(days=1))


# ------------------------------------------------------------ valuation


def test_value_falls_back_to_purchase_price_and_says_so(assets):
    asset = _macbook(assets)
    value = assets.current_value(asset)
    assert value.value_minor == to_minor("18000.00", "CNY")
    assert value.source == "purchase_price"


def test_latest_valuation_wins(assets):
    asset = _macbook(assets)
    assets.add_valuation(
        asset.id, {"value_minor": to_minor("14000.00", "CNY"), "valuation_date": date(2026, 6, 1)}
    )
    assets.add_valuation(
        asset.id, {"value_minor": to_minor("12000.00", "CNY"), "valuation_date": date(2026, 9, 1)}
    )
    value = assets.current_value(asset)
    assert value.value_minor == to_minor("12000.00", "CNY")
    assert value.source == "valuation"
    assert value.valuation_date == date(2026, 9, 1)


def test_valuation_history_is_kept(assets):
    asset = _macbook(assets)
    for when, amount in [
        (date(2026, 1, 1), "18000.00"),
        (date(2026, 6, 1), "14000.00"),
        (date(2027, 1, 1), "11000.00"),
    ]:
        assets.add_valuation(
            asset.id, {"value_minor": to_minor(amount, "CNY"), "valuation_date": when}
        )
    history = assets.repo.valuations(asset.id)
    assert [row.value_minor for row in history] == [
        to_minor("11000.00", "CNY"),
        to_minor("14000.00", "CNY"),
        to_minor("18000.00", "CNY"),
    ]


def test_valuation_cannot_predate_purchase(assets):
    asset = _macbook(assets)
    with pytest.raises(ValidationError):
        assets.add_valuation(
            asset.id,
            {"value_minor": to_minor("1.00", "CNY"), "valuation_date": date(2025, 12, 31)},
        )


# ----------------------------------------------------- purchase and ledger


def test_purchase_from_an_account_moves_cash_but_not_net_worth(
    accounts, assets, networth
):
    cmb = make_account(accounts, "招商银行", "CNY", "50000.00")
    before = networth.calculate().net_worth_minor

    _macbook(assets, payment={"account_id": cmb.id, "financed_amount_minor": 0})

    assert accounts.balance_for(cmb.id).balance_minor == to_minor("32000.00", "CNY")
    after = networth.calculate()
    assert after.net_worth_minor == before
    assert after.physical_assets_minor == to_minor("18000.00", "CNY")


def test_purchase_is_not_an_expense(accounts, assets, dashboard):
    cmb = make_account(accounts, "招商银行", "CNY", "50000.00")
    _macbook(
        assets,
        purchase_date=TODAY,
        payment={"account_id": cmb.id, "financed_amount_minor": 0},
    )
    data = dashboard.build(TODAY)
    assert data["month_expense_minor"] == 0
    assert data["month_income_minor"] == 0


def test_purchase_postings_balance_to_zero(accounts, assets, ledger):
    cmb = make_account(accounts, "招商银行", "CNY", "50000.00")
    asset = _macbook(
        assets,
        purchase_date=TODAY,
        payment={"account_id": cmb.id, "financed_amount_minor": 0},
    )
    transaction = ledger.list(limit=5)[0]
    assert transaction.type == "asset_purchase"
    assert transaction.asset_id == asset.id
    assert sum(posting.base_amount_minor for posting in transaction.postings) == 0


def test_asset_without_payment_simply_joins_net_worth(assets, networth):
    """Recording something you already owned should not invent a cash movement."""
    before = networth.calculate().net_worth_minor
    _macbook(assets)
    after = networth.calculate()
    assert after.net_worth_minor == before + to_minor("18000.00", "CNY")


def test_payment_must_match_the_purchase_price(accounts, assets):
    cmb = make_account(accounts, "招商银行", "CNY", "50000.00")
    with pytest.raises(ValidationError):
        _macbook(
            assets,
            payment={
                "account_id": cmb.id,
                "cash_amount_minor": to_minor("10000.00", "CNY"),
                "financed_amount_minor": 0,
            },
        )


def test_payment_account_currency_must_match(accounts, assets):
    monzo = make_account(accounts, "Monzo", "GBP", "5000.00")
    with pytest.raises(ValidationError):
        _macbook(assets, payment={"account_id": monzo.id, "financed_amount_minor": 0})


# ----------------------------------------------------------------- sale


def test_selling_banks_the_proceeds_and_retires_the_asset(accounts, assets, networth):
    cmb = make_account(accounts, "招商银行", "CNY", "50000.00")
    asset = _macbook(assets, payment={"account_id": cmb.id, "financed_amount_minor": 0})
    assets.add_valuation(asset.id, {"value_minor": to_minor("12000.00", "CNY")})

    before = networth.calculate()
    assert before.physical_assets_minor == to_minor("12000.00", "CNY")

    assets.sell(
        asset.id,
        {
            "sale_date": date(2026, 9, 22),
            "sale_price_minor": to_minor("8000.00", "CNY"),
            "sale_currency": "CNY",
            "destination_account_id": cmb.id,
            "status": "sold",
        },
    )

    assert accounts.balance_for(cmb.id).balance_minor == to_minor("40000.00", "CNY")
    after = networth.calculate()
    assert after.physical_assets_minor == 0
    # Sold a 12,000 asset for 8,000: net worth falls by the 4,000 shortfall.
    assert after.net_worth_minor == before.net_worth_minor - to_minor("4000.00", "CNY")


def test_sale_is_not_income(accounts, assets, dashboard):
    cmb = make_account(accounts, "招商银行", "CNY", "50000.00")
    asset = _macbook(
        assets, purchase_date=TODAY, payment={"account_id": cmb.id, "financed_amount_minor": 0}
    )
    assets.sell(
        asset.id,
        {
            "sale_date": TODAY,
            "sale_price_minor": to_minor("8000.00", "CNY"),
            "destination_account_id": cmb.id,
        },
    )
    data = dashboard.build(TODAY)
    assert data["month_income_minor"] == 0
    assert data["month_expense_minor"] == 0


def test_net_ownership_cost_and_effective_cost_per_day(assets):
    purchase = TODAY - timedelta(days=800)
    asset = _macbook(assets, purchase_date=purchase)
    assets.sell(
        asset.id,
        {"sale_date": TODAY, "sale_price_minor": to_minor("8000.00", "CNY")},
    )
    view = assets.view(asset)
    assert view.days_held == 800
    assert view.net_cost_minor == to_minor("10000.00", "CNY")
    # 10,000 / 800 = 12.50 per day
    assert view.effective_cost_per_day_minor == to_minor("12.50", "CNY")


def test_sold_asset_keeps_its_history(assets):
    asset = _macbook(assets)
    assets.sell(
        asset.id,
        {"sale_date": date(2026, 9, 22), "sale_price_minor": to_minor("8000.00", "CNY")},
    )
    stored = assets.get(asset.id)
    assert stored.status == "sold"
    assert stored.purchase_price_minor == to_minor("18000.00", "CNY")
    assert stored.purchase_date == date(2026, 1, 1)
    assert stored.sale_price_minor == to_minor("8000.00", "CNY")


def test_cannot_sell_twice(assets):
    asset = _macbook(assets)
    assets.sell(asset.id, {"sale_price_minor": to_minor("8000.00", "CNY")})
    with pytest.raises(ConflictError):
        assets.sell(asset.id, {"sale_price_minor": to_minor("1000.00", "CNY")})


def test_sale_date_cannot_precede_purchase(assets):
    asset = _macbook(assets)
    with pytest.raises(ValidationError):
        assets.sell(
            asset.id,
            {"sale_date": date(2025, 1, 1), "sale_price_minor": to_minor("100.00", "CNY")},
        )


# ------------------------------------------------------- multi-currency


def test_foreign_asset_is_valued_in_cny(assets, networth):
    asset = assets.purchase(
        {
            "name": "Camera",
            "purchase_date": date(2026, 1, 1),
            "purchase_price_minor": to_minor("1000.00", "GBP"),
            "purchase_currency": "GBP",
            "include_in_net_worth": True,
        }
    )
    assert asset.purchase_currency == "GBP"
    assert asset.purchase_price_minor == to_minor("1000.00", "GBP")
    # 1,000 GBP at the stubbed 9.65
    assert networth.calculate().physical_assets_minor == to_minor("9650.00", "CNY")


def test_asset_excluded_from_net_worth_is_not_counted(assets, networth):
    _macbook(assets, include_in_net_worth=False)
    assert networth.calculate().physical_assets_minor == 0


def test_asset_without_a_rate_is_reported_not_guessed(session, fx_empty):
    from app.services.account_service import AccountService
    from app.services.asset_service import AssetService
    from app.services.networth_service import NetWorthService

    asset_service = AssetService(session, fx_empty)
    asset_service.purchase(
        {
            "name": "Camera",
            "purchase_date": date(2026, 1, 1),
            "purchase_price_minor": to_minor("1000.00", "GBP"),
            "purchase_currency": "GBP",
            "include_in_net_worth": True,
        }
    )
    result = NetWorthService(
        session, AccountService(session, fx_empty), asset_service
    ).calculate()
    assert result.physical_assets_minor == 0
    assert result.unconverted_accounts == ["Camera"]
