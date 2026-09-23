"""Liabilities.

A liability is contract metadata (lender, original amount, rate, dates)
attached to a liability *account*. The outstanding balance is always the
account's balance, negated -- it is never stored twice, so there is exactly one
source of truth and the existing ledger and net worth code need no special
cases.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.enums import AccountType, LiabilityType, is_liability
from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.core.logging import get_logger
from app.core.money import BASE_CURRENCY, is_supported
from app.models.liability import Liability
from app.repositories.assets import AssetRepository
from app.repositories.liabilities import LiabilityRepository
from app.services.account_service import AccountService

logger = get_logger(__name__)

#: Account type created for each liability kind when one is not supplied.
DEFAULT_ACCOUNT_TYPE: dict[LiabilityType, AccountType] = {
    LiabilityType.LOAN: AccountType.LOAN,
    LiabilityType.FINANCING: AccountType.LOAN,
    LiabilityType.MORTGAGE: AccountType.LOAN,
    LiabilityType.CREDIT_CARD: AccountType.CREDIT_CARD,
    LiabilityType.OTHER: AccountType.OTHER_LIABILITY,
}


@dataclass
class LiabilityView:
    liability: Liability
    account_id: int
    account_name: str
    outstanding_minor: int
    outstanding_currency: str
    base_outstanding_minor: int | None
    fx_freshness: str
    linked_asset_names: list[str]

    @property
    def repaid_minor(self) -> int:
        return max(self.liability.original_amount_minor - self.outstanding_minor, 0)

    @property
    def repaid_percent(self) -> float | None:
        if not self.liability.original_amount_minor:
            return None
        return round(self.repaid_minor / self.liability.original_amount_minor * 100, 1)


class LiabilityService:
    def __init__(self, session: Session, accounts: AccountService) -> None:
        self.session = session
        self.repo = LiabilityRepository(session)
        self.assets = AssetRepository(session)
        self.accounts = accounts

    # ------------------------------------------------------------- reading

    def get(self, liability_id: int) -> Liability:
        liability = self.repo.get(liability_id)
        if liability is None:
            raise NotFoundError(f"Liability {liability_id} was not found.")
        return liability

    def view(self, liability: Liability) -> LiabilityView:
        balance = self.accounts.balance_for(liability.account_id)
        outstanding = max(-balance.balance_minor, 0)
        base = None
        if balance.base_balance_minor is not None:
            base = max(-balance.base_balance_minor, 0)
        return LiabilityView(
            liability=liability,
            account_id=balance.account.id,
            account_name=balance.account.name,
            outstanding_minor=outstanding,
            outstanding_currency=balance.account.currency,
            base_outstanding_minor=base,
            fx_freshness=balance.fx_freshness,
            linked_asset_names=[
                asset.name for asset in self.assets.linked_to_liability(liability.id)
            ],
        )

    def list_views(self) -> list[LiabilityView]:
        return [self.view(item) for item in self.repo.list()]

    # ------------------------------------------------------------- writing

    def create(self, data: dict) -> Liability:
        name = (data.get("name") or "").strip()
        if not name:
            raise ValidationError("Liability name is required.")
        if self.repo.get_by_name(name) is not None:
            raise ConflictError(f"A liability named '{name}' already exists.")
        liability_type = LiabilityType(data.get("liability_type") or LiabilityType.OTHER.value)
        currency = (data.get("currency") or BASE_CURRENCY).upper()
        if not is_supported(currency):
            raise ValidationError(f"Currency {currency} is not supported.")
        original = int(data.get("original_amount_minor") or 0)
        if original < 0:
            raise ValidationError("The original amount cannot be negative.")

        account_id = data.get("account_id")
        if account_id is not None:
            account = self.accounts.get(int(account_id))
            if not is_liability(AccountType(account.account_type)):
                raise ValidationError(
                    f"'{account.name}' is not a liability account, so it cannot hold a debt balance."
                )
            if self.repo.get_by_account(account.id) is not None:
                raise ConflictError(f"'{account.name}' already belongs to another liability.")
            currency = account.currency
        else:
            outstanding = int(
                data.get("outstanding_amount_minor")
                if data.get("outstanding_amount_minor") is not None
                else original
            )
            if outstanding < 0:
                raise ValidationError("The outstanding amount cannot be negative.")
            account = self.accounts.create(
                {
                    "name": name,
                    "institution": data.get("lender"),
                    "account_type": DEFAULT_ACCOUNT_TYPE[liability_type].value,
                    "currency": currency,
                    # A liability account carries its debt as a negative balance.
                    "opening_balance_minor": -outstanding,
                    "include_in_net_worth": True,
                    "note": data.get("note"),
                }
            )

        liability = self.repo.add(
            Liability(
                name=name,
                liability_type=liability_type.value,
                account_id=account.id,
                original_amount_minor=original or abs(account.opening_balance_minor),
                currency=currency,
                start_date=data.get("start_date"),
                end_date=data.get("end_date"),
                interest_rate_percent=(
                    Decimal(str(data["interest_rate_percent"]))
                    if data.get("interest_rate_percent") is not None
                    else None
                ),
                lender=data.get("lender"),
                note=data.get("note"),
            )
        )
        self.session.commit()
        logger.info("liability_created id=%s account=%s", liability.id, account.id)
        return liability

    def update(self, liability_id: int, data: dict) -> Liability:
        liability = self.get(liability_id)
        if data.get("name"):
            new_name = data["name"].strip()
            existing = self.repo.get_by_name(new_name)
            if existing is not None and existing.id != liability.id:
                raise ConflictError(f"A liability named '{new_name}' already exists.")
            liability.name = new_name
        if data.get("liability_type"):
            liability.liability_type = LiabilityType(data["liability_type"]).value
        for field_name in ("start_date", "end_date", "lender", "note"):
            if field_name in data:
                setattr(liability, field_name, data[field_name])
        if data.get("original_amount_minor") is not None:
            amount = int(data["original_amount_minor"])
            if amount < 0:
                raise ValidationError("The original amount cannot be negative.")
            liability.original_amount_minor = amount
        if "interest_rate_percent" in data:
            value = data["interest_rate_percent"]
            liability.interest_rate_percent = Decimal(str(value)) if value is not None else None
        self.session.commit()
        logger.info("liability_updated id=%s", liability.id)
        return liability

    def delete(self, liability_id: int) -> None:
        """Remove the contract metadata, leaving the account and its history."""
        liability = self.get(liability_id)
        for asset in self.assets.linked_to_liability(liability.id):
            asset.linked_liability_id = None
        self.repo.delete(liability)
        self.session.commit()
        logger.info("liability_deleted id=%s", liability_id)

    def record_repayment(self, liability_id: int, data: dict) -> dict:
        """A repayment is a transfer from a cash account to the debt account."""
        liability = self.get(liability_id)
        from_account_id = int(data["from_account_id"])
        amount = int(data.get("amount_minor") or 0)
        if amount <= 0:
            raise ValidationError("A repayment must be greater than zero.")
        payment_date: date = data.get("transaction_date") or date.today()
        return {
            "from_account_id": from_account_id,
            "to_account_id": liability.account_id,
            "amount_minor": amount,
            "transaction_date": payment_date,
            "description": data.get("description") or f"Repayment — {liability.name}",
        }
