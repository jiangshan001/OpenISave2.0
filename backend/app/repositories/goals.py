"""Savings goal persistence."""

from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.goal import Goal, GoalAccount


class GoalRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self, goal_id: int) -> Goal | None:
        return self.session.get(Goal, goal_id)

    def get_by_name(self, name: str) -> Goal | None:
        return self.session.scalar(select(Goal).where(Goal.name == name))

    def list(self, *, include_inactive: bool = False) -> list[Goal]:
        stmt = select(Goal)
        if not include_inactive:
            stmt = stmt.where(Goal.is_active.is_(True))
        return list(self.session.scalars(stmt.order_by(Goal.sort_order, Goal.id)))

    def add(self, goal: Goal) -> Goal:
        self.session.add(goal)
        self.session.flush()
        return goal

    def delete(self, goal: Goal) -> None:
        self.session.delete(goal)
        self.session.flush()

    # ----------------------------------------------------------- memberships

    def linked_account_ids(self, goal_id: int) -> list[int]:
        stmt = (
            select(GoalAccount.account_id)
            .where(GoalAccount.goal_id == goal_id)
            .order_by(GoalAccount.id)
        )
        return list(self.session.scalars(stmt))

    def set_accounts(self, goal_id: int, account_ids: list[int]) -> None:
        """Replace a goal's account membership."""
        self.session.execute(delete(GoalAccount).where(GoalAccount.goal_id == goal_id))
        for account_id in dict.fromkeys(account_ids):
            self.session.add(GoalAccount(goal_id=goal_id, account_id=account_id))
        self.session.flush()

    def goals_using_account(self, account_id: int) -> list[int]:
        stmt = select(GoalAccount.goal_id).where(GoalAccount.account_id == account_id)
        return list(self.session.scalars(stmt))

    def account_usage_counts(self) -> dict[int, int]:
        """How many goals each account belongs to, for the 'shared' hint."""
        counts: dict[int, int] = {}
        for account_id in self.session.scalars(select(GoalAccount.account_id)):
            counts[account_id] = counts.get(account_id, 0) + 1
        return counts
