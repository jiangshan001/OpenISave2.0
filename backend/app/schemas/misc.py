"""Schemas for categories, budgets, FX and settings."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import Field, field_validator

from app.core.enums import CategoryKind
from app.schemas.common import ApiModel, validate_currency


# ------------------------------------------------------------------ categories

class CategoryCreate(ApiModel):
    name: str = Field(min_length=1, max_length=80)
    kind: CategoryKind
    parent_id: int | None = None
    sort_order: int = 0


class CategoryRead(ApiModel):
    id: int
    name: str
    kind: str
    parent_id: int | None
    sort_order: int
    is_active: bool
    depth: int = 0
    transaction_count: int = 0
    subtree_transaction_count: int = 0


class CategoryUpdate(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    parent_id: int | None = None
    sort_order: int | None = None
    is_active: bool | None = None


# --------------------------------------------------------------------- budgets

class BudgetEntry(ApiModel):
    category_id: int
    amount_minor: int = Field(ge=0)


class BudgetSave(ApiModel):
    entries: list[BudgetEntry]


class OverallBudgetSave(ApiModel):
    overall_limit_minor: int | None = Field(..., gt=0, le=9_007_199_254_740_991, strict=True)


class BudgetLineRead(ApiModel):
    category_id: int
    category_name: str
    parent_name: str | None
    budget_minor: int
    actual_minor: int
    remaining_minor: int
    used_percent: float | None


class BudgetPeriodRead(ApiModel):
    year: int
    month: int
    currency: str
    total_budget_minor: int
    total_actual_minor: int
    total_remaining_minor: int
    overall_limit_minor: int | None
    overall_actual_minor: int
    overall_remaining_minor: int | None
    overall_used_percent: float | None
    lines: list[BudgetLineRead]


# -------------------------------------------------------------------------- fx

class FxRateStatus(ApiModel):
    from_currency: str
    to_currency: str
    rate: str | None
    rate_date: str | None
    source: str | None
    freshness: str
    age_days: int | None


class FxManualRate(ApiModel):
    from_currency: str
    to_currency: str
    rate: Decimal = Field(gt=0)
    rate_date: date | None = None

    @field_validator("from_currency", "to_currency")
    @classmethod
    def _codes(cls, value: str) -> str:
        return validate_currency(value)


class FxRefreshResult(ApiModel):
    ok: bool
    updated: int
    message: str
    rates: list[FxRateStatus]


# -------------------------------------------------------------------- settings

class SettingsRead(ApiModel):
    base_currency: str
    timezone: str
    locale: str
    fx_stale_after_days: int
    supported_currencies: list[str]


class SettingsUpdate(ApiModel):
    timezone: str | None = Field(default=None, max_length=64)
    locale: str | None = Field(default=None, max_length=16)
    fx_stale_after_days: int | None = Field(default=None, ge=1, le=365)
