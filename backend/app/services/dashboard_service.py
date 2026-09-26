"""Dashboard aggregation.

This service composes existing services; it performs no independent financial
arithmetic of its own beyond summing values they return.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from app.core.enums import CategoryKind, TransactionType
from app.core.money import BASE_CURRENCY
from app.repositories.categories import CategoryRepository
from app.repositories.transactions import TransactionRepository
from app.services.account_service import AccountService
from app.services.budget_service import BudgetPeriod, BudgetService, month_bounds
from app.services.fx_service import FxService
from app.services.goal_service import GoalService
from app.services.networth_service import NetWorthService


class DashboardService:
    def __init__(
        self,
        session: Session,
        accounts: AccountService,
        networth: NetWorthService,
        goals: GoalService,
        budgets: BudgetService,
        fx: FxService,
    ) -> None:
        self.session = session
        self.accounts = accounts
        self.networth = networth
        self.goals = goals
        self.budgets = budgets
        self.fx = fx
        self.transactions = TransactionRepository(session)
        self.categories = CategoryRepository(session)

    def category_breakdown(self, start: date, end: date, kind: CategoryKind) -> list[dict]:
        totals = self.transactions.totals_by_category(start, end, kind.value)
        rows: list[dict] = []
        for category_id, amount in totals.items():
            if amount == 0:
                continue
            name = "Uncategorised"
            parent_name = None
            if category_id is not None:
                category = self.categories.get(category_id)
                if category is not None:
                    name = category.name
                    parent = (
                        self.categories.get(category.parent_id) if category.parent_id else None
                    )
                    parent_name = parent.name if parent else None
            rows.append(
                {
                    "category_id": category_id,
                    "category_name": name,
                    "parent_name": parent_name,
                    "amount_minor": amount,
                }
            )
        rows.sort(key=lambda row: row["amount_minor"], reverse=True)
        return rows

    def cash_flow_series(self, year: int, month: int, months: int = 6) -> list[dict]:
        end_year, end_month = year, month
        start_month_index = end_year * 12 + (end_month - 1) - (months - 1)
        start_year, start_month = divmod(start_month_index, 12)
        start = month_bounds(start_year, start_month + 1)[0]
        end = month_bounds(end_year, end_month)[1]

        buckets: dict[str, dict[str, int]] = {}
        for index in range(months):
            cursor = start_month_index + index
            bucket_year, bucket_month = divmod(cursor, 12)
            key = f"{bucket_year:04d}-{bucket_month + 1:02d}"
            buckets[key] = {"income_minor": 0, "expense_minor": 0}
        for key, row_type, amount in self.transactions.monthly_series(start, end):
            if key not in buckets:
                continue
            field = "income_minor" if row_type == TransactionType.INCOME.value else "expense_minor"
            buckets[key][field] = amount
        return [
            {
                "month": key,
                "income_minor": value["income_minor"],
                "expense_minor": value["expense_minor"],
                "net_minor": value["income_minor"] - value["expense_minor"],
            }
            for key, value in sorted(buckets.items())
        ]

    @staticmethod
    def budget_usage(period: BudgetPeriod) -> dict:
        """Every active budget line for the month with its live ledger actual.

        Actuals come from BudgetService (expense transactions in the category
        subtree, base currency); nothing here is entered by hand.
        """
        total = period.total_budget_minor
        return {
            "total_budget_minor": total,
            "total_actual_minor": period.total_actual_minor,
            "total_remaining_minor": period.total_remaining_minor,
            "total_used_percent": (
                round(period.total_actual_minor / total * 100, 1) if total else None
            ),
            "lines": [line.__dict__ for line in period.lines],
        }

    def build(self, today: date | None = None) -> dict:
        today = today or date.today()
        start, end = month_bounds(today.year, today.month)
        net_worth = self.networth.calculate()
        totals = self.transactions.period_totals(start, end)
        income = totals[TransactionType.INCOME.value]
        expense = totals[TransactionType.EXPENSE.value]
        net_cash_flow = income - expense
        savings_rate = round(net_cash_flow / income * 100, 1) if income > 0 else None

        budget_period = self.budgets.get_period(today.year, today.month)

        accounts = [
            {
                "id": item.account.id,
                "name": item.account.name,
                "institution": item.account.institution,
                "account_type": item.account.account_type,
                "purpose": item.account.purpose,
                "currency": item.account.currency,
                "balance_minor": item.balance_minor,
                "base_balance_minor": item.base_balance_minor,
                "group": item.group,
                "fx_freshness": item.fx_freshness,
                "include_in_net_worth": item.account.include_in_net_worth,
            }
            for item in net_worth.balances
        ]

        return {
            "base_currency": BASE_CURRENCY,
            "period": {"year": today.year, "month": today.month},
            "net_worth_minor": net_worth.net_worth_minor,
            # Total assets means net worth assets only; possessions are separate.
            "total_assets_minor": net_worth.total_assets_minor,
            "net_worth_assets_minor": net_worth.total_assets_minor,
            "total_liabilities_minor": net_worth.total_liabilities_minor,
            "groups": net_worth.groups,
            "physical_assets_minor": net_worth.physical_assets_minor,
            "personal_possessions_minor": net_worth.personal_possessions_minor,
            "unconverted_accounts": net_worth.unconverted_accounts,
            "month_income_minor": income,
            "month_expense_minor": expense,
            "net_cash_flow_minor": net_cash_flow,
            "savings_rate_percent": savings_rate,
            "accounts": accounts,
            "expense_by_category": self.category_breakdown(start, end, CategoryKind.EXPENSE),
            "income_by_category": self.category_breakdown(start, end, CategoryKind.INCOME),
            "cash_flow_series": self.cash_flow_series(today.year, today.month),
            "budget": self.budget_usage(budget_period),
            "goals": [
                {
                    "id": item.goal.id,
                    "name": item.goal.name,
                    "currency": item.goal.currency,
                    "target_amount_minor": item.goal.target_amount_minor,
                    "current_amount_minor": item.current_amount_minor,
                    "progress_percent": item.progress_percent,
                    "selection_mode": item.goal.selection_mode,
                    "account_count": item.account_count,
                }
                for item in self.goals.list_progress()
            ],
            "recent_transactions": [
                {
                    "id": tx.id,
                    "type": tx.type,
                    "transaction_date": tx.transaction_date.isoformat(),
                    "description": tx.description,
                    "amount_minor": tx.amount_minor,
                    "currency": tx.currency,
                    "base_amount_minor": tx.base_amount_minor,
                    "category_id": tx.category_id,
                }
                for tx in self.transactions.recent(8)
            ],
            "fx_status": self.fx.status(),
        }
