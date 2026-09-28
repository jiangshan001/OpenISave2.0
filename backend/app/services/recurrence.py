"""Recurrence calculation: pure date arithmetic, no database.

Every occurrence is computed directly from the start date and its index k,
never by stepping from the previous occurrence. Stepping drifts: 31 Jan ->
28 Feb -> 28 Mar would lose the 31st for good, whereas computing from the
anchor gives 31 Jan, 28 Feb (29 in a leap year), 31 Mar, 30 Apr ...

    weekly    start + k * interval weeks
    monthly   month(start) + k * interval, on day_of_month clamped to the
              month's length (day_of_month 31 therefore means "last day")
    yearly    start's month and day + k * interval years; 29 Feb falls on
              28 Feb in common years
"""

from __future__ import annotations

import calendar
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import date, timedelta

from app.core.enums import RecurringFrequency

#: Upper bound on occurrences scanned in one call, so a malformed schedule can
#: never spin forever.
_MAX_STEPS = 10_000


@dataclass(frozen=True)
class Schedule:
    frequency: RecurringFrequency
    interval: int
    start_date: date
    end_date: date | None = None
    day_of_month: int | None = None

    def __post_init__(self) -> None:
        if self.interval < 1:
            raise ValueError("interval must be at least 1")
        if self.day_of_month is not None and not 1 <= self.day_of_month <= 31:
            raise ValueError("day_of_month must be between 1 and 31")
        if self.end_date is not None and self.end_date < self.start_date:
            raise ValueError("end_date cannot be before start_date")

    @property
    def anchor_day(self) -> int:
        return self.day_of_month or self.start_date.day


def month_shift(year: int, month: int, months: int, day: int) -> date:
    """The date `months` after (year, month), on `day` clamped to month length."""
    total = (month - 1) + months
    target_year = year + total // 12
    target_month = total % 12 + 1
    last_day = calendar.monthrange(target_year, target_month)[1]
    return date(target_year, target_month, min(day, last_day))


def nth(schedule: Schedule, k: int) -> date:
    """The k-th candidate date (k >= 0). May precede start_date for monthly
    rules whose day_of_month is earlier in the month than the start."""
    start = schedule.start_date
    if schedule.frequency is RecurringFrequency.WEEKLY:
        return start + timedelta(weeks=schedule.interval * k)
    if schedule.frequency is RecurringFrequency.MONTHLY:
        return month_shift(start.year, start.month, schedule.interval * k, schedule.anchor_day)
    return month_shift(start.year, start.month, 12 * schedule.interval * k, start.day)


def _first_index_estimate(schedule: Schedule, on_or_after: date) -> int:
    """A k no greater than the first index whose date is >= on_or_after."""
    start = schedule.start_date
    if on_or_after <= start:
        return 0
    if schedule.frequency is RecurringFrequency.WEEKLY:
        return max(0, (on_or_after - start).days // (7 * schedule.interval) - 1)
    months = (on_or_after.year - start.year) * 12 + on_or_after.month - start.month
    step = schedule.interval * (12 if schedule.frequency is RecurringFrequency.YEARLY else 1)
    return max(0, months // step - 1)


def first_on_or_after(schedule: Schedule, on_or_after: date) -> date | None:
    """The earliest occurrence >= on_or_after (and >= start), or None when the
    schedule has ended before then."""
    floor = max(on_or_after, schedule.start_date)
    k = _first_index_estimate(schedule, floor)
    for _ in range(_MAX_STEPS):
        candidate = nth(schedule, k)
        if candidate >= floor:
            if schedule.end_date is not None and candidate > schedule.end_date:
                return None
            return candidate
        k += 1
    return None  # pragma: no cover - unreachable for valid schedules


def first_after(schedule: Schedule, after: date) -> date | None:
    return first_on_or_after(schedule, after + timedelta(days=1))


def is_occurrence(schedule: Schedule, candidate: date) -> bool:
    return first_on_or_after(schedule, candidate) == candidate


def occurrences(
    schedule: Schedule, start: date, end: date, *, limit: int = 366
) -> Iterator[date]:
    """Occurrences within [start, end], in order, at most `limit` of them."""
    current = first_on_or_after(schedule, start)
    produced = 0
    while current is not None and current <= end and produced < limit:
        yield current
        produced += 1
        current = first_after(schedule, current)
