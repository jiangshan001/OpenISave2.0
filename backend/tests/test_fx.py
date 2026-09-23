from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.core.exceptions import FxRateUnavailableError
from app.core.money import to_minor
from app.services.fx_service import FxService
from tests.conftest import StubFxProvider, category_id, make_account, seed_rate

TODAY = date.today()


def test_missing_rate_raises_instead_of_defaulting_to_one(session, fx_empty):
    with pytest.raises(FxRateUnavailableError) as excinfo:
        fx_empty.rate_to_base("GBP")
    assert "GBP/CNY" in str(excinfo.value)


def test_missing_rate_is_never_silently_one(session, fx_empty):
    # The failure mode this guards against: a 1.0 fallback that would value
    # GBP 100 at CNY 100.
    try:
        rate = fx_empty.rate_to_base("GBP").rate
    except FxRateUnavailableError:
        rate = None
    assert rate is None or rate != Decimal(1)


def test_refresh_populates_the_cache(session):
    service = FxService(session, StubFxProvider())
    result = service.refresh()
    assert result["ok"] is True and result["updated"] == 6
    assert service.rate_to_base("GBP").rate == Decimal("9.6500000000")


def test_provider_failure_leaves_cached_rates_usable(session):
    FxService(session, StubFxProvider()).refresh()
    offline = FxService(session, StubFxProvider(fail=True))
    result = offline.refresh()
    assert result["ok"] is False
    assert offline.rate_to_base("GBP").rate == Decimal("9.6500000000")


def test_stale_rate_is_flagged_but_still_returned(session):
    old = TODAY - timedelta(days=30)
    seed_rate(session, "GBP", "9.1000", old)
    service = FxService(session, StubFxProvider(fail=True), stale_after_days=3)
    resolved = service.rate_to_base("GBP")
    assert resolved.rate == Decimal("9.1000000000")
    assert resolved.freshness == "stale"


def test_fresh_rate_is_flagged_fresh(session):
    seed_rate(session, "GBP", "9.6500", TODAY)
    service = FxService(session, StubFxProvider(fail=True), stale_after_days=3)
    assert service.rate_to_base("GBP").freshness == "fresh"


def test_manual_rate_is_accepted_and_used(session):
    service = FxService(session, StubFxProvider(fail=True))
    service.set_manual_rate("GBP", "CNY", Decimal("9.3000"))
    resolved = service.rate_to_base("GBP")
    assert resolved.rate == Decimal("9.3000000000")
    assert resolved.source == "manual"


def test_cross_rate_is_derived_through_the_base_currency(session, fx):
    # GBP->CNY 9.65 and USD->CNY 7.12 give GBP->USD ~= 1.3553
    resolved = fx.resolve_rate("GBP", "USD")
    assert resolved.rate == Decimal("1.3553370787")


def test_identity_rate_for_the_same_currency(fx):
    resolved = fx.resolve_rate("CNY", "CNY")
    assert resolved.rate == Decimal(1)
    assert resolved.freshness == "identity"


def test_status_reports_missing_currencies(session, fx_empty):
    rows = {row["from_currency"]: row for row in fx_empty.status()}
    assert rows["GBP"]["freshness"] == "missing"
    assert rows["GBP"]["rate"] is None


def test_historical_fx_is_frozen_on_the_transaction(session, accounts, ledger, fx):
    """A later rate change must not move a past transaction's CNY value."""
    monzo = make_account(accounts, "Monzo", "GBP", "2000.00")
    tx = ledger.create_transaction(
        {
            "type": "expense",
            "account_id": monzo.id,
            "amount_minor": to_minor("100.00", "GBP"),
            "transaction_date": TODAY,
            "description": "Historic purchase",
            "category_id": category_id(session, "Groceries"),
        }
    )
    frozen_value = tx.base_amount_minor
    frozen_rate = Decimal(tx.fx_rate_to_base)
    assert frozen_value == to_minor("965.00", "CNY")

    fx.set_manual_rate("GBP", "CNY", Decimal("12.0000"))

    reloaded = ledger.get(tx.id)
    assert reloaded.base_amount_minor == frozen_value
    assert Decimal(reloaded.fx_rate_to_base) == frozen_rate


def test_current_net_worth_uses_the_latest_rate(session, accounts, networth, fx):
    make_account(accounts, "Monzo", "GBP", "1000.00")
    assert networth.calculate().net_worth_minor == to_minor("9650.00", "CNY")
    fx.set_manual_rate("GBP", "CNY", Decimal("10.0000"))
    assert networth.calculate().net_worth_minor == to_minor("10000.00", "CNY")


def test_account_without_a_rate_is_excluded_from_totals(session, fx_empty):
    from app.services.account_service import AccountService
    from app.services.networth_service import NetWorthService

    service = AccountService(session, fx_empty)
    make_account(service, "招商银行", "CNY", "20000.00")
    make_account(service, "Monzo", "GBP", "2000.00")
    result = NetWorthService(session, service).calculate()
    assert result.net_worth_minor == to_minor("20000.00", "CNY")
    assert result.unconverted_accounts == ["Monzo"]
