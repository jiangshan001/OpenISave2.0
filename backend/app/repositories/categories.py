"""Category persistence, subtree helpers and usage counts."""

from __future__ import annotations

from collections import defaultdict

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.budget import Budget
from app.models.category import Category
from app.models.posting import Posting
from app.models.transaction import Transaction


class CategoryRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self, category_id: int) -> Category | None:
        return self.session.get(Category, category_id)

    def list(self, *, kind: str | None = None, include_inactive: bool = False) -> list[Category]:
        stmt = select(Category)
        if kind:
            stmt = stmt.where(Category.kind == kind)
        if not include_inactive:
            stmt = stmt.where(Category.is_active.is_(True))
        stmt = stmt.order_by(Category.sort_order, Category.id)
        return list(self.session.scalars(stmt))

    def add(self, category: Category) -> Category:
        self.session.add(category)
        self.session.flush()
        return category

    def delete(self, category: Category) -> None:
        self.session.delete(category)
        self.session.flush()

    def children_of(self, category_id: int) -> list[Category]:
        stmt = select(Category).where(Category.parent_id == category_id)
        return list(self.session.scalars(stmt.order_by(Category.sort_order, Category.id)))

    def _child_map(self) -> dict[int | None, list[int]]:
        children: dict[int | None, list[int]] = defaultdict(list)
        for cid, parent_id in self.session.execute(select(Category.id, Category.parent_id)):
            children[parent_id].append(cid)
        return children

    def subtree_ids(self, category_id: int) -> list[int]:
        """Category id plus all descendants -- budgets roll up child spending."""
        children = self._child_map()
        collected: list[int] = []
        stack = [category_id]
        while stack:
            current = stack.pop()
            collected.append(current)
            stack.extend(children.get(current, []))
        return collected

    def descendant_ids(self, category_id: int) -> set[int]:
        return set(self.subtree_ids(category_id)) - {category_id}

    def depth_of(self, category_id: int | None) -> int:
        """Number of ancestors above a category (a root category is depth 0)."""
        depth = 0
        current = category_id
        seen: set[int] = set()
        while current is not None and current not in seen:
            seen.add(current)
            row = self.session.get(Category, current)
            if row is None or row.parent_id is None:
                break
            current = row.parent_id
            depth += 1
        return depth

    # --------------------------------------------------------- usage counts

    def transaction_counts(self) -> dict[int, int]:
        """Non-voided transactions booked directly against each category."""
        stmt = (
            select(Transaction.category_id, func.count(Transaction.id))
            .where(Transaction.category_id.is_not(None), Transaction.is_voided.is_(False))
            .group_by(Transaction.category_id)
        )
        return {row[0]: int(row[1]) for row in self.session.execute(stmt)}

    def is_used(self, category_id: int) -> bool:
        """True when anything at all references the category."""
        used_by_transaction = self.session.scalar(
            select(func.count())
            .select_from(Transaction)
            .where(Transaction.category_id == category_id)
        )
        if used_by_transaction:
            return True
        used_by_posting = self.session.scalar(
            select(func.count()).select_from(Posting).where(Posting.category_id == category_id)
        )
        if used_by_posting:
            return True
        used_by_budget = self.session.scalar(
            select(func.count()).select_from(Budget).where(Budget.category_id == category_id)
        )
        return bool(used_by_budget)
