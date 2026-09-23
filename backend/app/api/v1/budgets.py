from __future__ import annotations

from fastapi import APIRouter, Path

from app.api.deps import BudgetDep
from app.schemas.misc import BudgetPeriodRead, BudgetSave

router = APIRouter(prefix="/budgets", tags=["budgets"])

Year = Path(ge=1900, le=2999)
Month = Path(ge=1, le=12)


@router.get("/{year}/{month}", response_model=BudgetPeriodRead)
def get_budget(service: BudgetDep, year: int = Year, month: int = Month) -> BudgetPeriodRead:
    period = service.get_period(year, month)
    return BudgetPeriodRead.model_validate(period, from_attributes=True)


@router.put("/{year}/{month}", response_model=BudgetPeriodRead)
def save_budget(
    payload: BudgetSave, service: BudgetDep, year: int = Year, month: int = Month
) -> BudgetPeriodRead:
    entries = [entry.model_dump() for entry in payload.entries]
    period = service.replace_period(year, month, entries)
    return BudgetPeriodRead.model_validate(period, from_attributes=True)
