"""Transaction persistence and ledger aggregation queries."""

from __future__ import annotations

from datetime import date

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from app.core.enums import TransactionType
from app.models.transaction import Transaction


class TransactionRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self, transaction_id: int) -> Transaction | None:
        return self.session.get(Transaction, transaction_id)

    def add(self, transaction: Transaction) -> Transaction:
        self.session.add(transaction)
        self.session.flush()
        return transaction

    def children_of(self, transaction_id: int) -> list[Transaction]:
        stmt = select(Transaction).where(Transaction.parent_transaction_id == transaction_id)
        return list(self.session.scalars(stmt))

    def _filtered(
        self,
        *,
        account_id: int | None = None,
        transaction_type: str | None = None,
        category_id: int | None = None,
        currency: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        search: str | None = None,
        include_voided: bool = False,
    ) -> Select:
        stmt = select(Transaction)
        if not include_voided:
            stmt = stmt.where(Transaction.is_voided.is_(False))
        if account_id is not None:
            stmt = stmt.where(
                or_(
                    Transaction.account_id == account_id,
                    Transaction.from_account_id == account_id,
                    Transaction.to_account_id == account_id,
                )
            )
        if transaction_type:
            stmt = stmt.where(Transaction.type == transaction_type)
        if category_id is not None:
            stmt = stmt.where(Transaction.category_id == category_id)
        if currency:
            stmt = stmt.where(
                or_(Transaction.currency == currency, Transaction.dest_currency == currency)
            )
        if date_from is not None:
            stmt = stmt.where(Transaction.transaction_date >= date_from)
        if date_to is not None:
            stmt = stmt.where(Transaction.transaction_date <= date_to)
        if search:
            pattern = f"%{search}%"
            stmt = stmt.where(
                or_(Transaction.description.like(pattern), Transaction.note.like(pattern))
            )
        return stmt

    def list(self, *, limit: int = 100, offset: int = 0, **filters) -> list[Transaction]:
        stmt = (
            self._filtered(**filters)
            .order_by(Transaction.transaction_date.desc(), Transaction.id.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(self.session.scalars(stmt))

    def count(self, **filters) -> int:
        stmt = self._filtered(**filters).with_only_columns(func.count(Transaction.id))
        return int(self.session.scalar(stmt) or 0)

    def recent(self, limit: int = 8) -> list[Transaction]:
        return self.list(limit=limit)

    def period_totals(self, start: date, end: date) -> dict[str, int]:
        """Income and expense totals in base minor units for a date range.

        Transfers are excluded by construction: only `income` and `expense`
        rows are summed.
        """
        stmt = (
            select(Transaction.type, func.coalesce(func.sum(Transaction.base_amount_minor), 0))
            .where(
                Transaction.is_voided.is_(False),
                Transaction.transaction_date >= start,
                Transaction.transaction_date <= end,
                Transaction.type.in_([TransactionType.INCOME.value, TransactionType.EXPENSE.value]),
            )
            .group_by(Transaction.type)
        )
        totals = {TransactionType.INCOME.value: 0, TransactionType.EXPENSE.value: 0}
        for row_type, total in self.session.execute(stmt):
            totals[row_type] = int(total)
        return totals

    def totals_by_category(self, start: date, end: date, kind: str) -> dict[int | None, int]:
        stmt = (
            select(
                Transaction.category_id,
                func.coalesce(func.sum(Transaction.base_amount_minor), 0),
            )
            .where(
                Transaction.is_voided.is_(False),
                Transaction.type == kind,
                Transaction.transaction_date >= start,
                Transaction.transaction_date <= end,
            )
            .group_by(Transaction.category_id)
        )
        return {row[0]: int(row[1]) for row in self.session.execute(stmt)}

    def expense_total_for_categories(
        self, start: date, end: date, category_ids: list[int]
    ) -> int:
        if not category_ids:
            return 0
        stmt = select(func.coalesce(func.sum(Transaction.base_amount_minor), 0)).where(
            Transaction.is_voided.is_(False),
            Transaction.type == TransactionType.EXPENSE.value,
            Transaction.transaction_date >= start,
            Transaction.transaction_date <= end,
            Transaction.category_id.in_(category_ids),
        )
        return int(self.session.scalar(stmt) or 0)

    def daily_totals(self, start: date, end: date) -> list[tuple[date, str, int, int]]:
        """Per-day income and expense sums in base minor units.

        Returns (day, type, total, transaction count). Like every cash-flow
        aggregate, only `income` and `expense` rows are summed, so transfers
        and asset movements never appear.
        """
        stmt = (
            select(
                Transaction.transaction_date,
                Transaction.type,
                func.coalesce(func.sum(Transaction.base_amount_minor), 0),
                func.count(Transaction.id),
            )
            .where(
                Transaction.is_voided.is_(False),
                Transaction.transaction_date >= start,
                Transaction.transaction_date <= end,
                Transaction.type.in_([TransactionType.INCOME.value, TransactionType.EXPENSE.value]),
            )
            .group_by(Transaction.transaction_date, Transaction.type)
            .order_by(Transaction.transaction_date)
        )
        return [(row[0], row[1], int(row[2]), int(row[3])) for row in self.session.execute(stmt)]

    def monthly_series(self, start: date, end: date) -> list[tuple[str, str, int]]:
        month = func.strftime("%Y-%m", Transaction.transaction_date)
        stmt = (
            select(month, Transaction.type, func.coalesce(func.sum(Transaction.base_amount_minor), 0))
            .where(
                Transaction.is_voided.is_(False),
                Transaction.transaction_date >= start,
                Transaction.transaction_date <= end,
                Transaction.type.in_([TransactionType.INCOME.value, TransactionType.EXPENSE.value]),
            )
            .group_by(month, Transaction.type)
            .order_by(month)
        )
        return [(row[0], row[1], int(row[2])) for row in self.session.execute(stmt)]
