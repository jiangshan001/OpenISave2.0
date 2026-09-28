"""Domain enumerations shared across models, schemas and services."""

from __future__ import annotations

from enum import Enum


class AccountType(str, Enum):
    BANK = "bank"
    CASH = "cash"
    EWALLET = "ewallet"
    SAVINGS = "savings"
    CREDIT_CARD = "credit_card"
    LOAN = "loan"
    INVESTMENT = "investment"
    PROVIDENT_FUND = "provident_fund"
    PROPERTY = "property"
    OTHER_ASSET = "other_asset"
    OTHER_LIABILITY = "other_liability"


LIABILITY_ACCOUNT_TYPES: frozenset[AccountType] = frozenset(
    {AccountType.CREDIT_CARD, AccountType.LOAN, AccountType.OTHER_LIABILITY}
)

#: Grouping used by the dashboard breakdown.
ACCOUNT_GROUPS: dict[AccountType, str] = {
    AccountType.BANK: "cash",
    AccountType.CASH: "cash",
    AccountType.EWALLET: "cash",
    AccountType.SAVINGS: "savings",
    AccountType.INVESTMENT: "investments",
    AccountType.PROVIDENT_FUND: "other_assets",
    AccountType.PROPERTY: "other_assets",
    AccountType.OTHER_ASSET: "other_assets",
    AccountType.CREDIT_CARD: "liabilities",
    AccountType.LOAN: "liabilities",
    AccountType.OTHER_LIABILITY: "liabilities",
}


def is_liability(account_type: AccountType | str) -> bool:
    return AccountType(account_type) in LIABILITY_ACCOUNT_TYPES


class AccountPurpose(str, Enum):
    DAILY_SPENDING = "daily_spending"
    BILLS = "bills"
    EMERGENCY_FUND = "emergency_fund"
    LONG_TERM_SAVINGS = "long_term_savings"
    TRAVEL = "travel"
    INVESTMENT = "investment"
    EDUCATION = "education"
    HOUSING = "housing"
    BUSINESS = "business"
    OTHER = "other"


class TransactionType(str, Enum):
    EXPENSE = "expense"
    INCOME = "income"
    TRANSFER = "transfer"
    ADJUSTMENT = "adjustment"
    ASSET_PURCHASE = "asset_purchase"
    ASSET_SALE = "asset_sale"


#: Only these types feed income and expense totals. Transfers and asset
#: movements relocate value rather than earning or consuming it (invariant 3).
CASH_FLOW_TYPES: frozenset[TransactionType] = frozenset(
    {TransactionType.INCOME, TransactionType.EXPENSE}
)


class AssetStatus(str, Enum):
    HOLDING = "holding"
    SOLD = "sold"
    DISPOSED = "disposed"


class LiabilityType(str, Enum):
    LOAN = "loan"
    FINANCING = "financing"
    MORTGAGE = "mortgage"
    CREDIT_CARD = "credit_card"
    OTHER = "other"


class GoalSelectionMode(str, Enum):
    """How a goal decides which accounts count towards it."""

    SELECTED = "selected"
    ALL_ELIGIBLE = "all_eligible"


class CategoryKind(str, Enum):
    EXPENSE = "expense"
    INCOME = "income"


class FxSource(str, Enum):
    IDENTITY = "identity"
    PROVIDER = "provider"
    CACHE = "cache"
    MANUAL = "manual"


class FxFreshness(str, Enum):
    FRESH = "fresh"
    STALE = "stale"
    MISSING = "missing"
    IDENTITY = "identity"


class RecurringFrequency(str, Enum):
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    YEARLY = "yearly"


class RecurringMode(str, Enum):
    """What happens when an occurrence falls due."""

    REVIEW = "review"  # shown as due; the user confirms each one (default)
    AUTOMATIC = "automatic"  # created without asking


class RecurringStatus(str, Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    ARCHIVED = "archived"


class OccurrenceStatus(str, Enum):
    GENERATED = "generated"
    SKIPPED = "skipped"


class RuleMatchField(str, Enum):
    """Statement field a categorisation rule inspects."""

    MERCHANT = "merchant"
    PRODUCT = "product"
    NOTE = "note"
    ANY_TEXT = "any_text"  # merchant, product and note together
    SOURCE_TYPE = "source_type"  # the statement's own transaction type


class RuleMatchType(str, Enum):
    EXACT = "exact"
    CONTAINS = "contains"


class RuleOrigin(str, Enum):
    USER = "user"
    SYSTEM = "system"
