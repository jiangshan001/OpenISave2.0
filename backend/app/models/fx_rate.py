from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, DateTime, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class FxRate(Base, TimestampMixin):
    """Cached exchange rate: 1 unit of `base_currency` == `rate` `quote_currency`."""

    __tablename__ = "fx_rates"
    __table_args__ = (
        UniqueConstraint("base_currency", "quote_currency", "rate_date", name="uq_fx_pair_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    base_currency: Mapped[str] = mapped_column(String(3), nullable=False, index=True)
    quote_currency: Mapped[str] = mapped_column(String(3), nullable=False, index=True)
    rate: Mapped[object] = mapped_column(Numeric(24, 10), nullable=False)
    rate_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="provider")
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
