from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import DbSession
from app.core.money import SUPPORTED_CURRENCIES
from app.repositories.settings import SettingsRepository
from app.schemas.common import CurrencyRead
from app.schemas.misc import SettingsRead, SettingsUpdate

router = APIRouter(tags=["settings"])


def _read(record) -> SettingsRead:
    return SettingsRead(
        base_currency=record.base_currency,
        timezone=record.timezone,
        locale=record.locale,
        fx_stale_after_days=record.fx_stale_after_days,
        supported_currencies=list(SUPPORTED_CURRENCIES),
    )


@router.get("/settings", response_model=SettingsRead)
def get_settings(session: DbSession) -> SettingsRead:
    repo = SettingsRepository(session)
    record = repo.get()
    session.commit()
    return _read(record)


@router.put("/settings", response_model=SettingsRead)
def update_settings(payload: SettingsUpdate, session: DbSession) -> SettingsRead:
    repo = SettingsRepository(session)
    record = repo.get()
    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(record, field, value)
    session.commit()
    return _read(record)


@router.get("/currencies", response_model=list[CurrencyRead])
def list_currencies(session: DbSession) -> list[CurrencyRead]:
    rows = SettingsRepository(session).list_currencies()
    return [CurrencyRead.model_validate(row) for row in rows]
