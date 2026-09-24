"""Daily income / expense activity for the Overview heatmap.

The ledger is aggregated per day here so the frontend only lays cells out on a
calendar; it never scans transactions or sums amounts itself.

Scope: `income` and `expense` transactions only, in the base currency
(each transaction's stored `base_amount_minor`), voided rows excluded. The
window runs from the first day of the month `months - 1` months ago up to and
including `today`.

Intensity levels 1-4 are percentile-rank quartiles of the window's non-zero
days, so one large rent payment does not wash every other day out to the
palest colour.
"""

from __future__ import annotations

from bisect import bisect_right
from datetime import date
from math import ceil

from sqlalchemy.orm import Session

from app.core.enums import TransactionType
from app.core.exceptions import ValidationError
from app.core.money import BASE_CURRENCY
from app.repositories.transactions import TransactionRepository

KINDS = (TransactionType.EXPENSE.value, TransactionType.INCOME.value)
MAX_MONTHS = 24


def window_start(today: date, months: int) -> date:
    index = today.year * 12 + (today.month - 1) - (months - 1)
    year, month = divmod(index, 12)
    return date(year, month + 1, 1)


def intensity_level(amount: int, sorted_positive: list[int]) -> int:
    """Quartile of `amount` by percentile rank among the window's active days.

    Ranking (rather than fixed bounds) keeps the scale meaningful when many
    days share an amount: twelve identical salaries are all level 4, and a
    smaller bonus beside them stays lighter.
    """
    if amount <= 0 or not sorted_positive:
        return 0
    rank = bisect_right(sorted_positive, amount)
    return max(1, ceil(4 * rank / len(sorted_positive)))


class ActivityService:
    def __init__(self, session: Session) -> None:
        self.transactions = TransactionRepository(session)

    def daily_activity(self, today: date | None = None, months: int = 12) -> dict:
        if not 1 <= months <= MAX_MONTHS:
            raise ValidationError(f"months must be between 1 and {MAX_MONTHS}.")
        today = today or date.today()
        start = window_start(today, months)

        per_kind: dict[str, dict[date, tuple[int, int]]] = {kind: {} for kind in KINDS}
        for day, kind, total, count in self.transactions.daily_totals(start, today):
            per_kind[kind][day] = (total, count)

        return {
            "base_currency": BASE_CURRENCY,
            "start": start.isoformat(),
            "end": today.isoformat(),
            "months": months,
            "series": {kind: self._series(per_kind[kind]) for kind in KINDS},
        }

    @staticmethod
    def _series(days: dict[date, tuple[int, int]]) -> dict:
        amounts = [total for total, _count in days.values()]
        positive = sorted(amount for amount in amounts if amount > 0)
        return {
            "total_minor": sum(amounts),
            "max_minor": max(amounts, default=0),
            "active_days": len(positive),
            "days": [
                {
                    "date": day.isoformat(),
                    "amount_minor": total,
                    "count": count,
                    "level": intensity_level(total, positive),
                }
                for day, (total, count) in sorted(days.items())
            ],
        }
