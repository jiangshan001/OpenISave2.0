"""Turn parsed statement rows into a reviewable import plan.

For every row this decides -- deterministically, from the statement, the
user's account mappings, the duplicate index and the categorisation rules --
what it would become and whether it can be imported as it stands:

    ready         will be imported exactly as shown
    needs_review  something is missing or ambiguous; the user must decide
    duplicate     already imported earlier (or repeated in this file)
    ignored       not a completed payment (failed, closed, returned), or a row
                  the user ignores permanently (now, or in an earlier import)
    skipped       the user chose not to import it this time; it comes back in
                  the next import that contains it

Nothing here writes to the database.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.core.enums import RuleOrigin
from app.importers.base import Movement, StatementRow
from app.models.account import Account
from app.models.category import Category
from app.services.categorisation_service import Classifier, RowText, RuleSpec

READY, REVIEW, DUPLICATE, IGNORED, SKIPPED = (
    "ready", "needs_review", "duplicate", "ignored", "skipped",
)


@dataclass
class RowOverride:
    row_id: int
    category_id: int | None = None
    counter_account_id: int | None = None  # treat as a transfer with this account
    skip: bool = False  # not this time; the row returns in later imports
    ignore: bool = False  # never: recorded by source + external id on confirm
    remember: dict | None = None  # {match_field, match_type, pattern}

    @classmethod
    def parse(cls, data: dict) -> "RowOverride":
        return cls(
            row_id=int(data["row_id"]),
            category_id=data.get("category_id"),
            counter_account_id=data.get("counter_account_id"),
            skip=bool(data.get("skip")),
            ignore=bool(data.get("ignore")),
            remember=data.get("remember") or None,
        )


@dataclass
class PlannedRow:
    row_id: int
    source: StatementRow
    status: str = REVIEW
    kind: str | None = None  # expense / income / transfer
    account_id: int | None = None  # income/expense account, or transfer source
    counter_account_id: int | None = None  # transfer destination
    category_id: int | None = None
    method: str = "none"  # rule / manual / none
    rule_id: int | None = None
    rule_name: str | None = None
    reason: str | None = None
    issues: list[str] = field(default_factory=list)
    # "permanent": ignored in an earlier import; "pending": will be on confirm
    ignore_state: str | None = None

    @property
    def description(self) -> str:
        return (self.source.counterparty or self.source.source_type or "WeChat")[:200]

    @property
    def note(self) -> str | None:
        parts = [self.source.product, self.source.note, self.source.remark]
        text = " · ".join(part for part in parts if part)
        return text or None


class PreviewBuilder:
    def __init__(
        self,
        *,
        source: str,
        currency: str,
        mappings: dict[str, int | None],
        accounts: dict[int, Account],
        categories: dict[int, Category],
        imported_ids: set[str],
        ignored_ids: set[str],
        classifier: Classifier,
    ) -> None:
        self.source = source
        self.currency = currency
        self.mappings = mappings
        self.accounts = accounts
        self.categories = categories
        self.imported_ids = imported_ids
        self.ignored_ids = ignored_ids
        self.classifier = classifier

    # ---------------------------------------------------------- resolution

    def _account(self, label: str, issues: list[str]) -> Account | None:
        if not label:
            issues.append("The statement names no payment method for this row")
            return None
        account_id = self.mappings.get(label)
        if account_id is None:
            issues.append(f"Choose the account for “{label}”")
            return None
        return self._usable_account(account_id, issues)

    def _usable_account(self, account_id: int, issues: list[str]) -> Account | None:
        account = self.accounts.get(int(account_id))
        if account is None or account.is_archived or not account.is_active:
            issues.append("The mapped account is archived or missing")
            return None
        if account.currency != self.currency:
            issues.append(
                f"{account.name} holds {account.currency}; this statement is in {self.currency}"
            )
            return None
        return account

    def _manual_category(self, category_id: int, direction: str, issues: list[str]) -> int | None:
        category = self.categories.get(int(category_id))
        if category is None or not category.is_active:
            issues.append("The chosen category is archived or missing")
            return None
        if category.kind != direction:
            issues.append(f"“{category.name}” is not an {direction} category")
            return None
        return category.id

    # ---------------------------------------------------------------- rows

    def plan(self, row_id: int, row: StatementRow, seen: set[str], override: RowOverride | None):
        planned = PlannedRow(row_id=row_id, source=row)
        if row.external_id in self.imported_ids or row.external_id in seen:
            planned.status = DUPLICATE
            planned.reason = "Already imported" if row.external_id in self.imported_ids else (
                "Repeated in this file"
            )
            return planned
        seen.add(row.external_id)
        if row.external_id in self.ignored_ids:
            planned.status, planned.ignore_state = IGNORED, "permanent"
            planned.reason = "Ignored permanently by you"
            return planned
        if override and override.ignore:
            planned.status, planned.ignore_state = IGNORED, "pending"
            planned.reason = "Will be ignored permanently"
            return planned
        if row.movement == Movement.IGNORED:
            planned.status, planned.reason = IGNORED, row.review_reason
            return planned
        if override and override.skip:
            planned.status, planned.reason = SKIPPED, "Skipped for this import"
            return planned

        if override and override.counter_account_id:
            self._plan_manual_transfer(planned, override)
        elif row.movement == Movement.TRANSFER:
            self._plan_transfer(planned)
        elif row.direction in ("income", "expense") and (
            row.movement != Movement.REVIEW or (override and override.category_id)
        ):
            self._plan_cash_flow(planned, override)
        else:
            planned.issues.append(row.review_reason or "Choose how to record this row")

        planned.status = READY if not planned.issues else REVIEW
        return planned

    def _plan_transfer(self, planned: PlannedRow) -> None:
        row = planned.source
        planned.kind = "transfer"
        source = self._account(row.source_label, planned.issues)
        dest = self._account(row.dest_label, planned.issues)
        if source and dest and source.id == dest.id:
            planned.issues.append("Both sides map to the same account")
        planned.account_id = source.id if source else None
        planned.counter_account_id = dest.id if dest else None
        planned.reason = f"Transfer: {row.source_label or '?'} → {row.dest_label or '?'}"

    def _plan_manual_transfer(self, planned: PlannedRow, override: RowOverride) -> None:
        row = planned.source
        planned.kind = "transfer"
        own = self._account(row.source_label, planned.issues)
        other = self._usable_account(override.counter_account_id, planned.issues)
        if own and other and own.id == other.id:
            planned.issues.append("Both sides map to the same account")
        incoming = row.direction == "income"
        source, dest = (other, own) if incoming else (own, other)
        planned.account_id = source.id if source else None
        planned.counter_account_id = dest.id if dest else None
        planned.method, planned.reason = "manual", "Marked by you as a transfer between your accounts"

    def _plan_cash_flow(self, planned: PlannedRow, override: RowOverride | None) -> None:
        row = planned.source
        planned.kind = row.direction
        account = self._account(row.source_label, planned.issues)
        planned.account_id = account.id if account else None
        if override and override.category_id:
            planned.category_id = self._manual_category(
                override.category_id, row.direction, planned.issues
            )
            planned.method, planned.reason = "manual", "Chosen by you"
            if override.remember:
                planned.reason = "Chosen by you · will be saved as a rule"
            return
        match = self.classifier.classify(
            RowText(self.source, row.direction, row.counterparty, row.product,
                    " ".join(p for p in (row.note, row.remark) if p), row.source_type)
        )
        if match is None:
            planned.issues.append("No rule matched: choose a category")
            return
        planned.category_id = match.category_id
        planned.method, planned.rule_id = "rule", match.rule.id
        planned.rule_name, planned.reason = match.rule.name, match.reason


def pending_rules(overrides: list[RowOverride], rows: list[StatementRow]) -> dict[int, RuleSpec]:
    """Rules the user asked to remember, keyed by the row that proposed them.

    They are evaluated ahead of saved rules in the same preview, so one
    correction immediately classifies every similar row in the file.
    Temporary ids are negative until the import is confirmed.
    """
    specs: dict[int, RuleSpec] = {}
    for position, override in enumerate(overrides):
        if not (override.remember and override.category_id):
            continue
        if not 0 <= override.row_id < len(rows):
            continue
        row = rows[override.row_id]
        remember = override.remember
        pattern = (remember.get("pattern") or row.counterparty or "").strip()
        if not pattern:
            continue
        specs[override.row_id] = RuleSpec(
            id=-(position + 1),
            name=f"{pattern[:60]} → category",
            origin=RuleOrigin.USER.value,
            source=None,
            match_field=remember.get("match_field") or "merchant",
            match_type=remember.get("match_type") or "exact",
            pattern=pattern,
            secondary_field=None,
            secondary_pattern=None,
            direction=row.direction if row.direction in ("income", "expense") else None,
            category_id=int(override.category_id),
            priority=-1000 + position,
        )
    return specs
