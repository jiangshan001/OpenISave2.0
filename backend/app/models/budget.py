from __future__ import annotations

from sqlalchemy import BigInteger, CheckConstraint, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Budget(Base, TimestampMixin):
    """Monthly budget for one expense category, held in the base currency."""

    __tablename__ = "budgets"
    __table_args__ = (
        UniqueConstraint("year", "month", "category_id", name="uq_budget_period_category"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    month: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    category_id: Mapped[int] = mapped_column(
        ForeignKey("categories.id", ondelete="CASCADE"), nullable=False
    )
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="CNY")


class MonthlyBudget(Base, TimestampMixin):
    """Independent period-level limit; category budgets remain in `budgets`."""

    __tablename__ = "monthly_budgets"
    __table_args__ = (
        UniqueConstraint("year", "month", name="uq_monthly_budget_period"),
        CheckConstraint(
            "overall_limit_minor IS NULL OR overall_limit_minor > 0",
            name="ck_monthly_budget_positive_limit",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    overall_limit_minor: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
