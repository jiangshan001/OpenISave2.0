"""The ledger: the only place that writes transactions and postings.

Every user action becomes a transaction header plus balanced postings:

    expense   account leg (-)  + category leg (+)
    income    account leg (+)  + category leg (-)
    transfer  source leg (-)   + destination leg (+)

Transfers are never classified as income or expense, so income/expense totals
read from the `type` column can never include them. A transfer fee, when given,
becomes a separate linked expense transaction so it is reported honestly
without disturbing the transfer itself.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.enums import CategoryKind, FxSource, TransactionType
from app.core.exceptions import NotFoundError, ValidationError
from app.core.logging import get_logger
from app.core.money import BASE_CURRENCY, convert_minor, quantize_rate
from app.db.base import utcnow
from app.models.posting import Posting
from app.models.transaction import Transaction
from app.repositories.categories import CategoryRepository
from app.repositories.transactions import TransactionRepository
from app.services.account_service import AccountService
from app.services.fx_service import FxService

logger = get_logger(__name__)

FEE_CATEGORY_NAME = "Fees & Charges"


class LedgerService:
    def __init__(self, session: Session, accounts: AccountService, fx: FxService) -> None:
        self.session = session
        self.repo = TransactionRepository(session)
        self.categories = CategoryRepository(session)
        self.accounts = accounts
        self.fx = fx

    # -------------------------------------------------------------- helpers

    def _freeze_base(
        self, amount_minor: int, currency: str, on_date: date, manual_rate: Decimal | None
    ) -> tuple[int, Decimal, date | None, str]:
        """Resolve and freeze the base-currency value of an amount.

        The returned rate is stored on the row, so future rate movements never
        change this transaction's historical reporting value.
        """
        if manual_rate is not None:
            rate = quantize_rate(manual_rate)
            base = convert_minor(amount_minor, currency, BASE_CURRENCY, rate)
            return base, rate, on_date, FxSource.MANUAL.value
        if currency == BASE_CURRENCY:
            return amount_minor, Decimal(1), on_date, FxSource.IDENTITY.value
        resolved = self.fx.rate_to_base(currency, on_date)
        base = convert_minor(amount_minor, currency, BASE_CURRENCY, resolved.rate)
        return base, resolved.rate, resolved.rate_date, resolved.source

    def _validate_category(self, category_id: int | None, expected_kind: CategoryKind) -> int | None:
        if category_id is None:
            return None
        category = self.categories.get(category_id)
        if category is None:
            raise NotFoundError(f"Category {category_id} was not found.")
        if category.kind != expected_kind.value:
            raise ValidationError(
                f"Category '{category.name}' cannot be used for a {expected_kind.value}."
            )
        return category.id

    @staticmethod
    def _require_positive(amount_minor: int, label: str = "Amount") -> int:
        if amount_minor is None or amount_minor <= 0:
            raise ValidationError(f"{label} must be greater than zero.")
        return int(amount_minor)

    def _add_posting(
        self,
        transaction: Transaction,
        *,
        account_id: int | None,
        category_id: int | None,
        amount_minor: int,
        currency: str,
        rate: Decimal,
        asset_id: int | None = None,
    ) -> None:
        transaction.postings.append(
            Posting(
                account_id=account_id,
                category_id=category_id,
                asset_id=asset_id,
                amount_minor=amount_minor,
                currency=currency,
                base_amount_minor=convert_minor(amount_minor, currency, BASE_CURRENCY, rate),
                fx_rate_to_base=rate,
            )
        )

    # ------------------------------------------------------- income/expense

    def create_transaction(self, data: dict) -> Transaction:
        tx_type = TransactionType(data["type"])
        if tx_type is TransactionType.TRANSFER:
            raise ValidationError("Use the transfer endpoint to move money between accounts.")

        account = self.accounts.get_active(int(data["account_id"]))
        amount = self._require_positive(data.get("amount_minor"))
        currency = (data.get("currency") or account.currency).upper()
        if currency != account.currency:
            raise ValidationError(
                f"Amount currency {currency} does not match account currency {account.currency}."
            )
        tx_date: date = data["transaction_date"]
        kind = CategoryKind.INCOME if tx_type is TransactionType.INCOME else CategoryKind.EXPENSE
        category_id = self._validate_category(data.get("category_id"), kind)

        manual_rate = data.get("fx_rate")
        base_amount, rate, rate_date, source = self._freeze_base(
            amount, currency, tx_date, manual_rate
        )
        signed = amount if tx_type is TransactionType.INCOME else -amount

        transaction = Transaction(
            type=tx_type.value,
            transaction_date=tx_date,
            description=(data.get("description") or "").strip(),
            note=data.get("note"),
            category_id=category_id,
            account_id=account.id,
            amount_minor=amount,
            currency=currency,
            base_currency=BASE_CURRENCY,
            base_amount_minor=base_amount,
            fx_rate_to_base=rate,
            fx_rate_date=rate_date,
            fx_source=source,
        )
        self._add_posting(
            transaction,
            account_id=account.id,
            category_id=None,
            amount_minor=signed,
            currency=currency,
            rate=rate,
        )
        if category_id is not None:
            self._add_posting(
                transaction,
                account_id=None,
                category_id=category_id,
                amount_minor=-signed,
                currency=currency,
                rate=rate,
            )
        self.repo.add(transaction)
        self.session.commit()
        logger.info("transaction_created id=%s type=%s", transaction.id, transaction.type)
        return transaction

    def update_transaction(self, transaction_id: int, data: dict) -> Transaction:
        """Edit by rebuilding: the old record is voided and replaced atomically."""
        existing = self.get(transaction_id)
        if existing.type == TransactionType.TRANSFER.value:
            raise ValidationError(
                "Transfers cannot be edited in place. Void the transfer and create a new one."
            )
        payload = {
            "type": data.get("type", existing.type),
            "account_id": data.get("account_id", existing.account_id),
            "amount_minor": data.get("amount_minor", existing.amount_minor),
            "currency": data.get("currency"),
            "transaction_date": data.get("transaction_date", existing.transaction_date),
            "description": data.get("description", existing.description),
            "note": data.get("note", existing.note),
            "category_id": data.get("category_id", existing.category_id),
            "fx_rate": data.get("fx_rate"),
        }
        self._void(existing)
        replacement = self.create_transaction(payload)
        logger.info("transaction_replaced old=%s new=%s", existing.id, replacement.id)
        return replacement

    # ------------------------------------------------------------ transfers

    def create_transfer(self, data: dict) -> Transaction:
        source = self.accounts.get_active(int(data["from_account_id"]))
        destination = self.accounts.get_active(int(data["to_account_id"]))
        if source.id == destination.id:
            raise ValidationError("The source and destination accounts must be different.")

        amount = self._require_positive(data.get("amount_minor"))
        tx_date: date = data["transaction_date"]
        fee = int(data.get("fee_minor") or 0)
        if fee < 0:
            raise ValidationError("A transfer fee cannot be negative.")

        dest_amount = data.get("dest_amount_minor")
        if source.currency == destination.currency:
            if dest_amount is not None and int(dest_amount) != amount:
                raise ValidationError(
                    "A same-currency transfer must credit the same amount it debits."
                )
            dest_amount = amount
            transfer_rate = Decimal(1)
        else:
            if dest_amount is None:
                raise ValidationError(
                    "A cross-currency transfer requires the amount received "
                    f"in {destination.currency}."
                )
            dest_amount = self._require_positive(int(dest_amount), "Received amount")
            transfer_rate = self._effective_rate(
                amount, source.currency, dest_amount, destination.currency
            )

        base_amount, rate, rate_date, fx_source = self._freeze_base(
            amount, source.currency, tx_date, data.get("fx_rate")
        )
        # The destination leg is valued with the transfer's own rate rather than
        # a second market lookup, so both legs of a transfer always net to zero
        # in the base currency and net worth is unaffected.
        dest_rate = quantize_rate(Decimal(rate) / transfer_rate)

        transaction = Transaction(
            type=TransactionType.TRANSFER.value,
            transaction_date=tx_date,
            description=(data.get("description") or f"{source.name} -> {destination.name}").strip(),
            note=data.get("note"),
            category_id=None,
            account_id=None,
            amount_minor=amount,
            currency=source.currency,
            from_account_id=source.id,
            to_account_id=destination.id,
            dest_amount_minor=dest_amount,
            dest_currency=destination.currency,
            transfer_rate=transfer_rate,
            base_currency=BASE_CURRENCY,
            base_amount_minor=base_amount,
            fx_rate_to_base=rate,
            fx_rate_date=rate_date,
            fx_source=fx_source,
        )
        self._add_posting(
            transaction,
            account_id=source.id,
            category_id=None,
            amount_minor=-amount,
            currency=source.currency,
            rate=rate,
        )
        self._add_posting(
            transaction,
            account_id=destination.id,
            category_id=None,
            amount_minor=dest_amount,
            currency=destination.currency,
            rate=dest_rate,
        )
        self.repo.add(transaction)

        if fee > 0:
            self._create_fee_transaction(transaction, source, fee, tx_date)

        self.session.commit()
        logger.info("transfer_created id=%s", transaction.id)
        return transaction

    @staticmethod
    def _effective_rate(amount: int, from_currency: str, dest: int, to_currency: str) -> Decimal:
        from app.core.money import to_major

        source_major = to_major(amount, from_currency)
        dest_major = to_major(dest, to_currency)
        if source_major == 0:
            raise ValidationError("Transfer amount must be greater than zero.")
        return quantize_rate(dest_major / source_major)

    def _create_fee_transaction(
        self, parent: Transaction, account, fee_minor: int, tx_date: date
    ) -> Transaction:
        category = next(
            (c for c in self.categories.list(kind=CategoryKind.EXPENSE.value)
             if c.name == FEE_CATEGORY_NAME),
            None,
        )
        base_amount, rate, rate_date, source = self._freeze_base(
            fee_minor, account.currency, tx_date, None
        )
        fee_tx = Transaction(
            type=TransactionType.EXPENSE.value,
            transaction_date=tx_date,
            description="Transfer fee",
            category_id=category.id if category else None,
            account_id=account.id,
            amount_minor=fee_minor,
            currency=account.currency,
            base_currency=BASE_CURRENCY,
            base_amount_minor=base_amount,
            fx_rate_to_base=rate,
            fx_rate_date=rate_date,
            fx_source=source,
            parent_transaction_id=parent.id,
        )
        self._add_posting(
            fee_tx,
            account_id=account.id,
            category_id=None,
            amount_minor=-fee_minor,
            currency=account.currency,
            rate=rate,
        )
        if category is not None:
            self._add_posting(
                fee_tx,
                account_id=None,
                category_id=category.id,
                amount_minor=fee_minor,
                currency=account.currency,
                rate=rate,
            )
        return self.repo.add(fee_tx)

    # --------------------------------------------------------------- assets

    def _require_matching_currency(self, account, currency: str, label: str) -> None:
        if account.currency != currency:
            raise ValidationError(
                f"{label} '{account.name}' is in {account.currency}, "
                f"but this asset is priced in {currency}. Use an account in the same currency."
            )

    def create_asset_purchase(
        self,
        *,
        asset_id: int,
        asset_name: str,
        price_minor: int,
        currency: str,
        tx_date: date,
        cash_account_id: int | None,
        cash_amount_minor: int | None,
        liability_account_id: int | None = None,
        financed_amount_minor: int = 0,
    ) -> Transaction | None:
        """Record buying an asset.

        Buying is a change of form, not spending: cash (and/or new debt) turns
        into a thing you own. The postings therefore balance to zero and the
        transaction type keeps it out of expense totals, so net worth does not
        drop by the purchase price.
        """
        cash = int(cash_amount_minor or 0)
        financed = int(financed_amount_minor or 0)
        if cash_account_id is None and liability_account_id is None:
            return None
        if cash < 0 or financed < 0:
            raise ValidationError("Payment amounts cannot be negative.")
        if cash + financed != price_minor:
            raise ValidationError(
                "The amount paid plus the amount financed must equal the purchase price."
            )

        transaction = Transaction(
            type=TransactionType.ASSET_PURCHASE.value,
            transaction_date=tx_date,
            description=f"Purchase — {asset_name}",
            amount_minor=price_minor,
            currency=currency,
            asset_id=asset_id,
        )
        base_amount, rate, rate_date, source = self._freeze_base(
            price_minor, currency, tx_date, None
        )
        transaction.base_currency = BASE_CURRENCY
        transaction.base_amount_minor = base_amount
        transaction.fx_rate_to_base = rate
        transaction.fx_rate_date = rate_date
        transaction.fx_source = source

        if cash > 0:
            account = self.accounts.get_active(int(cash_account_id))
            self._require_matching_currency(account, currency, "Account")
            self._add_posting(
                transaction,
                account_id=account.id,
                category_id=None,
                amount_minor=-cash,
                currency=currency,
                rate=rate,
            )
        if financed > 0:
            liability = self.accounts.get_active(int(liability_account_id))
            self._require_matching_currency(liability, currency, "Liability account")
            self._add_posting(
                transaction,
                account_id=liability.id,
                category_id=None,
                amount_minor=-financed,
                currency=currency,
                rate=rate,
            )
        # The balancing leg: the asset itself now holds the value.
        self._add_posting(
            transaction,
            account_id=None,
            category_id=None,
            asset_id=asset_id,
            amount_minor=price_minor,
            currency=currency,
            rate=rate,
        )
        self.repo.add(transaction)
        logger.info("asset_purchase_recorded asset=%s", asset_id)
        return transaction

    def create_asset_sale(
        self,
        *,
        asset_id: int,
        asset_name: str,
        proceeds_minor: int,
        currency: str,
        tx_date: date,
        destination_account_id: int | None,
    ) -> Transaction | None:
        """Record selling an asset into an account."""
        if destination_account_id is None or proceeds_minor <= 0:
            return None
        account = self.accounts.get_active(int(destination_account_id))
        self._require_matching_currency(account, currency, "Account")

        base_amount, rate, rate_date, source = self._freeze_base(
            proceeds_minor, currency, tx_date, None
        )
        transaction = Transaction(
            type=TransactionType.ASSET_SALE.value,
            transaction_date=tx_date,
            description=f"Sale — {asset_name}",
            amount_minor=proceeds_minor,
            currency=currency,
            asset_id=asset_id,
            base_currency=BASE_CURRENCY,
            base_amount_minor=base_amount,
            fx_rate_to_base=rate,
            fx_rate_date=rate_date,
            fx_source=source,
        )
        self._add_posting(
            transaction,
            account_id=account.id,
            category_id=None,
            amount_minor=proceeds_minor,
            currency=currency,
            rate=rate,
        )
        self._add_posting(
            transaction,
            account_id=None,
            category_id=None,
            asset_id=asset_id,
            amount_minor=-proceeds_minor,
            currency=currency,
            rate=rate,
        )
        self.repo.add(transaction)
        logger.info("asset_sale_recorded asset=%s", asset_id)
        return transaction

    # ---------------------------------------------------------------- reads

    def get(self, transaction_id: int) -> Transaction:
        transaction = self.repo.get(transaction_id)
        if transaction is None:
            raise NotFoundError(f"Transaction {transaction_id} was not found.")
        return transaction

    def list(self, **filters) -> list[Transaction]:
        return self.repo.list(**filters)

    def count(self, **filters) -> int:
        return self.repo.count(**filters)

    # --------------------------------------------------------------- voids

    def _void(self, transaction: Transaction) -> None:
        transaction.is_voided = True
        transaction.voided_at = utcnow()
        for child in self.repo.children_of(transaction.id):
            child.is_voided = True
            child.voided_at = utcnow()
        self.session.commit()

    def void(self, transaction_id: int) -> Transaction:
        transaction = self.get(transaction_id)
        if transaction.is_voided:
            return transaction
        self._void(transaction)
        logger.info("transaction_voided id=%s", transaction.id)
        return transaction
