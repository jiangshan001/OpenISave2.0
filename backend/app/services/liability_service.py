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

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import AccountType, LiabilityType, is_liability
from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.core.logging import get_logger
from app.core.money import BASE_CURRENCY, is_supported
from app.models.liability import Liability
from app.models.liability_receipt import LiabilityReceipt
from app.models.transaction import Transaction
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
    receipt_status: str

    @property
    def repaid_minor(self) -> int:
        return max(self.liability.original_amount_minor - self.outstanding_minor, 0)

    @property
    def repaid_percent(self) -> float | None:
        if not self.liability.original_amount_minor:
            return None
        return round(self.repaid_minor / self.liability.original_amount_minor * 100, 1)


class LiabilityService:
    def __init__(self, session: Session, accounts: AccountService, ledger=None) -> None:
        self.session = session
        self.repo = LiabilityRepository(session)
        self.assets = AssetRepository(session)
        self.accounts = accounts
        self.ledger = ledger

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
            receipt_status=self.receipt_status(liability),
        )

    def receipt_status(self, liability: Liability) -> str:
        marker = self.session.scalar(select(LiabilityReceipt).where(
            LiabilityReceipt.account_id == liability.account_id
        ))
        if marker:
            transaction = self.session.get(Transaction, marker.transaction_id)
            if transaction and not transaction.is_voided:
                return "recorded"
        account = self.accounts.get(liability.account_id)
        outgoing = self.session.scalar(select(Transaction.id).where(
            Transaction.from_account_id == account.id, Transaction.type == "transfer",
            Transaction.is_voided.is_(False),
        ).limit(1))
        if account.opening_balance_minor >= 0 or outgoing is not None:
            return "unavailable"
        return "available"

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

        receipt_id = data.get("receipt_account_id")
        if receipt_id is not None:
            if self.ledger is None or original <= 0 or data.get("account_id") is not None:
                raise ValidationError(
                    "A receipt requires a new liability and a positive original amount."
                )
            destination = self.accounts.get_active(int(receipt_id))
            if is_liability(destination.account_type) or destination.currency != currency:
                raise ValidationError("Choose an active non-liability account in the same currency.")
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
            if receipt_id is not None and outstanding != original:
                raise ValidationError(
                    "When recording a new loan deposit, the amount owed must equal the "
                    "original amount. Record repayments separately."
                )
            account = self.accounts.create(
                {
                    "name": name,
                    "institution": data.get("lender"),
                    "account_type": DEFAULT_ACCOUNT_TYPE[liability_type].value,
                    "currency": currency,
                    # A liability account carries its debt as a negative balance.
                    "opening_balance_minor": 0 if receipt_id is not None else -outstanding,
                    "include_in_net_worth": True,
                    "note": data.get("note"),
                },
                commit=False,
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
        if receipt_id is not None:
            self.ledger.create_transfer(
                {
                    "from_account_id": account.id,
                    "to_account_id": int(receipt_id),
                    "amount_minor": original,
                    "transaction_date": data.get("start_date") or date.today(),
                    "description": f"Loan received — {name}",
                },
                commit=False,
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
        source = self.accounts.get_active(from_account_id)
        debt = self.accounts.get_active(liability.account_id)
        if is_liability(source.account_type) or source.currency != debt.currency:
            raise ValidationError("Choose a non-liability payment account in the same currency.")
        if amount > self.view(liability).outstanding_minor:
            raise ValidationError("A repayment cannot exceed the outstanding debt.")
        payment_date: date = data.get("transaction_date") or date.today()
        return {
            "from_account_id": from_account_id,
            "to_account_id": liability.account_id,
            "amount_minor": amount,
            "transaction_date": payment_date,
            "description": data.get("description") or f"Repayment — {liability.name}",
        }

    def record_legacy_receipt(self, liability_id: int, data: dict) -> Transaction:
        liability = self.get(liability_id)
        if self.ledger is None or self.receipt_status(liability) != "available":
            raise ConflictError("This debt is not eligible for a historical deposit correction.")
        destination = self.accounts.get_active(int(data["account_id"]))
        debt = self.accounts.get_active(liability.account_id)
        amount = int(data["amount_minor"])
        if is_liability(destination.account_type) or destination.currency != debt.currency:
            raise ValidationError("Choose a non-liability receiving account in the same currency.")
        if amount <= 0 or amount > liability.original_amount_minor:
            raise ValidationError("The deposit must be positive and no greater than the original loan.")
        previous = self.session.scalar(select(LiabilityReceipt).where(
            LiabilityReceipt.account_id == liability.account_id
        ))
        if previous:
            self.session.delete(previous)
            self.session.flush()
        transaction = self.ledger.create_legacy_loan_receipt(
            account_id=destination.id, amount=amount,
            tx_date=data.get("transaction_date") or date.today(),
            description=f"Historical loan deposit — {liability.name}",
        )
        self.session.add(LiabilityReceipt(account_id=liability.account_id,
                                          liability_id=liability.id, transaction_id=transaction.id))
        self.session.commit()
        return transaction
