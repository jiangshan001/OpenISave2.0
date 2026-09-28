"""Statement import: provenance, account mappings, batches and categorisation rules.

The original statement file is never stored. What is kept is the minimum an
audit needs: the external identity of every imported row (the duplicate guard),
its raw descriptive fields, and a small per-import summary.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class ImportBatch(Base, TimestampMixin):
    """One confirmed import: what was detected and what happened to it."""

    __tablename__ = "import_batches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    period_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    period_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    detected_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    imported_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    duplicate_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    skipped_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ignored_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class ExternalTransactionRef(Base, TimestampMixin):
    """The external identity of an imported transaction.

    UNIQUE(source, external_id) is the database-level duplicate guard: the same
    statement row can never be imported twice, whatever the frontend sends.
    The reference outlives edits (which void and replace a transaction) and
    voids, so a row the user deleted on purpose is not re-imported either.
    """

    __tablename__ = "external_transaction_refs"
    __table_args__ = (
        UniqueConstraint("source", "external_id", name="uq_external_transaction"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    external_id: Mapped[str] = mapped_column(String(64), nullable=False)
    transaction_id: Mapped[int] = mapped_column(
        ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    import_batch_id: Mapped[int | None] = mapped_column(
        ForeignKey("import_batches.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Exact instant with its source offset, e.g. "2026-09-12T01:30:00+08:00".
    occurred_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # The statement's own calendar date (in source_timezone) -- the date the
    # transaction was filed under, independent of the computer's time zone.
    source_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    source_timezone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    raw_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    raw_direction: Mapped[str | None] = mapped_column(String(16), nullable=True)
    raw_merchant: Mapped[str | None] = mapped_column(String(255), nullable=True)
    raw_product: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_payment_method: Mapped[str | None] = mapped_column(String(128), nullable=True)
    raw_status: Mapped[str | None] = mapped_column(String(64), nullable=True)
    raw_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    merchant_order_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    classification_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)


class ImportIgnoredItem(Base, TimestampMixin):
    """A statement row the user chose to ignore permanently.

    UNIQUE(source, external_id): whenever the same WeChat transaction appears in
    a later statement it is shown as ignored instead of needing review again.
    Deleting the row ("Restore") makes it importable again. The descriptive
    columns exist only so the user can recognise the item in the list.
    """

    __tablename__ = "import_ignored_items"
    __table_args__ = (UniqueConstraint("source", "external_id", name="uq_import_ignored_item"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    external_id: Mapped[str] = mapped_column(String(64), nullable=False)
    import_batch_id: Mapped[int | None] = mapped_column(
        ForeignKey("import_batches.id", ondelete="SET NULL"), nullable=True
    )
    occurred_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    source_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    amount_minor: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    currency: Mapped[str | None] = mapped_column(String(3), nullable=True)
    raw_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    raw_direction: Mapped[str | None] = mapped_column(String(16), nullable=True)
    raw_merchant: Mapped[str | None] = mapped_column(String(255), nullable=True)
    raw_product: Mapped[str | None] = mapped_column(Text, nullable=True)


class ImportAccountMapping(Base, TimestampMixin):
    """Remembered link from a statement funding label to an OpenISave account.

    e.g. ("wechat", "零钱") -> WeChat; ("wechat", "中国银行储蓄卡(8080)") -> 中国银行.
    Kept as data, never hard-coded in an importer.
    """

    __tablename__ = "import_account_mappings"
    __table_args__ = (UniqueConstraint("source", "label", name="uq_import_account_mapping"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    label: Mapped[str] = mapped_column(String(128), nullable=False)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False
    )


class CategorisationRule(Base, TimestampMixin):
    """Deterministic rule: if a statement field matches, file under a category.

    `origin` separates rules the user wrote (always evaluated first) from the
    built-in defaults, which the user may edit or disable but which are seeded
    back only if missing (`system_key`).
    """

    __tablename__ = "categorisation_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    origin: Mapped[str] = mapped_column(String(16), nullable=False, default="user")
    system_key: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    source: Mapped[str | None] = mapped_column(String(32), nullable=True)
    match_field: Mapped[str] = mapped_column(String(16), nullable=False)
    match_type: Mapped[str] = mapped_column(String(16), nullable=False)
    pattern: Mapped[str] = mapped_column(String(200), nullable=False)
    # Optional second condition, e.g. merchant 同程旅行 AND product contains 机票.
    secondary_field: Mapped[str | None] = mapped_column(String(16), nullable=True)
    secondary_pattern: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # income / expense; null matches either direction.
    direction: Mapped[str | None] = mapped_column(String(16), nullable=True)
    category_id: Mapped[int] = mapped_column(
        ForeignKey("categories.id", ondelete="CASCADE"), nullable=False
    )
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
