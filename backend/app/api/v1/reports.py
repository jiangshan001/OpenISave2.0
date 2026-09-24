from __future__ import annotations

from fastapi import APIRouter, Path, Query

from app.api.deps import ActivityDep, DashboardDep, ReportDep

router = APIRouter(tags=["reports"])


@router.get("/dashboard")
def get_dashboard(service: DashboardDep) -> dict:
    return service.build()


@router.get("/dashboard/activity")
def get_dashboard_activity(
    service: ActivityDep,
    months: int = Query(default=12, ge=1, le=24),
) -> dict:
    """Daily income and expense totals (base currency) for the Overview heatmap."""
    return service.daily_activity(months=months)


@router.get("/reports/monthly/{year}/{month}")
def monthly_report(
    service: ReportDep,
    year: int = Path(ge=1900, le=2999),
    month: int = Path(ge=1, le=12),
) -> dict:
    return service.monthly(year, month)
