from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import BigInteger, Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class Transaction(Base, TimestampMixin):
    """Ledger header.

    `amount_minor`/`currency` describe the primary leg (the source leg for a
    transfer).  The FX snapshot columns freeze the base-currency value at the
    time the record was created so historical reports never move.
    """

    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    type: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    transaction_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    description: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    account_id: Mapped[int | None] = mapped_column(
        ForeignKey("accounts.id", ondelete="RESTRICT"), nullable=True, index=True
    )

    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(ForeignKey("currencies.code"), nullable=False)

    # Transfer legs (null for income/expense)
    from_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("accounts.id", ondelete="RESTRICT"), nullable=True
    )
    to_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("accounts.id", ondelete="RESTRICT"), nullable=True
    )
    dest_amount_minor: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    dest_currency: Mapped[str | None] = mapped_column(String(3), nullable=True)
    transfer_rate: Mapped[object | None] = mapped_column(Numeric(24, 10), nullable=True)

    # Frozen FX snapshot: primary currency -> base reporting currency
    base_currency: Mapped[str] = mapped_column(String(3), nullable=False, default="CNY")
    base_amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    fx_rate_to_base: Mapped[object] = mapped_column(Numeric(24, 10), nullable=False, default=1)
    fx_rate_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    fx_source: Mapped[str] = mapped_column(String(16), nullable=False, default="identity")

    parent_transaction_id: Mapped[int | None] = mapped_column(
        ForeignKey("transactions.id", ondelete="CASCADE"), nullable=True
    )
    asset_id: Mapped[int | None] = mapped_column(
        ForeignKey("assets.id", ondelete="CASCADE"), nullable=True, index=True
    )

    # Provenance (2.2). Plain indexed integers rather than foreign keys: SQLite
    # can only add constrained columns by rebuilding the table, and rebuilding
    # `transactions` would cascade-delete postings. The referenced rows are
    # archived or disabled, never hard-deleted, in normal use.
    recurring_rule_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    import_batch_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    external_source: Mapped[str | None] = mapped_column(String(32), nullable=True)
    external_transaction_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    classification_rule_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    is_voided: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    postings = relationship(
        "Posting",
        back_populates="transaction",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
