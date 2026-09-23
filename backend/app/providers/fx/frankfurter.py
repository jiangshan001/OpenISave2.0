"""Frankfurter (ECB reference data) exchange rate provider.

Network access here is the only outbound traffic in the application and carries
no personal data — only currency codes.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

import httpx

from app.core.config import settings
from app.core.exceptions import FxProviderError
from app.core.logging import get_logger
from app.providers.fx.base import FxProvider, RateQuote

logger = get_logger(__name__)


class FrankfurterProvider(FxProvider):
    name = "frankfurter"

    def __init__(self, base_url: str | None = None, timeout: float | None = None) -> None:
        self.base_url = (base_url or settings.fx_provider_url).rstrip("/")
        self.timeout = timeout or settings.fx_timeout_seconds

    def _request(self, path: str, params: dict[str, str]) -> dict:
        url = f"{self.base_url}{path}"
        try:
            response = httpx.get(url, params=params, timeout=self.timeout, follow_redirects=True)
            response.raise_for_status()
            return response.json()
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("fx_provider_request_failed path=%s", path)
            raise FxProviderError(
                "Could not reach the exchange rate service. Cached rates will be used."
            ) from exc

    def _parse(self, payload: dict, base: str) -> list[RateQuote]:
        rate_date = datetime.strptime(payload["date"], "%Y-%m-%d").date()
        quotes: list[RateQuote] = []
        for code, value in payload.get("rates", {}).items():
            quotes.append(
                RateQuote(
                    base_currency=base.upper(),
                    quote_currency=code.upper(),
                    rate=Decimal(str(value)),
                    rate_date=rate_date,
                    source=self.name,
                )
            )
        return quotes

    def get_latest_rates(self, base: str, quotes: list[str]) -> list[RateQuote]:
        targets = [code.upper() for code in quotes if code.upper() != base.upper()]
        if not targets:
            return []
        payload = self._request("/latest", {"base": base.upper(), "symbols": ",".join(targets)})
        return self._parse(payload, base)

    def get_rate(self, base: str, quote: str, on_date: date) -> RateQuote | None:
        if base.upper() == quote.upper():
            return None
        payload = self._request(
            f"/{on_date.isoformat()}", {"base": base.upper(), "symbols": quote.upper()}
        )
        parsed = self._parse(payload, base)
        return parsed[0] if parsed else None
