from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import (
    accounts,
    assets,
    budgets,
    categories,
    fx,
    goals,
    imports,
    liabilities,
    recurring,
    reports,
    rules,
    security,
    settings,
    transactions,
)

api_router = APIRouter()
api_router.include_router(accounts.router)
api_router.include_router(assets.router)
api_router.include_router(liabilities.router)
api_router.include_router(transactions.router)
api_router.include_router(recurring.router)
api_router.include_router(imports.router)
api_router.include_router(rules.router)
api_router.include_router(categories.router)
api_router.include_router(goals.router)
api_router.include_router(budgets.router)
api_router.include_router(fx.router)
api_router.include_router(reports.router)
api_router.include_router(settings.router)
api_router.include_router(security.router)
