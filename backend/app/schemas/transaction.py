from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import Field, model_validator

from app.core.enums import TransactionType
from app.schemas.common import ApiModel, CurrencyMixin


class TransactionCreate(ApiModel):
    type: TransactionType
    account_id: int
    amount_minor: int = Field(gt=0)
    currency: str | None = None
    transaction_date: date
    description: str = Field(default="", max_length=200)
    category_id: int | None = None
    note: str | None = None
    fx_rate: Decimal | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def _reject_transfer(self) -> "TransactionCreate":
        if self.type is TransactionType.TRANSFER:
            raise ValueError("Use POST /transfers to move money between accounts")
        return self


class TransactionUpdate(ApiModel):
    type: TransactionType | None = None
    account_id: int | None = None
    amount_minor: int | None = Field(default=None, gt=0)
    transaction_date: date | None = None
    description: str | None = Field(default=None, max_length=200)
    category_id: int | None = None
    note: str | None = None
    fx_rate: Decimal | None = Field(default=None, gt=0)


class TransferCreate(ApiModel, CurrencyMixin):
    from_account_id: int
    to_account_id: int
    amount_minor: int = Field(gt=0)
    dest_amount_minor: int | None = Field(default=None, gt=0)
    transaction_date: date
    description: str | None = Field(default=None, max_length=200)
    note: str | None = None
    fee_minor: int = Field(default=0, ge=0)
    fx_rate: Decimal | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def _distinct_accounts(self) -> "TransferCreate":
        if self.from_account_id == self.to_account_id:
            raise ValueError("Source and destination accounts must be different")
        return self


class PostingRead(ApiModel):
    id: int
    account_id: int | None
    category_id: int | None
    amount_minor: int
    currency: str
    base_amount_minor: int


class TransactionRead(ApiModel):
    id: int
    type: str
    transaction_date: date
    description: str
    note: str | None
    category_id: int | None
    account_id: int | None
    amount_minor: int
    currency: str
    from_account_id: int | None
    to_account_id: int | None
    dest_amount_minor: int | None
    dest_currency: str | None
    transfer_rate: Decimal | None
    base_currency: str
    base_amount_minor: int
    fx_rate_to_base: Decimal
    fx_rate_date: date | None
    fx_source: str
    parent_transaction_id: int | None
    is_voided: bool
    voided_at: datetime | None
    created_at: datetime
    updated_at: datetime
