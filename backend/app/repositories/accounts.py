"""Account persistence and raw balance aggregation."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.posting import Posting
from app.models.transaction import Transaction


class AccountRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self, account_id: int) -> Account | None:
        return self.session.get(Account, account_id)

    def get_by_name(self, name: str) -> Account | None:
        return self.session.scalar(select(Account).where(Account.name == name))

    def list(self, *, include_archived: bool = False) -> list[Account]:
        stmt = select(Account)
        if not include_archived:
            stmt = stmt.where(Account.is_archived.is_(False))
        stmt = stmt.order_by(Account.sort_order, Account.id)
        return list(self.session.scalars(stmt))

    def add(self, account: Account) -> Account:
        self.session.add(account)
        self.session.flush()
        return account

    def posting_totals(self) -> dict[int, int]:
        """Sum of non-voided account postings, keyed by account id."""
        stmt = (
            select(Posting.account_id, func.coalesce(func.sum(Posting.amount_minor), 0))
            .join(Transaction, Transaction.id == Posting.transaction_id)
            .where(Posting.account_id.is_not(None), Transaction.is_voided.is_(False))
            .group_by(Posting.account_id)
        )
        return {row[0]: int(row[1]) for row in self.session.execute(stmt)}

    def posting_total_for(self, account_id: int, *, until=None) -> int:
        stmt = (
            select(func.coalesce(func.sum(Posting.amount_minor), 0))
            .join(Transaction, Transaction.id == Posting.transaction_id)
            .where(Posting.account_id == account_id, Transaction.is_voided.is_(False))
        )
        if until is not None:
            stmt = stmt.where(Transaction.transaction_date <= until)
        return int(self.session.scalar(stmt) or 0)

    def movement_between(self, account_id: int, start, end) -> tuple[int, int]:
        """(deposits, withdrawals) for a closed date range, as positive minor units."""
        stmt = (
            select(Posting.amount_minor)
            .join(Transaction, Transaction.id == Posting.transaction_id)
            .where(
                Posting.account_id == account_id,
                Transaction.is_voided.is_(False),
                Transaction.transaction_date >= start,
                Transaction.transaction_date <= end,
            )
        )
        deposits = 0
        withdrawals = 0
        for (amount,) in self.session.execute(stmt):
            if amount >= 0:
                deposits += amount
            else:
                withdrawals += -amount
        return deposits, withdrawals

    def has_postings(self, account_id: int) -> bool:
        stmt = select(func.count()).select_from(Posting).where(Posting.account_id == account_id)
        return bool(self.session.scalar(stmt))
