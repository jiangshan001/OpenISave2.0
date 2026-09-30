from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class RecurringRule(Base, TimestampMixin):
    """A template for a transaction that repeats on a schedule.

    Rules never store future transactions. Each occurrence is materialised on
    demand through the ledger and recorded in `recurring_occurrences`, whose
    unique (rule, date) key is what makes generation idempotent.
    """

    __tablename__ = "recurring_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    transaction_type: Mapped[str] = mapped_column(String(16), nullable=False)

    # income/expense: the account; transfer: the source account.
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    destination_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("accounts.id", ondelete="RESTRICT"), nullable=True
    )
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT"), nullable=True
    )
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    # Cross-currency transfers only: the fixed amount the destination receives.
    dest_amount_minor: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    description: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    frequency: Mapped[str] = mapped_column(String(16), nullable=False)
    interval: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Monthly only: 1-31, clamped to the month's length (31 = last day).
    day_of_month: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Cursor: the earliest occurrence not yet generated or skipped.
    next_run_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)

    mode: Mapped[str] = mapped_column(String(16), nullable=False, default="review")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active", index=True)
    last_generated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class RecurringOccurrence(Base, TimestampMixin):
    """One scheduled date of a rule that has been handled.

    The unique constraint guarantees at most one transaction per rule and
    scheduled date, even across crashes, restarts or a double trigger.
    """

    __tablename__ = "recurring_occurrences"
    __table_args__ = (
        UniqueConstraint("rule_id", "occurrence_date", name="uq_recurring_occurrence"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    rule_id: Mapped[int] = mapped_column(
        ForeignKey("recurring_rules.id", ondelete="CASCADE"), nullable=False, index=True
    )
    occurrence_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    transaction_id: Mapped[int | None] = mapped_column(
        ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True
    )
