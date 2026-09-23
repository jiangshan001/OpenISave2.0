from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import FxDep
from app.schemas.misc import FxManualRate, FxRateStatus, FxRefreshResult

router = APIRouter(prefix="/fx", tags=["fx"])


@router.get("/rates", response_model=list[FxRateStatus])
def list_rates(service: FxDep) -> list[FxRateStatus]:
    return [FxRateStatus.model_validate(row) for row in service.status()]


@router.post("/refresh", response_model=FxRefreshResult)
def refresh_rates(service: FxDep) -> FxRefreshResult:
    result = service.refresh()
    return FxRefreshResult(
        ok=result["ok"],
        updated=result["updated"],
        message=result["message"],
        rates=[FxRateStatus.model_validate(row) for row in service.status()],
    )


@router.post("/rates", response_model=list[FxRateStatus])
def set_manual_rate(payload: FxManualRate, service: FxDep) -> list[FxRateStatus]:
    service.set_manual_rate(
        payload.from_currency, payload.to_currency, payload.rate, payload.rate_date
    )
    return [FxRateStatus.model_validate(row) for row in service.status()]
