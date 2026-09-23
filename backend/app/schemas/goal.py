from __future__ import annotations

from datetime import date, datetime

from pydantic import Field, field_validator, model_validator

from app.core.enums import GoalSelectionMode
from app.schemas.common import ApiModel, CurrencyMixin, validate_currency


class GoalBase(ApiModel):
    target_amount_minor: int | None = Field(default=None, gt=0)
    deadline: date | None = None
    selection_mode: GoalSelectionMode = GoalSelectionMode.SELECTED
    account_ids: list[int] = Field(default_factory=list)
    note: str | None = None


class GoalCreate(GoalBase, CurrencyMixin):
    name: str = Field(min_length=1, max_length=120)
    currency: str
    sort_order: int = 0

    @model_validator(mode="after")
    def _selected_mode_needs_accounts(self) -> "GoalCreate":
        if self.selection_mode is GoalSelectionMode.SELECTED and not self.account_ids:
            raise ValueError("Choose at least one account, or switch to all eligible accounts")
        return self


class GoalUpdate(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    currency: str | None = None
    target_amount_minor: int | None = Field(default=None, gt=0)
    deadline: date | None = None
    selection_mode: GoalSelectionMode | None = None
    account_ids: list[int] | None = None
    note: str | None = None
    is_active: bool | None = None

    @field_validator("currency")
    @classmethod
    def _currency(cls, value: str | None) -> str | None:
        return validate_currency(value) if value else value


class GoalContributionRead(ApiModel):
    account_id: int
    account_name: str
    currency: str
    balance_minor: int
    converted_minor: int | None
    fx_freshness: str
    is_eligible: bool
    shared_with_goals: int


class GoalRead(ApiModel):
    id: int
    name: str
    currency: str
    target_amount_minor: int | None
    deadline: date | None
    selection_mode: str
    note: str | None
    is_active: bool
    current_amount_minor: int | None
    progress_percent: float | None
    remaining_minor: int | None
    fx_freshness: str
    account_count: int
    account_ids: list[int]
    contributions: list[GoalContributionRead]
    unconverted_accounts: list[str]
    created_at: datetime
