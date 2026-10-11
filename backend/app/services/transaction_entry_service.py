"""Read-only account/currency ranking for manual income and expense entry."""

from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from app.core.enums import CategoryKind
from app.repositories.accounts import AccountRepository
from app.repositories.transactions import TransactionRepository


class TransactionEntryService:
    def __init__(self, session: Session) -> None:
        self.accounts = AccountRepository(session)
        self.transactions = TransactionRepository(session)

    def options(self, kind: CategoryKind) -> dict:
        # All history, including imports and recurring entries, survives restarts.
        # Fees linked to transfers are not intentional account selections.
        usage = self.transactions.entry_account_usage(kind.value)
        groups: dict[str, dict] = {}
        for account in self.accounts.list():
            if not account.is_active:
                continue
            count, last_used = usage.get(account.id, (0, date.min))
            group = groups.setdefault(account.currency, {
                "currency": account.currency, "usage_count": 0,
                "last_used": date.min, "accounts": [],
            })
            group["usage_count"] += count
            group["last_used"] = max(group["last_used"], last_used)
            group["accounts"].append({
                "account_id": account.id, "usage_count": count, "last_used": last_used,
            })

        # Stable ties retain the existing configured account order.
        ranked = sorted(groups.values(), key=lambda g: (g["usage_count"], g["last_used"]),
                        reverse=True)
        for group in ranked:
            group["accounts"].sort(key=lambda a: (a["usage_count"], a["last_used"]),
                                   reverse=True)
            group.pop("last_used")
            for account in group["accounts"]:
                account.pop("last_used")
        return {"type": kind.value, "currencies": ranked}
