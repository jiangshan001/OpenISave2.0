from __future__ import annotations

from datetime import date, datetime

from pydantic import Field

from app.core.enums import RuleMatchField, RuleMatchType
from app.schemas.common import ApiModel


class RememberRule(ApiModel):
    match_field: RuleMatchField = RuleMatchField.MERCHANT
    match_type: RuleMatchType = RuleMatchType.EXACT
    pattern: str | None = Field(default=None, max_length=200)


class RowOverrideIn(ApiModel):
    row_id: int = Field(ge=0)
    category_id: int | None = None
    counter_account_id: int | None = None
    skip: bool = False  # skip this import only
    ignore: bool = False  # ignore permanently (source + external id)
    remember: RememberRule | None = None


class PreviewRequest(ApiModel):
    mappings: dict[str, int | None] = {}
    overrides: list[RowOverrideIn] = []


class ConfirmRequest(PreviewRequest):
    remember_mappings: bool = True
    skip_unresolved: bool = False


class PreviewRowOut(ApiModel):
    row_id: int
    row_number: int
    external_id: str
    occurred_at: str  # ISO 8601 with the source offset, e.g. +08:00
    transaction_date: date  # the source calendar date; what the ledger will use
    source_timezone: str
    source_type: str
    direction: str
    counterparty: str
    product: str
    note: str
    remark: str
    payment_method: str
    amount_minor: int
    currency: str
    source_label: str
    dest_label: str
    status: str
    kind: str | None
    account_id: int | None
    counter_account_id: int | None
    category_id: int | None
    method: str
    rule_id: int | None
    rule_name: str | None
    reason: str | None
    issues: list[str]
    ignore_state: str | None


class LabelOut(ApiModel):
    label: str
    account_id: int | None
    remembered: bool
    row_count: int


class RowErrorOut(ApiModel):
    row_number: int
    message: str


class PreviewOut(ApiModel):
    token: str
    source: str
    file_name: str | None
    period_start: date | None
    period_end: date | None
    header_row: int
    summary: dict[str, int]
    labels: list[LabelOut]
    rows: list[PreviewRowOut]
    errors: list[RowErrorOut]


class ImportBatchOut(ApiModel):
    id: int
    source: str
    file_name: str | None
    period_start: date | None
    period_end: date | None
    detected_count: int
    imported_count: int
    duplicate_count: int
    skipped_count: int
    ignored_count: int
    created_at: datetime


class ImportResultOut(ImportBatchOut):
    transaction_ids: list[int]


class IgnoredItemOut(ApiModel):
    id: int
    source: str
    external_id: str
    import_batch_id: int | None
    occurred_at: str | None
    source_date: date | None
    amount_minor: int | None
    currency: str | None
    raw_type: str | None
    raw_direction: str | None
    raw_merchant: str | None
    raw_product: str | None
    created_at: datetime


class MappingOut(ApiModel):
    id: int
    source: str
    label: str
    account_id: int


class RuleIn(ApiModel):
    name: str | None = Field(default=None, max_length=120)
    source: str | None = None
    match_field: RuleMatchField
    match_type: RuleMatchType = RuleMatchType.CONTAINS
    pattern: str = Field(min_length=1, max_length=200)
    secondary_field: RuleMatchField | None = None
    secondary_pattern: str | None = Field(default=None, max_length=200)
    category_id: int
    priority: int | None = None


class RuleUpdate(ApiModel):
    name: str | None = Field(default=None, max_length=120)
    match_field: RuleMatchField | None = None
    match_type: RuleMatchType | None = None
    pattern: str | None = Field(default=None, min_length=1, max_length=200)
    secondary_field: RuleMatchField | None = None
    secondary_pattern: str | None = Field(default=None, max_length=200)
    category_id: int | None = None
    priority: int | None = None
    is_enabled: bool | None = None


class RuleOut(ApiModel):
    id: int
    name: str
    origin: str
    source: str | None
    match_field: str
    match_type: str
    pattern: str
    secondary_field: str | None
    secondary_pattern: str | None
    direction: str | None
    category_id: int
    priority: int
    is_enabled: bool
    explanation: str = ""


class ReorderIn(ApiModel):
    rule_ids: list[int]
