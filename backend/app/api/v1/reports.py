from __future__ import annotations

from fastapi import APIRouter, Path

from app.api.deps import DashboardDep, ReportDep

router = APIRouter(tags=["reports"])


@router.get("/dashboard")
def get_dashboard(service: DashboardDep) -> dict:
    return service.build()


@router.get("/reports/monthly/{year}/{month}")
def monthly_report(
    service: ReportDep,
    year: int = Path(ge=1900, le=2999),
    month: int = Path(ge=1, le=12),
) -> dict:
    return service.monthly(year, month)
