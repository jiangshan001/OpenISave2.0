"""Deterministic categorisation: ordered, explainable rules. No AI, no network.

Evaluation order (first match wins):

    1. user rules, in the user's own priority order
    2. built-in exact merchant rules
    3. built-in merchant keyword rules
    4. built-in product keyword rules
    5. built-in note / free-text keyword rules
    6. built-in statement-type fallbacks (e.g. 微信红包 received -> Gift)
    7. no match -> the row needs review

A rule only fires when its direction (income/expense) matches the row and its
category is active and of the right kind; a rule pointing at an archived
category is passed over, so the row falls through to later rules or review
rather than being filed somewhere the user retired.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.enums import CategoryKind, RuleMatchField, RuleMatchType, RuleOrigin
from app.core.exceptions import NotFoundError, ValidationError
from app.core.logging import get_logger
from app.models.category import Category
from app.models.statement_import import CategorisationRule

logger = get_logger(__name__)

_SYSTEM_TIERS = {
    (RuleMatchField.MERCHANT.value, RuleMatchType.EXACT.value): 1,
    (RuleMatchField.MERCHANT.value, RuleMatchType.CONTAINS.value): 2,
    (RuleMatchField.PRODUCT.value, RuleMatchType.EXACT.value): 3,
    (RuleMatchField.PRODUCT.value, RuleMatchType.CONTAINS.value): 3,
    (RuleMatchField.NOTE.value, RuleMatchType.EXACT.value): 4,
    (RuleMatchField.NOTE.value, RuleMatchType.CONTAINS.value): 4,
    (RuleMatchField.ANY_TEXT.value, RuleMatchType.CONTAINS.value): 4,
    (RuleMatchField.ANY_TEXT.value, RuleMatchType.EXACT.value): 4,
    (RuleMatchField.SOURCE_TYPE.value, RuleMatchType.EXACT.value): 5,
    (RuleMatchField.SOURCE_TYPE.value, RuleMatchType.CONTAINS.value): 5,
}

FIELD_LABELS = {
    RuleMatchField.MERCHANT.value: "merchant",
    RuleMatchField.PRODUCT.value: "product",
    RuleMatchField.NOTE.value: "note",
    RuleMatchField.ANY_TEXT.value: "description",
    RuleMatchField.SOURCE_TYPE.value: "statement type",
}


def normalise(text: str | None) -> str:
    folded = unicodedata.normalize("NFKC", text or "").casefold()
    return re.sub(r"\s+", " ", folded).strip()


@dataclass(frozen=True)
class RowText:
    """The statement fields a rule may inspect."""

    source: str
    direction: str  # income / expense
    merchant: str
    product: str
    note: str
    source_type: str

    def field(self, name: str) -> str:
        if name == RuleMatchField.MERCHANT.value:
            return self.merchant
        if name == RuleMatchField.PRODUCT.value:
            return self.product
        if name == RuleMatchField.NOTE.value:
            return self.note
        if name == RuleMatchField.SOURCE_TYPE.value:
            return self.source_type
        return " ".join(part for part in (self.merchant, self.product, self.note) if part)


@dataclass
class RuleSpec:
    """A rule in memory: persisted, or proposed during an import review."""

    id: int | None
    name: str
    origin: str
    source: str | None
    match_field: str
    match_type: str
    pattern: str
    secondary_field: str | None
    secondary_pattern: str | None
    direction: str | None
    category_id: int
    priority: int

    @classmethod
    def of(cls, rule: CategorisationRule) -> "RuleSpec":
        return cls(
            rule.id, rule.name, rule.origin, rule.source, rule.match_field, rule.match_type,
            rule.pattern, rule.secondary_field, rule.secondary_pattern, rule.direction,
            rule.category_id, rule.priority,
        )

    def sort_key(self) -> tuple:
        if self.origin == RuleOrigin.USER.value:
            return (0, 0, self.priority, self.id or 0)
        tier = _SYSTEM_TIERS.get((self.match_field, self.match_type), 4)
        return (1, tier, self.priority, self.id or 0)

    def matches(self, row: RowText) -> bool:
        if self.source and self.source != row.source:
            return False
        if self.direction and self.direction != row.direction:
            return False
        if not _match(row.field(self.match_field), self.match_type, self.pattern):
            return False
        if self.secondary_field and self.secondary_pattern:
            return _match(row.field(self.secondary_field), "contains", self.secondary_pattern)
        return True

    def explain(self) -> str:
        verb = "is" if self.match_type == RuleMatchType.EXACT.value else "contains"
        text = f"{FIELD_LABELS.get(self.match_field, self.match_field)} {verb} “{self.pattern}”"
        if self.secondary_field and self.secondary_pattern:
            text += f" and {FIELD_LABELS.get(self.secondary_field)} contains “{self.secondary_pattern}”"
        origin = "Your rule" if self.origin == RuleOrigin.USER.value else "Built-in rule"
        return f"{origin}: {text}"


def _match(value: str, match_type: str, pattern: str) -> bool:
    haystack, needle = normalise(value), normalise(pattern)
    if not needle or not haystack:
        return False
    return haystack == needle if match_type == RuleMatchType.EXACT.value else needle in haystack


@dataclass
class Classification:
    category_id: int
    rule: RuleSpec

    @property
    def reason(self) -> str:
        return self.rule.explain()


class Classifier:
    """Evaluates a fixed rule set against many rows (one DB read, then pure)."""

    def __init__(self, rules: list[RuleSpec], categories: dict[int, Category]) -> None:
        self.rules = sorted(rules, key=RuleSpec.sort_key)
        self.categories = categories

    def _usable(self, rule: RuleSpec, direction: str) -> bool:
        category = self.categories.get(rule.category_id)
        return bool(category and category.is_active and category.kind == direction)

    def classify(self, row: RowText) -> Classification | None:
        if row.direction not in (CategoryKind.INCOME.value, CategoryKind.EXPENSE.value):
            return None
        for rule in self.rules:
            if rule.matches(row) and self._usable(rule, row.direction):
                return Classification(rule.category_id, rule)
        return None


class CategorisationService:
    def __init__(self, session: Session) -> None:
        self.session = session

    # ---------------------------------------------------------------- reads

    def list(self) -> list[CategorisationRule]:
        rules = list(self.session.scalars(select(CategorisationRule)))
        return sorted(rules, key=lambda rule: RuleSpec.of(rule).sort_key())

    def get(self, rule_id: int) -> CategorisationRule:
        rule = self.session.get(CategorisationRule, rule_id)
        if rule is None:
            raise NotFoundError(f"Rule {rule_id} was not found.")
        return rule

    def classifier(self, extra: list[RuleSpec] | None = None) -> Classifier:
        enabled = self.session.scalars(
            select(CategorisationRule).where(CategorisationRule.is_enabled.is_(True))
        )
        specs = [RuleSpec.of(rule) for rule in enabled] + list(extra or [])
        categories = {row.id: row for row in self.session.scalars(select(Category))}
        return Classifier(specs, categories)

    # ------------------------------------------------------------- commands

    def validate(self, data: dict) -> dict:
        pattern = (data.get("pattern") or "").strip()
        if not pattern:
            raise ValidationError("A rule needs text to match.")
        match_field = RuleMatchField(data["match_field"]).value
        match_type = RuleMatchType(data.get("match_type") or "contains").value
        category = self.session.get(Category, int(data["category_id"]))
        if category is None:
            raise NotFoundError(f"Category {data['category_id']} was not found.")
        if not category.is_active:
            raise ValidationError(f"Category '{category.name}' is archived.")
        direction = data.get("direction") or category.kind
        if direction != category.kind:
            raise ValidationError(f"'{category.name}' is an {category.kind} category.")
        secondary_field = data.get("secondary_field") or None
        secondary_pattern = (data.get("secondary_pattern") or "").strip() or None
        if secondary_field:
            RuleMatchField(secondary_field)
        return {
            "name": (data.get("name") or "").strip() or f"{match_field} {match_type} {pattern}"[:120],
            "source": data.get("source") or None,
            "match_field": match_field,
            "match_type": match_type,
            "pattern": pattern[:200],
            "secondary_field": secondary_field if secondary_pattern else None,
            "secondary_pattern": secondary_pattern,
            "direction": direction,
            "category_id": category.id,
        }

    def next_priority(self) -> int:
        current = self.session.scalar(
            select(func.max(CategorisationRule.priority)).where(
                CategorisationRule.origin == RuleOrigin.USER.value
            )
        )
        return (current or 0) + 10

    def create(self, data: dict, *, commit: bool = True) -> CategorisationRule:
        clean = self.validate(data)
        rule = CategorisationRule(
            **clean,
            origin=RuleOrigin.USER.value,
            priority=int(data.get("priority") or self.next_priority()),
            is_enabled=True,
        )
        self.session.add(rule)
        self.session.flush()
        if commit:
            self.session.commit()
        logger.info("categorisation_rule_created id=%s", rule.id)
        return rule

    def update(self, rule_id: int, data: dict) -> CategorisationRule:
        rule = self.get(rule_id)
        merged = {
            field: getattr(rule, field)
            for field in ("name", "source", "match_field", "match_type", "pattern",
                          "secondary_field", "secondary_pattern", "direction", "category_id")
        }
        merged.update({k: v for k, v in data.items() if k in merged})
        if "category_id" in data and "direction" not in data:
            merged["direction"] = None  # follow the new category's kind
        for field, value in self.validate(merged).items():
            setattr(rule, field, value)
        if data.get("priority") is not None:
            rule.priority = int(data["priority"])
        if data.get("is_enabled") is not None:
            rule.is_enabled = bool(data["is_enabled"])
        self.session.commit()
        logger.info("categorisation_rule_updated id=%s", rule.id)
        return rule

    def delete(self, rule_id: int) -> None:
        rule = self.get(rule_id)
        self.session.delete(rule)
        self.session.commit()
        logger.info("categorisation_rule_deleted id=%s", rule_id)

    def reorder(self, rule_ids: list[int]) -> list[CategorisationRule]:
        """Give user rules the given order (earlier = evaluated first)."""
        for position, rule_id in enumerate(rule_ids):
            rule = self.get(rule_id)
            rule.priority = (position + 1) * 10
        self.session.commit()
        return self.list()
