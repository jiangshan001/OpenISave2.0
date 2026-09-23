"""Exchange rate resolution.

Rate lookup policy (architecture 22.2) -- a missing rate is an error, never 1.0:

    exact cached rate for the date
    -> most recent cached rate on or before the date
    -> most recent cached rate at all (flagged stale)
    -> FxRateUnavailableError
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.enums import FxFreshness, FxSource
from app.core.exceptions import FxProviderError, FxRateUnavailableError, ValidationError
from app.core.logging import get_logger
from app.core.money import BASE_CURRENCY, SUPPORTED_CURRENCIES, quantize_rate
from app.providers.fx.base import FxProvider
from app.providers.fx.frankfurter import FrankfurterProvider
from app.repositories.fx import FxRateRepository

logger = get_logger(__name__)
ONE = Decimal(1)


@dataclass(frozen=True)
class ResolvedRate:
    from_currency: str
    to_currency: str
    rate: Decimal
    rate_date: date | None
    source: str
    freshness: str


class FxService:
    def __init__(
        self,
        session: Session,
        provider: FxProvider | None = None,
        *,
        stale_after_days: int = 3,
    ) -> None:
        self.session = session
        self.repo = FxRateRepository(session)
        self.provider = provider or FrankfurterProvider()
        self.stale_after_days = stale_after_days

    # ------------------------------------------------------------------ reads

    def _freshness(self, rate_date: date, reference: date) -> str:
        delta = (reference - rate_date).days
        if delta <= self.stale_after_days:
            return FxFreshness.FRESH.value
        return FxFreshness.STALE.value

    def _lookup_direct(self, base: str, quote: str, on_date: date | None) -> ResolvedRate | None:
        reference = on_date or date.today()
        record = None
        if on_date is not None:
            record = self.repo.get_on_date(base, quote, on_date)
            if record is None:
                record = self.repo.get_latest(base, quote, on_or_before=on_date)
        if record is None:
            record = self.repo.get_latest(base, quote)
        if record is None:
            return None
        return ResolvedRate(
            from_currency=base,
            to_currency=quote,
            rate=quantize_rate(record.rate),
            rate_date=record.rate_date,
            source=record.source,
            freshness=self._freshness(record.rate_date, reference),
        )

    def resolve_rate(
        self, from_currency: str, to_currency: str, on_date: date | None = None
    ) -> ResolvedRate:
        """Resolve how many units of to_currency equal 1 from_currency, or raise."""
        source = from_currency.upper()
        target = to_currency.upper()
        if source == target:
            return ResolvedRate(
                source, target, ONE, on_date, FxSource.IDENTITY.value, FxFreshness.IDENTITY.value
            )

        direct = self._lookup_direct(source, target, on_date)
        if direct is not None:
            return direct

        inverse = self._lookup_direct(target, source, on_date)
        if inverse is not None:
            return ResolvedRate(
                source,
                target,
                quantize_rate(ONE / inverse.rate),
                inverse.rate_date,
                inverse.source,
                inverse.freshness,
            )

        if BASE_CURRENCY not in (source, target):
            left = self._lookup_direct(source, BASE_CURRENCY, on_date)
            right = self._lookup_direct(target, BASE_CURRENCY, on_date)
            if left is not None and right is not None:
                stale = FxFreshness.STALE.value in (left.freshness, right.freshness)
                dates = [d for d in (left.rate_date, right.rate_date) if d is not None]
                return ResolvedRate(
                    source,
                    target,
                    quantize_rate(left.rate / right.rate),
                    min(dates) if dates else None,
                    FxSource.CACHE.value,
                    FxFreshness.STALE.value if stale else FxFreshness.FRESH.value,
                )

        raise FxRateUnavailableError(source, target)

    def rate_to_base(self, currency: str, on_date: date | None = None) -> ResolvedRate:
        return self.resolve_rate(currency, BASE_CURRENCY, on_date)

    def status(self) -> list[dict]:
        """Freshness of every supported currency against the base currency."""
        today = date.today()
        rows: list[dict] = []
        for code in SUPPORTED_CURRENCIES:
            if code == BASE_CURRENCY:
                continue
            try:
                resolved = self.rate_to_base(code)
            except FxRateUnavailableError:
                rows.append(
                    {
                        "from_currency": code,
                        "to_currency": BASE_CURRENCY,
                        "rate": None,
                        "rate_date": None,
                        "source": None,
                        "freshness": FxFreshness.MISSING.value,
                        "age_days": None,
                    }
                )
                continue
            rows.append(
                {
                    "from_currency": code,
                    "to_currency": BASE_CURRENCY,
                    "rate": str(resolved.rate),
                    "rate_date": resolved.rate_date.isoformat() if resolved.rate_date else None,
                    "source": resolved.source,
                    "freshness": resolved.freshness,
                    "age_days": (today - resolved.rate_date).days if resolved.rate_date else None,
                }
            )
        return rows

    def has_stale_or_missing(self) -> bool:
        unhealthy = {FxFreshness.STALE.value, FxFreshness.MISSING.value}
        return any(row["freshness"] in unhealthy for row in self.status())

    # ----------------------------------------------------------------- writes

    def refresh(self) -> dict:
        """Fetch latest rates and cache them in the currency -> base direction."""
        quotes = [code for code in SUPPORTED_CURRENCIES if code != BASE_CURRENCY]
        try:
            fetched = self.provider.get_latest_rates(BASE_CURRENCY, quotes)
        except FxProviderError as exc:
            logger.warning("fx_refresh_failed")
            return {"updated": 0, "ok": False, "message": exc.message}

        updated = 0
        for quote in fetched:
            if quote.rate <= 0:
                continue
            self.repo.upsert(
                base=quote.quote_currency,
                quote=BASE_CURRENCY,
                rate=quantize_rate(ONE / quote.rate),
                rate_date=quote.rate_date,
                source=self.provider.name,
            )
            updated += 1
        self.session.commit()
        logger.info("fx_refresh_completed count=%s", updated)
        return {"updated": updated, "ok": True, "message": "Exchange rates updated."}

    def set_manual_rate(
        self, from_currency: str, to_currency: str, rate: Decimal, on_date: date | None = None
    ) -> ResolvedRate:
        source = from_currency.upper()
        target = to_currency.upper()
        if source == target:
            raise ValidationError("A manual rate requires two different currencies.")
        self.repo.upsert(
            source, target, quantize_rate(rate), on_date or date.today(), FxSource.MANUAL.value
        )
        self.session.commit()
        logger.info("fx_manual_rate_set pair=%s/%s", source, target)
        return self.resolve_rate(source, target, on_date)
