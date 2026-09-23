"""Savings goals.

A goal aggregates the balances of one or more accounts into the goal's
currency. It is a reporting view only: it never holds money, never changes an
account balance and never affects net worth (invariant 7). The same account may
belong to any number of goals -- that duplicates a *label*, not cash.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from sqlalchemy.orm import Session

from app.core.enums import AccountType, GoalSelectionMode, is_liability
from app.core.exceptions import (
    ConflictError,
    FxRateUnavailableError,
    NotFoundError,
    ValidationError,
)
from app.core.logging import get_logger
from app.core.money import convert_minor, is_supported
from app.models.account import Account
from app.models.goal import Goal
from app.repositories.goals import GoalRepository
from app.services.account_service import AccountService
from app.services.fx_service import FxService

logger = get_logger(__name__)


def is_eligible_for_goals(account: Account) -> bool:
    """Whether an account can count towards a savings goal.

    The rule is deliberately narrow and predictable: an account is eligible
    when it is active, not archived, counted in net worth, and holds assets
    rather than debt. Credit cards, loans and other liabilities are never
    savings.
    """
    if account.is_archived or not account.is_active:
        return False
    if not account.include_in_net_worth:
        return False
    return not is_liability(AccountType(account.account_type))


@dataclass
class GoalContribution:
    account_id: int
    account_name: str
    currency: str
    balance_minor: int
    converted_minor: int | None
    fx_freshness: str
    is_eligible: bool
    shared_with_goals: int


@dataclass
class GoalProgress:
    goal: Goal
    current_amount_minor: int | None
    progress_percent: float | None
    remaining_minor: int | None
    contributions: list[GoalContribution] = field(default_factory=list)
    unconverted_accounts: list[str] = field(default_factory=list)

    @property
    def account_count(self) -> int:
        return len(self.contributions)

    @property
    def fx_freshness(self) -> str:
        if self.unconverted_accounts:
            return "missing"
        states = {item.fx_freshness for item in self.contributions}
        if "stale" in states:
            return "stale"
        return "fresh" if states else "identity"


class GoalService:
    def __init__(self, session: Session, accounts: AccountService, fx: FxService) -> None:
        self.session = session
        self.repo = GoalRepository(session)
        self.accounts = accounts
        self.fx = fx

    # -------------------------------------------------------------- reading

    def accounts_for(self, goal: Goal) -> list[Account]:
        if goal.selection_mode == GoalSelectionMode.ALL_ELIGIBLE.value:
            return [item for item in self.accounts.list() if is_eligible_for_goals(item)]
        linked = self.repo.linked_account_ids(goal.id)
        resolved = [self.accounts.repo.get(account_id) for account_id in linked]
        return [item for item in resolved if item is not None]

    def progress(self, goal: Goal, *, usage: dict[int, int] | None = None) -> GoalProgress:
        usage = usage if usage is not None else self.repo.account_usage_counts()
        contributions: list[GoalContribution] = []
        unconverted: list[str] = []
        total = 0
        any_converted = False

        for account in self.accounts_for(goal):
            balance = self.accounts.balance_minor(account)
            # A goal measures savings, so an overdrawn account contributes zero
            # rather than eating into another account's progress.
            usable = max(balance, 0)
            converted: int | None
            freshness = "identity"
            if account.currency == goal.currency:
                converted = usable
            else:
                try:
                    resolved = self.fx.resolve_rate(account.currency, goal.currency)
                except FxRateUnavailableError:
                    converted = None
                    freshness = "missing"
                else:
                    converted = convert_minor(usable, account.currency, goal.currency, resolved.rate)
                    freshness = resolved.freshness
            if converted is None:
                unconverted.append(account.name)
            else:
                total += converted
                any_converted = True
            contributions.append(
                GoalContribution(
                    account_id=account.id,
                    account_name=account.name,
                    currency=account.currency,
                    balance_minor=balance,
                    converted_minor=converted,
                    fx_freshness=freshness,
                    is_eligible=is_eligible_for_goals(account),
                    shared_with_goals=usage.get(account.id, 0),
                )
            )

        current: int | None = total if (any_converted or not contributions) else None
        percent: float | None = None
        remaining: int | None = None
        if goal.target_amount_minor and current is not None:
            percent = round(current / goal.target_amount_minor * 100, 1)
            remaining = max(goal.target_amount_minor - current, 0)

        return GoalProgress(goal, current, percent, remaining, contributions, unconverted)

    def list_progress(self, *, include_inactive: bool = False) -> list[GoalProgress]:
        usage = self.repo.account_usage_counts()
        return [
            self.progress(goal, usage=usage)
            for goal in self.repo.list(include_inactive=include_inactive)
        ]

    def get(self, goal_id: int) -> Goal:
        goal = self.repo.get(goal_id)
        if goal is None:
            raise NotFoundError(f"Goal {goal_id} was not found.")
        return goal

    # -------------------------------------------------------------- writing

    def _validate(self, data: dict, *, current: Goal | None = None) -> None:
        currency = (data.get("currency") or (current.currency if current else "")).upper()
        if not is_supported(currency):
            raise ValidationError(f"Currency {currency} is not supported.")
        target = data.get("target_amount_minor")
        if target is not None and int(target) <= 0:
            raise ValidationError("A savings target must be greater than zero.")
        deadline: date | None = data.get("deadline")
        if deadline is not None and current is None and deadline < date.today():
            raise ValidationError("A goal deadline cannot be in the past.")

        mode = data.get("selection_mode") or (
            current.selection_mode if current else GoalSelectionMode.SELECTED.value
        )
        account_ids = data.get("account_ids")
        if mode == GoalSelectionMode.SELECTED.value and account_ids is not None:
            for account_id in account_ids:
                account = self.accounts.get(int(account_id))
                if is_liability(AccountType(account.account_type)):
                    raise ValidationError(
                        f"'{account.name}' is a liability account and cannot fund a savings goal."
                    )

    def _apply_accounts(self, goal: Goal, data: dict) -> None:
        if goal.selection_mode == GoalSelectionMode.ALL_ELIGIBLE.value:
            self.repo.set_accounts(goal.id, [])
            return
        if "account_ids" in data and data["account_ids"] is not None:
            self.repo.set_accounts(goal.id, [int(item) for item in data["account_ids"]])

    def create(self, data: dict) -> Goal:
        name = (data.get("name") or "").strip()
        if not name:
            raise ValidationError("Goal name is required.")
        if self.repo.get_by_name(name) is not None:
            raise ConflictError(f"A goal named '{name}' already exists.")
        self._validate(data)
        goal = Goal(
            name=name,
            target_amount_minor=data.get("target_amount_minor"),
            currency=data["currency"].upper(),
            deadline=data.get("deadline"),
            selection_mode=GoalSelectionMode(
                data.get("selection_mode") or GoalSelectionMode.SELECTED.value
            ).value,
            note=data.get("note"),
            sort_order=int(data.get("sort_order") or 0),
        )
        self.repo.add(goal)
        self._apply_accounts(goal, data)
        self.session.commit()
        logger.info("goal_created id=%s mode=%s", goal.id, goal.selection_mode)
        return goal

    def update(self, goal_id: int, data: dict) -> Goal:
        goal = self.get(goal_id)
        self._validate(data, current=goal)
        if data.get("name"):
            new_name = data["name"].strip()
            existing = self.repo.get_by_name(new_name)
            if existing is not None and existing.id != goal.id:
                raise ConflictError(f"A goal named '{new_name}' already exists.")
            goal.name = new_name
        for field_name in ("target_amount_minor", "deadline", "note"):
            if field_name in data:
                setattr(goal, field_name, data[field_name])
        if data.get("currency"):
            goal.currency = data["currency"].upper()
        if data.get("selection_mode"):
            goal.selection_mode = GoalSelectionMode(data["selection_mode"]).value
        if data.get("is_active") is not None:
            goal.is_active = bool(data["is_active"])
        self.session.flush()
        self._apply_accounts(goal, data)
        self.session.commit()
        logger.info("goal_updated id=%s", goal.id)
        return goal

    def delete(self, goal_id: int) -> None:
        goal = self.get(goal_id)
        self.repo.delete(goal)
        self.session.commit()
        logger.info("goal_deleted id=%s", goal_id)
