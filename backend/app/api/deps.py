"""FastAPI dependency wiring.

Routes receive fully constructed services; they never build repositories or
touch the session directly.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.repositories.settings import SettingsRepository
from app.services.account_service import AccountService
from app.services.activity_service import ActivityService
from app.services.asset_service import AssetService
from app.services.budget_service import BudgetService
from app.services.categorisation_service import CategorisationService
from app.services.category_service import CategoryService
from app.services.dashboard_service import DashboardService
from app.services.fx_service import FxService
from app.services.goal_service import GoalService
from app.services.ledger_service import LedgerService
from app.services.liability_service import LiabilityService
from app.services.networth_service import NetWorthService
from app.services.recurring_service import RecurringService
from app.services.report_service import ReportService
from app.services.statement_import_service import StatementImportService

DbSession = Annotated[Session, Depends(get_db)]


def get_fx_service(session: DbSession) -> FxService:
    stale_days = SettingsRepository(session).get().fx_stale_after_days
    return FxService(session, stale_after_days=stale_days)


FxDep = Annotated[FxService, Depends(get_fx_service)]


def get_account_service(session: DbSession, fx: FxDep) -> AccountService:
    return AccountService(session, fx)


AccountDep = Annotated[AccountService, Depends(get_account_service)]


def get_ledger_service(session: DbSession, accounts: AccountDep, fx: FxDep) -> LedgerService:
    return LedgerService(session, accounts, fx)


LedgerDep = Annotated[LedgerService, Depends(get_ledger_service)]


def get_recurring_service(session: DbSession, ledger: LedgerDep) -> RecurringService:
    return RecurringService(session, ledger)


RecurringDep = Annotated[RecurringService, Depends(get_recurring_service)]


def get_rules_service(session: DbSession) -> CategorisationService:
    return CategorisationService(session)


RulesDep = Annotated[CategorisationService, Depends(get_rules_service)]


def get_import_service(
    session: DbSession, ledger: LedgerDep, rules: RulesDep
) -> StatementImportService:
    return StatementImportService(session, ledger, rules)


ImportDep = Annotated[StatementImportService, Depends(get_import_service)]


def get_asset_service(session: DbSession, fx: FxDep, ledger: LedgerDep) -> AssetService:
    return AssetService(session, fx, ledger)


AssetDep = Annotated[AssetService, Depends(get_asset_service)]


def get_networth_service(
    session: DbSession, accounts: AccountDep, assets: AssetDep
) -> NetWorthService:
    return NetWorthService(session, accounts, assets)


NetWorthDep = Annotated[NetWorthService, Depends(get_networth_service)]


def get_goal_service(session: DbSession, accounts: AccountDep, fx: FxDep) -> GoalService:
    return GoalService(session, accounts, fx)


GoalDep = Annotated[GoalService, Depends(get_goal_service)]


def get_liability_service(session: DbSession, accounts: AccountDep) -> LiabilityService:
    return LiabilityService(session, accounts)


LiabilityDep = Annotated[LiabilityService, Depends(get_liability_service)]


def get_budget_service(session: DbSession) -> BudgetService:
    return BudgetService(session)


BudgetDep = Annotated[BudgetService, Depends(get_budget_service)]


def get_category_service(session: DbSession) -> CategoryService:
    return CategoryService(session)


CategoryDep = Annotated[CategoryService, Depends(get_category_service)]


def get_dashboard_service(
    session: DbSession,
    accounts: AccountDep,
    networth: NetWorthDep,
    goals: GoalDep,
    budgets: BudgetDep,
    fx: FxDep,
) -> DashboardService:
    return DashboardService(session, accounts, networth, goals, budgets, fx)


DashboardDep = Annotated[DashboardService, Depends(get_dashboard_service)]


def get_activity_service(session: DbSession) -> ActivityService:
    return ActivityService(session)


ActivityDep = Annotated[ActivityService, Depends(get_activity_service)]


def get_report_service(
    session: DbSession,
    accounts: AccountDep,
    networth: NetWorthDep,
    goals: GoalDep,
    budgets: BudgetDep,
    dashboard: DashboardDep,
) -> ReportService:
    return ReportService(session, accounts, networth, goals, budgets, dashboard)


ReportDep = Annotated[ReportService, Depends(get_report_service)]
