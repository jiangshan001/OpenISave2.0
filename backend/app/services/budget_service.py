"""Monthly budgets.

Actual spending is always derived from the ledger -- it is never entered by the
user -- and a budget on a parent category absorbs spending booked against its
descendants.
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, ValidationError
from app.core.logging import get_logger
from app.core.money import BASE_CURRENCY
from app.models.budget import Budget
from app.repositories.budgets import BudgetRepository
from app.repositories.categories import CategoryRepository
from app.repositories.transactions import TransactionRepository

logger = get_logger(__name__)


def month_bounds(year: int, month: int) -> tuple[date, date]:
    if not 1 <= month <= 12:
        raise ValidationError("Month must be between 1 and 12.")
    if not 1900 <= year <= 2999:
        raise ValidationError("Year is out of range.")
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last_day)


@dataclass
class BudgetLine:
    category_id: int
    category_name: str
    parent_name: str | None
    budget_minor: int
    actual_minor: int
    remaining_minor: int
    used_percent: float | None


@dataclass
class BudgetPeriod:
    year: int
    month: int
    currency: str
    total_budget_minor: int
    total_actual_minor: int
    total_remaining_minor: int
    lines: list[BudgetLine]


class BudgetService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.repo = BudgetRepository(session)
        self.categories = CategoryRepository(session)
        self.transactions = TransactionRepository(session)

    def actual_for_category(self, category_id: int, year: int, month: int) -> int:
        start, end = month_bounds(year, month)
        ids = self.categories.subtree_ids(category_id)
        return self.transactions.expense_total_for_categories(start, end, ids)

    def get_period(self, year: int, month: int) -> BudgetPeriod:
        month_bounds(year, month)
        rows = self.repo.list_for_period(year, month)
        lines: list[BudgetLine] = []
        total_budget = 0
        total_actual = 0
        for row in rows:
            category = self.categories.get(row.category_id)
            if category is None:
                continue
            parent = self.categories.get(category.parent_id) if category.parent_id else None
            actual = self.actual_for_category(category.id, year, month)
            percent = round(actual / row.amount_minor * 100, 1) if row.amount_minor else None
            lines.append(
                BudgetLine(
                    category_id=category.id,
                    category_name=category.name,
                    parent_name=parent.name if parent else None,
                    budget_minor=row.amount_minor,
                    actual_minor=actual,
                    remaining_minor=row.amount_minor - actual,
                    used_percent=percent,
                )
            )
            total_budget += row.amount_minor
            total_actual += actual
        lines.sort(key=lambda line: line.budget_minor, reverse=True)
        return BudgetPeriod(
            year=year,
            month=month,
            currency=BASE_CURRENCY,
            total_budget_minor=total_budget,
            total_actual_minor=total_actual,
            total_remaining_minor=total_budget - total_actual,
            lines=lines,
        )

    def replace_period(self, year: int, month: int, entries: list[dict]) -> BudgetPeriod:
        month_bounds(year, month)
        seen: set[int] = set()
        rows: list[Budget] = []
        for entry in entries:
            category_id = int(entry["category_id"])
            amount = int(entry["amount_minor"])
            if amount < 0:
                raise ValidationError("A budget amount cannot be negative.")
            if category_id in seen:
                raise ValidationError("Each category may appear only once in a monthly budget.")
            category = self.categories.get(category_id)
            if category is None:
                raise NotFoundError(f"Category {category_id} was not found.")
            if category.kind != "expense":
                raise ValidationError(f"'{category.name}' is not an expense category.")
            seen.add(category_id)
            if amount == 0:
                continue
            rows.append(
                Budget(
                    year=year,
                    month=month,
                    category_id=category_id,
                    amount_minor=amount,
                    currency=BASE_CURRENCY,
                )
            )
        self.repo.replace_period(year, month, rows)
        self.session.commit()
        logger.info("budget_saved year=%s month=%s lines=%s", year, month, len(rows))
        return self.get_period(year, month)
