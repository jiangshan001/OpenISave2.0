"""Liability metadata persistence.

The outstanding balance is never stored here; it is read from the linked
account, which remains the single source of truth.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.liability import Liability


class LiabilityRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self, liability_id: int) -> Liability | None:
        return self.session.get(Liability, liability_id)

    def get_by_name(self, name: str) -> Liability | None:
        return self.session.scalar(select(Liability).where(Liability.name == name))

    def get_by_account(self, account_id: int) -> Liability | None:
        return self.session.scalar(select(Liability).where(Liability.account_id == account_id))

    def list(self) -> list[Liability]:
        return list(self.session.scalars(select(Liability).order_by(Liability.id)))

    def add(self, liability: Liability) -> Liability:
        self.session.add(liability)
        self.session.flush()
        return liability

    def delete(self, liability: Liability) -> None:
        self.session.delete(liability)
        self.session.flush()
