"""Monthly budget persistence."""

from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.budget import Budget


class BudgetRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def list_for_period(self, year: int, month: int) -> list[Budget]:
        stmt = select(Budget).where(Budget.year == year, Budget.month == month)
        return list(self.session.scalars(stmt.order_by(Budget.category_id)))

    def replace_period(self, year: int, month: int, rows: list[Budget]) -> list[Budget]:
        self.session.execute(delete(Budget).where(Budget.year == year, Budget.month == month))
        for row in rows:
            self.session.add(row)
        self.session.flush()
        return self.list_for_period(year, month)

    def total_for_period(self, year: int, month: int) -> int:
        return sum(budget.amount_minor for budget in self.list_for_period(year, month))
