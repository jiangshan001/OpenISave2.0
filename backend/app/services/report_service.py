"""Monthly reporting.

Income and expense figures come from the FX values frozen on each transaction,
so a historical month never changes when today's exchange rates move
(invariant 4). Account closing balances are reported in native currency, with a
consolidated value computed at the latest rate and labelled as such.
"""

from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.core.enums import CategoryKind, TransactionType
from app.core.money import BASE_CURRENCY
from app.repositories.accounts import AccountRepository
from app.repositories.transactions import TransactionRepository
from app.services.account_service import AccountService
from app.services.budget_service import BudgetService, month_bounds
from app.services.dashboard_service import DashboardService
from app.services.goal_service import GoalService
from app.services.networth_service import NetWorthService


class ReportService:
    def __init__(
        self,
        session: Session,
        accounts: AccountService,
        networth: NetWorthService,
        goals: GoalService,
        budgets: BudgetService,
        dashboard: DashboardService,
    ) -> None:
        self.session = session
        self.accounts = accounts
        self.networth = networth
        self.goals = goals
        self.budgets = budgets
        self.dashboard = dashboard
        self.transactions = TransactionRepository(session)
        self.account_repo = AccountRepository(session)

    def _account_movement(self, start: date, end: date) -> list[dict]:
        rows: list[dict] = []
        day_before = start - timedelta(days=1)
        for account in self.account_repo.list(include_archived=True):
            opening = account.opening_balance_minor + self.account_repo.posting_total_for(
                account.id, until=day_before
            )
            deposits, withdrawals = self.account_repo.movement_between(account.id, start, end)
            closing = opening + deposits - withdrawals
            if opening == 0 and deposits == 0 and withdrawals == 0 and closing == 0:
                continue
            rows.append(
                {
                    "account_id": account.id,
                    "account_name": account.name,
                    "currency": account.currency,
                    "opening_balance_minor": opening,
                    "deposits_minor": deposits,
                    "withdrawals_minor": withdrawals,
                    "closing_balance_minor": closing,
                }
            )
        return rows

    def monthly(self, year: int, month: int) -> dict:
        start, end = month_bounds(year, month)
        totals = self.transactions.period_totals(start, end)
        income = totals[TransactionType.INCOME.value]
        expense = totals[TransactionType.EXPENSE.value]
        net = income - expense
        budget_period = self.budgets.get_period(year, month)
        net_worth = self.networth.calculate()

        return {
            "year": year,
            "month": month,
            "base_currency": BASE_CURRENCY,
            "period_start": start.isoformat(),
            "period_end": end.isoformat(),
            "summary": {
                "income_minor": income,
                "expense_minor": expense,
                "net_cash_flow_minor": net,
                "savings_rate_percent": round(net / income * 100, 1) if income > 0 else None,
                "net_worth_minor": net_worth.net_worth_minor,
                "total_assets_minor": net_worth.total_assets_minor,
                "total_liabilities_minor": net_worth.total_liabilities_minor,
            },
            "expense_by_category": self.dashboard.category_breakdown(
                start, end, CategoryKind.EXPENSE
            ),
            "income_by_category": self.dashboard.category_breakdown(
                start, end, CategoryKind.INCOME
            ),
            "account_movement": self._account_movement(start, end),
            "budget": {
                "total_budget_minor": budget_period.total_budget_minor,
                "total_actual_minor": budget_period.total_actual_minor,
                "total_remaining_minor": budget_period.total_remaining_minor,
                "lines": [line.__dict__ for line in budget_period.lines],
            },
            "goals": [
                {
                    "id": item.goal.id,
                    "name": item.goal.name,
                    "currency": item.goal.currency,
                    "target_amount_minor": item.goal.target_amount_minor,
                    "current_amount_minor": item.current_amount_minor,
                    "progress_percent": item.progress_percent,
                    "deadline": item.goal.deadline.isoformat() if item.goal.deadline else None,
                }
                for item in self.goals.list_progress()
            ],
            "cash_flow_series": self.dashboard.cash_flow_series(year, month, months=12),
        }
