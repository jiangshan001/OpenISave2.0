from __future__ import annotations

from datetime import date

from sqlalchemy import BigInteger, Date, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Liability(Base, TimestampMixin):
    """Contract metadata for a debt.

    The outstanding balance is NOT stored here. It lives on the linked
    liability account, which keeps a single source of truth and lets the
    existing ledger and net worth code handle debt without special cases.
    """

    __tablename__ = "liabilities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    liability_type: Mapped[str] = mapped_column(String(24), nullable=False)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    original_amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    interest_rate_percent: Mapped[object | None] = mapped_column(Numeric(8, 4), nullable=True)
    lender: Mapped[str | None] = mapped_column(String(120), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
