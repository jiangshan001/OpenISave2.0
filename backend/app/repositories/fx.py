"""Exchange rate persistence."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.base import utcnow
from app.models.fx_rate import FxRate


class FxRateRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get_on_date(self, base: str, quote: str, rate_date: date) -> FxRate | None:
        stmt = select(FxRate).where(
            FxRate.base_currency == base,
            FxRate.quote_currency == quote,
            FxRate.rate_date == rate_date,
        )
        return self.session.scalar(stmt)

    def get_latest(self, base: str, quote: str, *, on_or_before: date | None = None) -> FxRate | None:
        stmt = select(FxRate).where(FxRate.base_currency == base, FxRate.quote_currency == quote)
        if on_or_before is not None:
            stmt = stmt.where(FxRate.rate_date <= on_or_before)
        stmt = stmt.order_by(FxRate.rate_date.desc(), FxRate.id.desc()).limit(1)
        return self.session.scalar(stmt)

    def latest_for_all(self, quote: str) -> list[FxRate]:
        rates: list[FxRate] = []
        bases = self.session.scalars(
            select(FxRate.base_currency).where(FxRate.quote_currency == quote).distinct()
        )
        for base in bases:
            latest = self.get_latest(base, quote)
            if latest is not None:
                rates.append(latest)
        return rates

    def upsert(
        self, base: str, quote: str, rate: Decimal, rate_date: date, source: str
    ) -> FxRate:
        existing = self.get_on_date(base, quote, rate_date)
        if existing is not None:
            existing.rate = rate
            existing.source = source
            existing.fetched_at = utcnow()
            self.session.flush()
            return existing
        record = FxRate(
            base_currency=base,
            quote_currency=quote,
            rate=rate,
            rate_date=rate_date,
            source=source,
            fetched_at=utcnow(),
        )
        self.session.add(record)
        self.session.flush()
        return record
