from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import Field, field_validator, model_validator

from app.core.enums import AssetStatus, LiabilityType
from app.schemas.common import ApiModel, CurrencyMixin, validate_currency


# ---------------------------------------------------------------- categories

class AssetCategoryRead(ApiModel):
    id: int
    name: str
    sort_order: int
    is_active: bool
    include_in_net_worth_default: bool


class AssetCategoryCreate(ApiModel):
    name: str = Field(min_length=1, max_length=80)
    include_in_net_worth_default: bool = False


class AssetCategoryUpdate(ApiModel):
    include_in_net_worth_default: bool


# -------------------------------------------------------------------- assets

class AssetPayment(ApiModel):
    """How a purchase was funded. Omit entirely for something already owned."""

    account_id: int | None = None
    cash_amount_minor: int | None = Field(default=None, ge=0)
    liability_account_id: int | None = None
    financed_amount_minor: int = Field(default=0, ge=0)


class AssetCreate(ApiModel, CurrencyMixin):
    name: str = Field(min_length=1, max_length=160)
    asset_category_id: int | None = None
    description: str | None = None
    purchase_date: date
    purchase_price_minor: int = Field(gt=0)
    purchase_currency: str = Field(default="CNY", min_length=3, max_length=3)
    #: Omit (or null) to follow the category default; a bool is a manual choice.
    include_in_net_worth: bool | None = None
    linked_liability_id: int | None = None
    note: str | None = None
    payment: AssetPayment | None = None

    @field_validator("purchase_currency")
    @classmethod
    def _currency(cls, value: str) -> str:
        return validate_currency(value)

    @model_validator(mode="after")
    def _payment_adds_up(self) -> "AssetCreate":
        payment = self.payment
        if payment is None:
            return self
        if payment.account_id is None and payment.liability_account_id is None:
            return self
        cash = payment.cash_amount_minor
        if cash is None:
            cash = self.purchase_price_minor - payment.financed_amount_minor
        if cash < 0:
            raise ValueError("The financed amount cannot exceed the purchase price")
        if cash + payment.financed_amount_minor != self.purchase_price_minor:
            raise ValueError("Amount paid plus amount financed must equal the purchase price")
        if payment.financed_amount_minor > 0 and payment.liability_account_id is None:
            raise ValueError("Choose the liability account that carries the financed amount")
        if cash > 0 and payment.account_id is None:
            raise ValueError("Choose the account the cash was paid from")
        return self


class AssetUpdate(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    asset_category_id: int | None = None
    description: str | None = None
    #: Absent: unchanged. Null: follow the category default. Bool: manual choice.
    include_in_net_worth: bool | None = None
    linked_liability_id: int | None = None
    note: str | None = None


class AssetSale(ApiModel):
    sale_date: date | None = None
    sale_price_minor: int = Field(ge=0)
    sale_currency: str | None = None
    destination_account_id: int | None = None
    status: AssetStatus = AssetStatus.SOLD

    @field_validator("sale_currency")
    @classmethod
    def _currency(cls, value: str | None) -> str | None:
        return validate_currency(value) if value else value


class AssetValuationCreate(ApiModel):
    valuation_date: date | None = None
    value_minor: int = Field(ge=0)
    currency: str | None = None
    note: str | None = None

    @field_validator("currency")
    @classmethod
    def _currency(cls, value: str | None) -> str | None:
        return validate_currency(value) if value else value


class AssetValuationRead(ApiModel):
    id: int
    asset_id: int
    valuation_date: date
    value_minor: int
    currency: str
    note: str | None
    created_at: datetime


class CurrentValueRead(ApiModel):
    value_minor: int
    currency: str
    base_minor: int | None
    valuation_date: date
    source: str
    fx_freshness: str


class AssetRead(ApiModel):
    id: int
    name: str
    asset_category_id: int | None
    category_name: str | None
    description: str | None
    purchase_date: date
    purchase_price_minor: int
    purchase_currency: str
    purchase_base_minor: int
    status: str
    sale_date: date | None
    sale_price_minor: int | None
    sale_currency: str | None
    sale_base_minor: int | None
    include_in_net_worth: bool
    #: "category" when the flag follows the category default, "manual" otherwise.
    include_in_net_worth_source: str
    linked_liability_id: int | None
    liability_name: str | None
    note: str | None
    current_value: CurrentValueRead | None
    days_held: int
    holding_cost_per_day_minor: int | None
    net_cost_minor: int | None
    effective_cost_per_day_minor: int | None
    created_at: datetime
    updated_at: datetime


class AssetDetailRead(AssetRead):
    valuations: list[AssetValuationRead]


# --------------------------------------------------------------- liabilities

class LiabilityCreate(ApiModel, CurrencyMixin):
    name: str = Field(min_length=1, max_length=120)
    liability_type: LiabilityType = LiabilityType.OTHER
    currency: str = Field(default="CNY", min_length=3, max_length=3)
    account_id: int | None = None
    original_amount_minor: int = Field(default=0, ge=0)
    outstanding_amount_minor: int | None = Field(default=None, ge=0)
    start_date: date | None = None
    end_date: date | None = None
    interest_rate_percent: Decimal | None = Field(default=None, ge=0)
    lender: str | None = Field(default=None, max_length=120)
    note: str | None = None

    @field_validator("currency")
    @classmethod
    def _currency(cls, value: str) -> str:
        return validate_currency(value)


class LiabilityUpdate(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    liability_type: LiabilityType | None = None
    original_amount_minor: int | None = Field(default=None, ge=0)
    start_date: date | None = None
    end_date: date | None = None
    interest_rate_percent: Decimal | None = Field(default=None, ge=0)
    lender: str | None = None
    note: str | None = None


class LiabilityRead(ApiModel):
    id: int
    name: str
    liability_type: str
    account_id: int
    account_name: str
    currency: str
    original_amount_minor: int
    outstanding_minor: int
    base_outstanding_minor: int | None
    repaid_minor: int
    repaid_percent: float | None
    fx_freshness: str
    start_date: date | None
    end_date: date | None
    interest_rate_percent: Decimal | None
    lender: str | None
    note: str | None
    linked_asset_names: list[str]
    created_at: datetime


class LiabilityRepayment(ApiModel):
    from_account_id: int
    amount_minor: int = Field(gt=0)
    transaction_date: date | None = None
    description: str | None = None
