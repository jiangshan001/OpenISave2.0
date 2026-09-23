from __future__ import annotations

from datetime import date

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import GoalSelectionMode
from app.db.base import Base, TimestampMixin


class Goal(Base, TimestampMixin):
    """A savings goal.

    A goal is a read-only view over accounts that already hold money. It never
    stores a balance of its own, so linking an account to several goals cannot
    duplicate funds (invariant 7).
    """

    __tablename__ = "goals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    target_amount_minor: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    currency: Mapped[str] = mapped_column(ForeignKey("currencies.code"), nullable=False)
    deadline: Mapped[date | None] = mapped_column(Date, nullable=True)
    selection_mode: Mapped[str] = mapped_column(
        String(16), nullable=False, default=GoalSelectionMode.SELECTED.value
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    links = relationship(
        "GoalAccount",
        back_populates="goal",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class GoalAccount(Base, TimestampMixin):
    """Join row placing one account inside one goal.

    An account may appear in any number of goals; this is a reporting
    relationship and never moves money.
    """

    __tablename__ = "goal_accounts"
    __table_args__ = (UniqueConstraint("goal_id", "account_id", name="uq_goal_account"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    goal_id: Mapped[int] = mapped_column(
        ForeignKey("goals.id", ondelete="CASCADE"), nullable=False, index=True
    )
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )

    goal = relationship("Goal", back_populates="links")
