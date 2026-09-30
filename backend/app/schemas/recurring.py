from __future__ import annotations

from datetime import date, datetime

from pydantic import Field

from app.core.enums import RecurringFrequency, RecurringMode, TransactionType
from app.schemas.common import ApiModel


class RecurringRuleCreate(ApiModel):
    name: str = Field(min_length=1, max_length=120)
    transaction_type: TransactionType
    account_id: int
    destination_account_id: int | None = None
    category_id: int | None = None
    amount_minor: int = Field(gt=0)
    dest_amount_minor: int | None = Field(default=None, gt=0)
    description: str = Field(default="", max_length=200)
    note: str | None = None
    frequency: RecurringFrequency
    interval: int = Field(default=1, ge=1, le=366)
    start_date: date
    end_date: date | None = None
    day_of_month: int | None = Field(default=None, ge=1, le=31)
    mode: RecurringMode = RecurringMode.REVIEW


class RecurringRuleUpdate(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    transaction_type: TransactionType | None = None
    account_id: int | None = None
    destination_account_id: int | None = None
    category_id: int | None = None
    amount_minor: int | None = Field(default=None, gt=0)
    dest_amount_minor: int | None = Field(default=None, gt=0)
    description: str | None = Field(default=None, max_length=200)
    note: str | None = None
    frequency: RecurringFrequency | None = None
    interval: int | None = Field(default=None, ge=1, le=366)
    start_date: date | None = None
    end_date: date | None = None
    day_of_month: int | None = Field(default=None, ge=1, le=31)
    mode: RecurringMode | None = None


class RecurringRuleRead(ApiModel):
    id: int
    name: str
    transaction_type: str
    account_id: int
    destination_account_id: int | None
    category_id: int | None
    amount_minor: int
    currency: str
    dest_amount_minor: int | None
    description: str
    note: str | None
    frequency: str
    interval: int
    start_date: date
    end_date: date | None
    day_of_month: int | None
    next_run_date: date | None
    mode: str
    status: str
    last_generated_at: datetime | None
    due_count: int = 0
    generated_count: int = 0
    created_at: datetime
    updated_at: datetime


class UpcomingItem(ApiModel):
    rule_id: int
    name: str
    transaction_type: str
    amount_minor: int
    currency: str
    account_id: int
    destination_account_id: int | None
    category_id: int | None
    occurrence_date: date
    days_until: int
    is_due: bool
    mode: str


class OccurrenceRead(ApiModel):
    rule_id: int
    occurrence_date: date
    status: str
    transaction_id: int | None


class ProcessDueResult(ApiModel):
    generated: list[OccurrenceRead]
    failed: list[dict]
