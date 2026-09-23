"""Settings and currency metadata persistence."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.currency import Currency
from app.models.setting import AppSetting


class SettingsRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self) -> AppSetting:
        record = self.session.get(AppSetting, 1)
        if record is None:
            record = AppSetting(id=1)
            self.session.add(record)
            self.session.flush()
        return record

    def list_currencies(self, *, include_inactive: bool = False) -> list[Currency]:
        stmt = select(Currency)
        if not include_inactive:
            stmt = stmt.where(Currency.is_active.is_(True))
        return list(self.session.scalars(stmt.order_by(Currency.code)))

    def get_currency(self, code: str) -> Currency | None:
        return self.session.get(Currency, code.upper())
