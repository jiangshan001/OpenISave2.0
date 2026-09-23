"""Exchange rate provider interface.

Domain code depends on this protocol only, so the concrete HTTP provider can be
swapped without touching services.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date
from decimal import Decimal


@dataclass(frozen=True)
class RateQuote:
    base_currency: str
    quote_currency: str
    rate: Decimal
    rate_date: date
    source: str


class FxProvider(ABC):
    name: str = "provider"

    @abstractmethod
    def get_latest_rates(self, base: str, quotes: list[str]) -> list[RateQuote]:
        """Return the latest available rates for `base` against each quote."""

    @abstractmethod
    def get_rate(self, base: str, quote: str, on_date: date) -> RateQuote | None:
        """Return the rate for a specific date, or None when unavailable."""
