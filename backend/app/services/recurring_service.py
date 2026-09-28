"""Recurring transactions: schedules, due detection and idempotent generation.

A rule is a template. Nothing is written ahead of time; when an occurrence is
due it is either shown for review (default) or, for automatic rules, created
by `process_due`. Either way the transaction goes through the LedgerService,
so postings, frozen FX and income/expense/transfer semantics are exactly those
of a hand-entered record.

Idempotency: an occurrence row with UNIQUE(rule_id, occurrence_date) is
inserted in the same database transaction as the ledger entry. A second
attempt -- a double click, a retry after a crash, two processes -- either
finds the row or hits the constraint and rolls back, so one scheduled date
can never produce two transactions. Voiding a generated transaction does not
free its date: the rule will not silently recreate it.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.enums import (
    CategoryKind,
    OccurrenceStatus,
    RecurringFrequency,
    RecurringMode,
    RecurringStatus,
    TransactionType,
)
from app.core.exceptions import AppError, ConflictError, NotFoundError, ValidationError
from app.core.logging import get_logger
from app.db.base import utcnow
from app.models.category import Category
from app.models.recurring import RecurringOccurrence, RecurringRule
from app.models.transaction import Transaction
from app.services import recurrence
from app.services.ledger_service import LedgerService

logger = get_logger(__name__)

#: At most this many past occurrences are listed or generated per rule in one
#: pass, so a rule backdated years cannot flood the ledger.
MAX_CATCH_UP = 24

ALLOWED_TYPES = {TransactionType.INCOME, TransactionType.EXPENSE, TransactionType.TRANSFER}
SCHEDULE_FIELDS = ("frequency", "interval", "start_date", "end_date", "day_of_month")
EDITABLE_FIELDS = (
    "name", "transaction_type", "account_id", "destination_account_id", "category_id",
    "amount_minor", "dest_amount_minor", "description", "note", "mode", *SCHEDULE_FIELDS,
)


@dataclass
class DueItem:
    rule: RecurringRule
    occurrence_date: date
    today: date

    @property
    def is_due(self) -> bool:
        return self.occurrence_date <= self.today

    @property
    def days_until(self) -> int:
        return (self.occurrence_date - self.today).days


@dataclass
class ProcessResult:
    generated: list[tuple[int, date, int]]  # (rule id, date, transaction id)
    failed: list[tuple[int, date, str]]  # (rule id, date, message)


def schedule_of(rule: RecurringRule) -> recurrence.Schedule:
    return recurrence.Schedule(
        frequency=RecurringFrequency(rule.frequency),
        interval=rule.interval,
        start_date=rule.start_date,
        end_date=rule.end_date,
        day_of_month=rule.day_of_month,
    )


class RecurringService:
    def __init__(self, session: Session, ledger: LedgerService) -> None:
        self.session = session
        self.ledger = ledger
        self.accounts = ledger.accounts

    # ---------------------------------------------------------------- reads

    def get(self, rule_id: int) -> RecurringRule:
        rule = self.session.get(RecurringRule, rule_id)
        if rule is None:
            raise NotFoundError(f"Recurring transaction {rule_id} was not found.")
        return rule

    def list(self, *, include_archived: bool = False) -> list[RecurringRule]:
        stmt = select(RecurringRule)
        if not include_archived:
            stmt = stmt.where(RecurringRule.status != RecurringStatus.ARCHIVED.value)
        return list(self.session.scalars(stmt.order_by(RecurringRule.next_run_date, RecurringRule.id)))

    def handled_dates(self, rule_id: int, *, since: date | None = None) -> set[date]:
        stmt = select(RecurringOccurrence.occurrence_date).where(
            RecurringOccurrence.rule_id == rule_id
        )
        if since is not None:
            stmt = stmt.where(RecurringOccurrence.occurrence_date >= since)
        return set(self.session.scalars(stmt))

    def generated_count(self, rule_id: int) -> int:
        stmt = select(func.count(RecurringOccurrence.id)).where(
            RecurringOccurrence.rule_id == rule_id,
            RecurringOccurrence.status == OccurrenceStatus.GENERATED.value,
        )
        return int(self.session.scalar(stmt) or 0)

    def due_dates(self, rule: RecurringRule, today: date) -> list[date]:
        """Unhandled occurrences on or before `today`, oldest first."""
        if rule.status != RecurringStatus.ACTIVE.value or rule.next_run_date is None:
            return []
        handled = self.handled_dates(rule.id, since=rule.next_run_date)
        dates = recurrence.occurrences(
            schedule_of(rule), rule.next_run_date, today, limit=MAX_CATCH_UP + len(handled)
        )
        return [d for d in dates if d not in handled][:MAX_CATCH_UP]

    def upcoming(self, today: date, days: int = 14) -> list[DueItem]:
        """Due occurrences plus those in the next `days` days, for active rules."""
        horizon = today + timedelta(days=days)
        items: list[DueItem] = []
        for rule in self.list():
            if rule.status != RecurringStatus.ACTIVE.value or rule.next_run_date is None:
                continue
            items.extend(DueItem(rule, d, today) for d in self.due_dates(rule, today))
            handled = self.handled_dates(rule.id, since=today + timedelta(days=1))
            future_from = max(rule.next_run_date, today + timedelta(days=1))
            for d in recurrence.occurrences(schedule_of(rule), future_from, horizon, limit=31):
                if d not in handled:
                    items.append(DueItem(rule, d, today))
        return sorted(items, key=lambda item: (item.occurrence_date, item.rule.id))

    # ----------------------------------------------------------- validation

    def _category(self, category_id: int | None, kind: CategoryKind) -> int | None:
        if category_id is None:
            return None
        category = self.session.get(Category, int(category_id))
        if category is None:
            raise NotFoundError(f"Category {category_id} was not found.")
        if category.kind != kind.value:
            raise ValidationError(f"Category '{category.name}' cannot be used for a {kind.value}.")
        if not category.is_active:
            raise ValidationError(f"Category '{category.name}' is archived.")
        return category.id

    def _normalise(self, data: dict) -> dict:
        name = (data.get("name") or "").strip()
        if not name:
            raise ValidationError("Give the recurring transaction a name.")
        tx_type = TransactionType(data["transaction_type"])
        if tx_type not in ALLOWED_TYPES:
            raise ValidationError("Recurring transactions can be income, expense or transfer.")
        amount = int(data.get("amount_minor") or 0)
        if amount <= 0:
            raise ValidationError("Amount must be greater than zero.")
        account = self.accounts.get_active(int(data["account_id"]))
        frequency = RecurringFrequency(data["frequency"])
        start: date = data["start_date"]
        day_of_month = data.get("day_of_month")
        if frequency is not RecurringFrequency.MONTHLY:
            day_of_month = None
        elif day_of_month is None:
            day_of_month = start.day
        try:
            recurrence.Schedule(
                frequency, int(data.get("interval") or 1), start, data.get("end_date"), day_of_month
            )
        except ValueError as exc:
            raise ValidationError(f"Invalid schedule: {exc}.") from exc

        clean = {
            "name": name,
            "transaction_type": tx_type.value,
            "account_id": account.id,
            "amount_minor": amount,
            "currency": account.currency,
            "description": (data.get("description") or "").strip(),
            "note": data.get("note"),
            "frequency": frequency.value,
            "interval": int(data.get("interval") or 1),
            "start_date": start,
            "end_date": data.get("end_date"),
            "day_of_month": day_of_month,
            "mode": RecurringMode(data.get("mode") or RecurringMode.REVIEW.value).value,
            "destination_account_id": None,
            "dest_amount_minor": None,
            "category_id": None,
        }
        if tx_type is TransactionType.TRANSFER:
            if not data.get("destination_account_id"):
                raise ValidationError("A recurring transfer needs a destination account.")
            destination = self.accounts.get_active(int(data["destination_account_id"]))
            if destination.id == account.id:
                raise ValidationError("The source and destination accounts must be different.")
            clean["destination_account_id"] = destination.id
            if destination.currency != account.currency:
                dest_amount = int(data.get("dest_amount_minor") or 0)
                if dest_amount <= 0:
                    raise ValidationError(
                        f"A cross-currency transfer needs the amount received in "
                        f"{destination.currency}."
                    )
                clean["dest_amount_minor"] = dest_amount
        else:
            kind = CategoryKind.INCOME if tx_type is TransactionType.INCOME else CategoryKind.EXPENSE
            clean["category_id"] = self._category(data.get("category_id"), kind)
        return clean

    # ------------------------------------------------------------- commands

    def _recompute_cursor(self, rule: RecurringRule, floor: date) -> None:
        """Point next_run_date at the first unhandled occurrence >= floor."""
        schedule = schedule_of(rule)
        handled = self.handled_dates(rule.id, since=floor)
        current = recurrence.first_on_or_after(schedule, floor)
        while current is not None and current in handled:
            current = recurrence.first_after(schedule, current)
        rule.next_run_date = current

    def create(self, data: dict) -> RecurringRule:
        clean = self._normalise(data)
        rule = RecurringRule(**clean, status=RecurringStatus.ACTIVE.value)
        self.session.add(rule)
        self.session.flush()
        self._recompute_cursor(rule, rule.start_date)
        self.session.commit()
        logger.info("recurring_rule_created id=%s", rule.id)
        return rule

    def update(self, rule_id: int, data: dict) -> RecurringRule:
        rule = self.get(rule_id)
        if rule.status == RecurringStatus.ARCHIVED.value:
            raise ConflictError("An archived recurring transaction cannot be edited.")
        merged = {field: getattr(rule, field) for field in EDITABLE_FIELDS}
        merged.update({k: v for k, v in data.items() if k in EDITABLE_FIELDS})
        clean = self._normalise(merged)
        schedule_changed = any(clean[f] != getattr(rule, f) for f in SCHEDULE_FIELDS)
        for field, value in clean.items():
            setattr(rule, field, value)
        if schedule_changed:
            last = self.session.scalar(
                select(func.max(RecurringOccurrence.occurrence_date)).where(
                    RecurringOccurrence.rule_id == rule.id
                )
            )
            floor = rule.start_date if last is None else max(rule.start_date, last + timedelta(1))
            self._recompute_cursor(rule, floor)
        self.session.commit()
        logger.info("recurring_rule_updated id=%s", rule.id)
        return rule

    def _set_status(self, rule_id: int, status: RecurringStatus) -> RecurringRule:
        rule = self.get(rule_id)
        rule.status = status.value
        self.session.commit()
        logger.info("recurring_rule_status id=%s status=%s", rule.id, status.value)
        return rule

    def pause(self, rule_id: int) -> RecurringRule:
        rule = self.get(rule_id)
        if rule.status != RecurringStatus.ACTIVE.value:
            raise ConflictError("Only an active recurring transaction can be paused.")
        return self._set_status(rule_id, RecurringStatus.PAUSED)

    def resume(self, rule_id: int, today: date) -> RecurringRule:
        """Resume from today: occurrences that fell during the pause are not created."""
        rule = self.get(rule_id)
        if rule.status != RecurringStatus.PAUSED.value:
            raise ConflictError("Only a paused recurring transaction can be resumed.")
        rule.status = RecurringStatus.ACTIVE.value
        floor = max(rule.next_run_date or rule.start_date, today)
        self._recompute_cursor(rule, floor)
        self.session.commit()
        logger.info("recurring_rule_status id=%s status=active", rule.id)
        return rule

    def archive(self, rule_id: int) -> RecurringRule:
        """Archived rules stop for good; their generated transactions remain."""
        return self._set_status(rule_id, RecurringStatus.ARCHIVED)

    # ----------------------------------------------------------- generation

    def _existing(self, rule_id: int, occurrence_date: date) -> RecurringOccurrence | None:
        return self.session.scalar(
            select(RecurringOccurrence).where(
                RecurringOccurrence.rule_id == rule_id,
                RecurringOccurrence.occurrence_date == occurrence_date,
            )
        )

    def _check_actionable(self, rule: RecurringRule, occurrence_date: date, today: date) -> None:
        if rule.status != RecurringStatus.ACTIVE.value:
            raise ConflictError(f"'{rule.name}' is {rule.status}. Resume it first.")
        if not recurrence.is_occurrence(schedule_of(rule), occurrence_date):
            raise ValidationError(f"{occurrence_date.isoformat()} is not a scheduled date of '{rule.name}'.")
        if occurrence_date > today:
            raise ValidationError("This occurrence is not due yet.")
        if rule.next_run_date is None or occurrence_date < rule.next_run_date:
            raise ConflictError("This occurrence was already handled or falls before the schedule resumed.")

    def _ledger_payload(self, rule: RecurringRule, occurrence_date: date) -> dict:
        common = {
            "transaction_date": occurrence_date,
            "description": rule.description or rule.name,
            "note": rule.note,
            "amount_minor": rule.amount_minor,
            "recurring_rule_id": rule.id,
        }
        if rule.transaction_type == TransactionType.TRANSFER.value:
            return {
                **common,
                "from_account_id": rule.account_id,
                "to_account_id": rule.destination_account_id,
                "dest_amount_minor": rule.dest_amount_minor,
            }
        return {
            **common,
            "type": rule.transaction_type,
            "account_id": rule.account_id,
            "currency": rule.currency,
            "category_id": rule.category_id,
        }

    def _record(
        self, rule: RecurringRule, occurrence_date: date, status: OccurrenceStatus
    ) -> RecurringOccurrence:
        """Write the occurrence (and, if generating, its transaction) atomically."""
        transaction: Transaction | None = None
        try:
            if status is OccurrenceStatus.GENERATED:
                payload = self._ledger_payload(rule, occurrence_date)
                if rule.transaction_type == TransactionType.TRANSFER.value:
                    transaction = self.ledger.create_transfer(payload, commit=False)
                else:
                    transaction = self.ledger.create_transaction(payload, commit=False)
            occurrence = RecurringOccurrence(
                rule_id=rule.id,
                occurrence_date=occurrence_date,
                status=status.value,
                transaction_id=transaction.id if transaction else None,
            )
            self.session.add(occurrence)
            self.session.flush()  # the unique key is enforced here
            if transaction is not None:
                rule.last_generated_at = utcnow()
            self._recompute_cursor(rule, rule.next_run_date or occurrence_date)
            self.session.commit()
        except IntegrityError:
            self.session.rollback()
            existing = self._existing(rule.id, occurrence_date)
            if existing is None:
                raise
            logger.info("recurring_occurrence_already_handled rule=%s", rule.id)
            return existing
        except Exception:
            self.session.rollback()
            raise
        logger.info("recurring_occurrence_%s rule=%s", status.value, rule.id)
        return occurrence

    def generate(self, rule_id: int, occurrence_date: date, today: date) -> RecurringOccurrence:
        """Create the transaction for one occurrence. Safe to call repeatedly."""
        rule = self.get(rule_id)
        existing = self._existing(rule.id, occurrence_date)
        if existing is not None:
            return existing
        self._check_actionable(rule, occurrence_date, today)
        return self._record(rule, occurrence_date, OccurrenceStatus.GENERATED)

    def skip(self, rule_id: int, occurrence_date: date, today: date) -> RecurringOccurrence:
        rule = self.get(rule_id)
        existing = self._existing(rule.id, occurrence_date)
        if existing is not None:
            return existing
        self._check_actionable(rule, occurrence_date, today)
        return self._record(rule, occurrence_date, OccurrenceStatus.SKIPPED)

    def process_due(self, today: date) -> ProcessResult:
        """Generate every due occurrence of every active automatic rule.

        A failure (say, a missing exchange rate) stops that rule at the failing
        date so later dates never jump ahead of it; other rules carry on.
        """
        result = ProcessResult(generated=[], failed=[])
        rules = [
            rule for rule in self.list()
            if rule.mode == RecurringMode.AUTOMATIC.value
            and rule.status == RecurringStatus.ACTIVE.value
        ]
        for rule in rules:
            for occurrence_date in self.due_dates(rule, today):
                try:
                    occurrence = self.generate(rule.id, occurrence_date, today)
                except AppError as exc:
                    result.failed.append((rule.id, occurrence_date, exc.message))
                    logger.info("recurring_auto_failed rule=%s code=%s", rule.id, exc.code)
                    break
                if occurrence.transaction_id is not None:
                    result.generated.append((rule.id, occurrence_date, occurrence.transaction_id))
        return result
