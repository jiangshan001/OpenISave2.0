"""Account lifecycle and balance calculation.

This module is the single source of truth for account balances: everything else
(dashboard, reports, goals) reads balances from here.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from sqlalchemy.orm import Session

from app.core.enums import ACCOUNT_GROUPS, AccountType, is_liability
from app.core.exceptions import (
    ConflictError,
    FxRateUnavailableError,
    NotFoundError,
    ValidationError,
)
from app.core.logging import get_logger
from app.core.money import BASE_CURRENCY, convert_minor, is_supported
from app.models.account import Account
from app.repositories.accounts import AccountRepository
from app.services.fx_service import FxService

logger = get_logger(__name__)


@dataclass
class AccountBalance:
    account: Account
    balance_minor: int
    base_balance_minor: int | None
    fx_rate: str | None
    fx_freshness: str

    @property
    def group(self) -> str:
        return ACCOUNT_GROUPS[AccountType(self.account.account_type)]


class AccountService:
    def __init__(self, session: Session, fx: FxService) -> None:
        self.session = session
        self.repo = AccountRepository(session)
        self.fx = fx

    # ------------------------------------------------------------- balances

    def balance_minor(self, account: Account, *, until: date | None = None) -> int:
        """Opening balance plus every non-voided posting on the account."""
        return account.opening_balance_minor + self.repo.posting_total_for(account.id, until=until)

    def _to_base(self, amount_minor: int, currency: str) -> tuple[int | None, str | None, str]:
        if currency == BASE_CURRENCY:
            return amount_minor, "1", "identity"
        try:
            resolved = self.fx.rate_to_base(currency)
        except FxRateUnavailableError:
            return None, None, "missing"
        converted = convert_minor(amount_minor, currency, BASE_CURRENCY, resolved.rate)
        return converted, str(resolved.rate), resolved.freshness

    def balances(self, *, include_archived: bool = False) -> list[AccountBalance]:
        accounts = self.repo.list(include_archived=include_archived)
        totals = self.repo.posting_totals()
        result: list[AccountBalance] = []
        for account in accounts:
            balance = account.opening_balance_minor + totals.get(account.id, 0)
            base, rate, freshness = self._to_base(balance, account.currency)
            result.append(AccountBalance(account, balance, base, rate, freshness))
        return result

    def balance_for(self, account_id: int) -> AccountBalance:
        account = self.get(account_id)
        balance = self.balance_minor(account)
        base, rate, freshness = self._to_base(balance, account.currency)
        return AccountBalance(account, balance, base, rate, freshness)

    # -------------------------------------------------------------- commands

    def get(self, account_id: int) -> Account:
        account = self.repo.get(account_id)
        if account is None:
            raise NotFoundError(f"Account {account_id} was not found.")
        return account

    def get_active(self, account_id: int) -> Account:
        account = self.get(account_id)
        if account.is_archived or not account.is_active:
            raise ValidationError(f"Account '{account.name}' is no longer active.")
        return account

    def list(self, *, include_archived: bool = False) -> list[Account]:
        return self.repo.list(include_archived=include_archived)

    def create(self, data: dict) -> Account:
        name = data["name"].strip()
        if not name:
            raise ValidationError("Account name is required.")
        if self.repo.get_by_name(name) is not None:
            raise ConflictError(f"An account named '{name}' already exists.")
        currency = data["currency"].upper()
        if not is_supported(currency):
            raise ValidationError(f"Currency {currency} is not supported.")
        account_type = AccountType(data["account_type"])

        account = Account(
            name=name,
            institution=(data.get("institution") or None),
            account_type=account_type.value,
            currency=currency,
            purpose=data.get("purpose"),
            opening_balance_minor=int(data.get("opening_balance_minor") or 0),
            include_in_net_worth=bool(data.get("include_in_net_worth", True)),
            note=data.get("note"),
            sort_order=int(data.get("sort_order") or 0),
        )
        self.repo.add(account)
        self.session.commit()
        logger.info("account_created id=%s type=%s", account.id, account.account_type)
        return account

    def update(self, account_id: int, data: dict) -> Account:
        account = self.get(account_id)
        if "name" in data and data["name"]:
            new_name = data["name"].strip()
            existing = self.repo.get_by_name(new_name)
            if existing is not None and existing.id != account.id:
                raise ConflictError(f"An account named '{new_name}' already exists.")
            account.name = new_name
        for field in ("institution", "purpose", "note"):
            if field in data:
                setattr(account, field, data[field])
        if data.get("account_type"):
            account.account_type = AccountType(data["account_type"]).value
        if data.get("currency"):
            currency = data["currency"].upper()
            if currency != account.currency and self.repo.has_postings(account.id):
                raise ConflictError(
                    "The currency of an account with existing transactions cannot be changed."
                )
            if not is_supported(currency):
                raise ValidationError(f"Currency {currency} is not supported.")
            account.currency = currency
        if "opening_balance_minor" in data and data["opening_balance_minor"] is not None:
            account.opening_balance_minor = int(data["opening_balance_minor"])
        for flag in ("include_in_net_worth", "is_active", "is_archived"):
            if flag in data and data[flag] is not None:
                setattr(account, flag, bool(data[flag]))
        if "sort_order" in data and data["sort_order"] is not None:
            account.sort_order = int(data["sort_order"])
        self.session.commit()
        logger.info("account_updated id=%s", account.id)
        return account

    def archive(self, account_id: int, archived: bool = True) -> Account:
        account = self.get(account_id)
        account.is_archived = archived
        account.is_active = not archived
        self.session.commit()
        logger.info("account_archived id=%s archived=%s", account.id, archived)
        return account

    @staticmethod
    def is_liability_account(account: Account) -> bool:
        return is_liability(AccountType(account.account_type))
