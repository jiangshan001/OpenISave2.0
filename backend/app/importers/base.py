"""Statement importer abstraction.

An importer turns the bytes of one statement file into normalised rows. It
knows the file format and the provider's vocabulary (what "零钱充值" means);
it knows nothing about accounts, categories or the database. Everything after
parsing -- account mapping, duplicate detection, categorisation and the
ledger write -- is shared by every source in StatementImportService.

Adding a source (Monzo, HSBC, a generic CSV) means implementing this protocol
and registering it; no other layer changes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, tzinfo
from typing import Protocol


def source_calendar_date(instant: datetime, zone: tzinfo) -> date:
    """The calendar date of `instant` as the statement's own time zone sees it.

    This -- not the computer's local date -- is the ledger `transaction_date`
    of an imported row, so budgets, reports and the heatmap file a purchase
    under the day printed on the statement. A 01:30 Beijing-time purchase on
    12 Sep stays on 12 Sep even when Windows runs on Europe/London (where it
    was still 11 Sep). Only an explicit zone is ever used; a naive datetime
    is refused so the local zone can never leak in.
    """
    if instant.tzinfo is None:
        raise ValueError("a statement time must carry its time zone")
    return instant.astimezone(zone).date()


class UnsupportedStatementError(ValueError):
    """The file is not a statement this importer understands."""


class Movement:
    """How a row moves money, as far as the statement alone can tell."""

    INCOME = "income"
    EXPENSE = "expense"
    TRANSFER = "transfer"  # between two of the user's own funding sources
    REVIEW = "review"  # ambiguous: never guessed into income or expense
    IGNORED = "ignored"  # not a completed movement (failed, closed, returned)


@dataclass
class StatementRow:
    row_number: int  # 1-based row in the sheet, for error messages
    external_id: str  # provider transaction id, always a string
    occurred_at: datetime  # timezone-aware instant, expressed in the source zone
    source_date: date  # calendar date in the SOURCE zone = ledger transaction_date
    source_type: str  # provider's own transaction type, e.g. 商户消费
    direction: str  # income / expense / neutral, from the statement
    counterparty: str
    product: str
    note: str  # free text the payer wrote (e.g. a transfer message)
    remark: str  # the statement's remarks column
    amount_minor: int
    currency: str
    payment_method: str
    status: str
    merchant_order_id: str
    raw_direction: str
    # Interpretation (provider vocabulary -> movement)
    movement: str = Movement.REVIEW
    source_label: str = ""  # funding source the money leaves/enters
    dest_label: str = ""  # transfers only: the other funding source
    review_reason: str = ""
    source_timezone: str = ""  # IANA name of the zone source_date is read in


@dataclass
class RowError:
    row_number: int
    message: str


@dataclass
class ParsedStatement:
    source: str
    rows: list[StatementRow]
    errors: list[RowError] = field(default_factory=list)
    header_row: int = 0

    @property
    def period(self) -> tuple[date | None, date | None]:
        if not self.rows:
            return None, None
        dates = [row.source_date for row in self.rows]
        return min(dates), max(dates)


class StatementImporter(Protocol):
    source: str
    display_name: str
    currency: str
    timezone_name: str  # zone the statement's times and dates are written in

    def parse(self, content: bytes) -> ParsedStatement: ...
