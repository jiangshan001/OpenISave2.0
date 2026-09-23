from __future__ import annotations

from datetime import datetime

from pydantic import Field, field_validator

from app.core.enums import AccountPurpose, AccountType
from app.schemas.common import ApiModel, CurrencyMixin, validate_currency


class AccountCreate(ApiModel, CurrencyMixin):
    name: str = Field(min_length=1, max_length=120)
    institution: str | None = Field(default=None, max_length=120)
    account_type: AccountType
    currency: str
    purpose: str | None = Field(default=None, max_length=64)
    opening_balance_minor: int = 0
    include_in_net_worth: bool = True
    note: str | None = None
    sort_order: int = 0


class AccountUpdate(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    institution: str | None = None
    account_type: AccountType | None = None
    currency: str | None = None
    purpose: str | None = None
    opening_balance_minor: int | None = None
    include_in_net_worth: bool | None = None
    is_active: bool | None = None
    is_archived: bool | None = None
    note: str | None = None
    sort_order: int | None = None

    @field_validator("currency")
    @classmethod
    def _currency(cls, value: str | None) -> str | None:
        return validate_currency(value) if value else value


class AccountRead(ApiModel):
    id: int
    name: str
    institution: str | None
    account_type: str
    currency: str
    purpose: str | None
    opening_balance_minor: int
    include_in_net_worth: bool
    is_active: bool
    is_archived: bool
    note: str | None
    sort_order: int
    created_at: datetime
    updated_at: datetime


class AccountBalanceRead(AccountRead):
    balance_minor: int
    base_balance_minor: int | None
    base_currency: str
    fx_rate: str | None
    fx_freshness: str
    group: str
    is_liability: bool


class AccountPurposeOption(ApiModel):
    value: str
    label: str


ACCOUNT_PURPOSE_LABELS: dict[str, str] = {
    AccountPurpose.DAILY_SPENDING.value: "Daily Spending",
    AccountPurpose.BILLS.value: "Bills",
    AccountPurpose.EMERGENCY_FUND.value: "Emergency Fund",
    AccountPurpose.LONG_TERM_SAVINGS.value: "Long-Term Savings",
    AccountPurpose.TRAVEL.value: "Travel",
    AccountPurpose.INVESTMENT.value: "Investment",
    AccountPurpose.EDUCATION.value: "Education",
    AccountPurpose.HOUSING.value: "Housing",
    AccountPurpose.BUSINESS.value: "Business",
    AccountPurpose.OTHER.value: "Other",
}
