"""Physical assets: purchase, valuation, holding cost and sale.

Holding-cost definitions used throughout the application (single source of
truth -- no page recomputes these):

    days_held        = elapsed whole days between purchase and the reference
                       date, floored at 1 so the purchase day itself is one day
    holding_cost/day = purchase price / days_held            (while held)
    net_cost         = purchase price - sale proceeds        (once sold)
    effective/day    = net_cost / ownership_days             (once sold)

Net worth uses the latest valuation when one exists and falls back to the
purchase price otherwise; the fallback is always reported so a user is never
shown an estimate that looks more current than it is.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy.orm import Session

from app.core.enums import AssetStatus
from app.core.exceptions import (
    ConflictError,
    FxRateUnavailableError,
    NotFoundError,
    ValidationError,
)
from app.core.logging import get_logger
from app.core.money import BASE_CURRENCY, convert_minor, is_supported
from app.models.asset import Asset, AssetCategory, AssetValuation
from app.repositories.assets import AssetRepository
from app.repositories.liabilities import LiabilityRepository
from app.services.fx_service import FxService

logger = get_logger(__name__)


def days_held(purchase_date: date, reference: date) -> int:
    """Elapsed whole days, floored at 1.

    An asset bought today has been held for one day, which keeps the
    cost-per-day figure finite on day one.
    """
    return max((reference - purchase_date).days, 1)


@dataclass
class AssetValuationView:
    value_minor: int
    currency: str
    base_minor: int | None
    valuation_date: date
    source: str  # "valuation" | "purchase_price"
    fx_freshness: str


@dataclass
class AssetView:
    asset: Asset
    current_value: AssetValuationView | None
    days_held: int
    holding_cost_per_day_minor: int | None
    net_cost_minor: int | None
    effective_cost_per_day_minor: int | None
    category_name: str | None
    liability_name: str | None

    @property
    def is_holding(self) -> bool:
        return self.asset.status == AssetStatus.HOLDING.value


class AssetService:
    def __init__(self, session: Session, fx: FxService, ledger=None) -> None:
        self.session = session
        self.repo = AssetRepository(session)
        self.fx = fx
        #: Optional so read-only callers (net worth, reports) need no ledger.
        self.ledger = ledger

    # ------------------------------------------------------------ helpers

    def _to_base(self, amount_minor: int, currency: str, on: date | None = None):
        if currency == BASE_CURRENCY:
            return amount_minor, "identity"
        try:
            resolved = self.fx.rate_to_base(currency, on)
        except FxRateUnavailableError:
            return None, "missing"
        return convert_minor(amount_minor, currency, BASE_CURRENCY, resolved.rate), resolved.freshness

    @staticmethod
    def _per_day(amount_minor: int, days: int) -> int:
        """Cost per day in minor units, rounded half up."""
        if days <= 0:
            return amount_minor
        return int(
            (Decimal(amount_minor) / Decimal(days)).quantize(Decimal(1), rounding=ROUND_HALF_UP)
        )

    def current_value(self, asset: Asset) -> AssetValuationView | None:
        """Latest valuation, or the purchase price clearly labelled as such."""
        latest = self.repo.latest_valuation(asset.id)
        if latest is not None:
            base, freshness = self._to_base(latest.value_minor, latest.currency)
            return AssetValuationView(
                value_minor=latest.value_minor,
                currency=latest.currency,
                base_minor=base,
                valuation_date=latest.valuation_date,
                source="valuation",
                fx_freshness=freshness,
            )
        base, freshness = self._to_base(asset.purchase_price_minor, asset.purchase_currency)
        return AssetValuationView(
            value_minor=asset.purchase_price_minor,
            currency=asset.purchase_currency,
            base_minor=base,
            valuation_date=asset.purchase_date,
            source="purchase_price",
            fx_freshness=freshness,
        )

    def view(self, asset: Asset, *, today: date | None = None) -> AssetView:
        today = today or date.today()
        category = (
            self.repo.get_category(asset.asset_category_id) if asset.asset_category_id else None
        )
        liability_name = None
        if asset.linked_liability_id:
            liability = LiabilityRepository(self.session).get(asset.linked_liability_id)
            liability_name = liability.name if liability else None

        if asset.status == AssetStatus.HOLDING.value:
            held = days_held(asset.purchase_date, today)
            return AssetView(
                asset=asset,
                current_value=self.current_value(asset),
                days_held=held,
                holding_cost_per_day_minor=self._per_day(asset.purchase_price_minor, held),
                net_cost_minor=None,
                effective_cost_per_day_minor=None,
                category_name=category.name if category else None,
                liability_name=liability_name,
            )

        end = asset.sale_date or today
        held = days_held(asset.purchase_date, end)
        proceeds = asset.sale_price_minor or 0
        # Sale proceeds may be in another currency; compare like with like by
        # using the base values frozen on each side.
        if asset.sale_currency and asset.sale_currency != asset.purchase_currency:
            purchase_side = asset.purchase_base_minor
            sale_side = asset.sale_base_minor or 0
        else:
            purchase_side = asset.purchase_price_minor
            sale_side = proceeds
        net_cost = purchase_side - sale_side
        return AssetView(
            asset=asset,
            current_value=None,
            days_held=held,
            holding_cost_per_day_minor=None,
            net_cost_minor=net_cost,
            effective_cost_per_day_minor=self._per_day(net_cost, held),
            category_name=category.name if category else None,
            liability_name=liability_name,
        )

    def list_views(self, *, status: str | None = None, today: date | None = None) -> list[AssetView]:
        return [self.view(asset, today=today) for asset in self.repo.list(status=status)]

    def get(self, asset_id: int) -> Asset:
        asset = self.repo.get(asset_id)
        if asset is None:
            raise NotFoundError(f"Asset {asset_id} was not found.")
        return asset

    # ------------------------------------------------------------ commands

    def create(self, data: dict) -> Asset:
        name = (data.get("name") or "").strip()
        if not name:
            raise ValidationError("Asset name is required.")
        currency = (data.get("purchase_currency") or BASE_CURRENCY).upper()
        if not is_supported(currency):
            raise ValidationError(f"Currency {currency} is not supported.")
        price = int(data.get("purchase_price_minor") or 0)
        if price <= 0:
            raise ValidationError("Purchase price must be greater than zero.")
        purchase_date: date = data["purchase_date"]
        if purchase_date > date.today():
            raise ValidationError("Purchase date cannot be in the future.")
        if data.get("asset_category_id") is not None:
            if self.repo.get_category(int(data["asset_category_id"])) is None:
                raise NotFoundError(f"Asset category {data['asset_category_id']} was not found.")

        base, _ = self._to_base(price, currency, purchase_date)
        asset = Asset(
            name=name,
            asset_category_id=data.get("asset_category_id"),
            description=data.get("description"),
            purchase_date=purchase_date,
            purchase_price_minor=price,
            purchase_currency=currency,
            purchase_base_minor=base if base is not None else 0,
            status=AssetStatus.HOLDING.value,
            include_in_net_worth=bool(data.get("include_in_net_worth", True)),
            linked_liability_id=data.get("linked_liability_id"),
            note=data.get("note"),
        )
        self.repo.add(asset)
        self.session.flush()
        logger.info("asset_created id=%s", asset.id)
        return asset

    def purchase(self, data: dict) -> Asset:
        """Create an asset and, when a payment is supplied, record it atomically.

        Leaving the payment out is the right choice for something you already
        owned before you started using OpenISave: the asset simply joins your
        net worth without any cash movement.
        """
        asset = self.create(data)
        payment = data.get("payment") or {}
        cash_account_id = payment.get("account_id")
        liability_account_id = payment.get("liability_account_id")

        if cash_account_id is not None or liability_account_id is not None:
            if self.ledger is None:  # pragma: no cover - wiring guard
                raise ConflictError("Payment tracking is unavailable in this context.")
            financed = int(payment.get("financed_amount_minor") or 0)
            if payment.get("cash_amount_minor") is not None:
                cash = int(payment["cash_amount_minor"])
            else:
                cash = asset.purchase_price_minor - financed
            self.ledger.create_asset_purchase(
                asset_id=asset.id,
                asset_name=asset.name,
                price_minor=asset.purchase_price_minor,
                currency=asset.purchase_currency,
                tx_date=asset.purchase_date,
                cash_account_id=cash_account_id,
                cash_amount_minor=cash,
                liability_account_id=liability_account_id,
                financed_amount_minor=financed,
            )
        self.session.commit()
        return asset

    def sell(self, asset_id: int, data: dict) -> Asset:
        """Mark an asset sold and, when given a destination, bank the proceeds."""
        asset = self.mark_sold(asset_id, data)
        destination = data.get("destination_account_id")
        if destination is not None and (asset.sale_price_minor or 0) > 0:
            if self.ledger is None:  # pragma: no cover - wiring guard
                raise ConflictError("Payment tracking is unavailable in this context.")
            self.ledger.create_asset_sale(
                asset_id=asset.id,
                asset_name=asset.name,
                proceeds_minor=asset.sale_price_minor or 0,
                currency=asset.sale_currency or asset.purchase_currency,
                tx_date=asset.sale_date or date.today(),
                destination_account_id=destination,
            )
        self.session.commit()
        return asset

    def update(self, asset_id: int, data: dict) -> Asset:
        asset = self.get(asset_id)
        if data.get("name"):
            asset.name = data["name"].strip()
        for field_name in ("description", "note", "asset_category_id", "linked_liability_id"):
            if field_name in data:
                setattr(asset, field_name, data[field_name])
        if data.get("include_in_net_worth") is not None:
            asset.include_in_net_worth = bool(data["include_in_net_worth"])
        self.session.commit()
        logger.info("asset_updated id=%s", asset.id)
        return asset

    def add_valuation(self, asset_id: int, data: dict) -> AssetValuation:
        asset = self.get(asset_id)
        value = int(data.get("value_minor") or 0)
        if value < 0:
            raise ValidationError("A valuation cannot be negative.")
        currency = (data.get("currency") or asset.purchase_currency).upper()
        if not is_supported(currency):
            raise ValidationError(f"Currency {currency} is not supported.")
        valuation_date: date = data.get("valuation_date") or date.today()
        if valuation_date < asset.purchase_date:
            raise ValidationError("A valuation cannot predate the purchase.")
        valuation = self.repo.add_valuation(
            AssetValuation(
                asset_id=asset.id,
                valuation_date=valuation_date,
                value_minor=value,
                currency=currency,
                note=data.get("note"),
            )
        )
        self.session.commit()
        logger.info("asset_valuation_added asset=%s", asset.id)
        return valuation

    def delete_valuation(self, asset_id: int, valuation_id: int) -> None:
        self.get(asset_id)
        valuation = self.repo.get_valuation(valuation_id)
        if valuation is None or valuation.asset_id != asset_id:
            raise NotFoundError(f"Valuation {valuation_id} was not found on this asset.")
        self.repo.delete_valuation(valuation)
        self.session.commit()

    def mark_sold(self, asset_id: int, data: dict) -> Asset:
        asset = self.get(asset_id)
        if asset.status != AssetStatus.HOLDING.value:
            raise ConflictError(f"'{asset.name}' is no longer held.")
        proceeds = int(data.get("sale_price_minor") or 0)
        if proceeds < 0:
            raise ValidationError("Sale price cannot be negative.")
        currency = (data.get("sale_currency") or asset.purchase_currency).upper()
        if not is_supported(currency):
            raise ValidationError(f"Currency {currency} is not supported.")
        sale_date: date = data.get("sale_date") or date.today()
        if sale_date < asset.purchase_date:
            raise ValidationError("Sale date cannot precede the purchase date.")
        if sale_date > date.today():
            raise ValidationError("Sale date cannot be in the future.")

        base, _ = self._to_base(proceeds, currency, sale_date)
        asset.status = AssetStatus(
            data.get("status") or AssetStatus.SOLD.value
        ).value
        asset.sale_date = sale_date
        asset.sale_price_minor = proceeds
        asset.sale_currency = currency
        asset.sale_base_minor = base if base is not None else 0
        self.session.flush()
        logger.info("asset_sold id=%s", asset.id)
        return asset

    def delete(self, asset_id: int) -> None:
        asset = self.get(asset_id)
        self.repo.delete(asset)
        self.session.commit()
        logger.info("asset_deleted id=%s", asset_id)

    # ---------------------------------------------------------- categories

    def categories(self) -> list[AssetCategory]:
        return self.repo.categories()

    def create_category(self, name: str) -> AssetCategory:
        clean = name.strip()
        if not clean:
            raise ValidationError("Category name is required.")
        if self.repo.category_by_name(clean) is not None:
            raise ConflictError(f"An asset category named '{clean}' already exists.")
        category = self.repo.add_category(AssetCategory(name=clean, sort_order=999))
        self.session.commit()
        return category

    # --------------------------------------------------------- aggregation

    def net_worth_contribution(self) -> tuple[int, list[str]]:
        """Total base-currency value of held assets, plus any that lack a rate."""
        total = 0
        unconverted: list[str] = []
        for asset in self.repo.list_holding():
            if not asset.include_in_net_worth:
                continue
            value = self.current_value(asset)
            if value is None or value.base_minor is None:
                unconverted.append(asset.name)
                continue
            total += value.base_minor
        return total, unconverted
