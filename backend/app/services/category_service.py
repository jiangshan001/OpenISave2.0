"""Category management.

Categories form a tree per kind (expense / income). The rules that protect
financial history:

  * a category in use is archived, never deleted, so old transactions keep
    rendering with the name they were filed under;
  * a category can never become its own ancestor;
  * a category cannot change kind once it exists, and a child always shares its
    parent's kind.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.enums import CategoryKind
from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.core.logging import get_logger
from app.models.category import Category
from app.repositories.categories import CategoryRepository

logger = get_logger(__name__)

MAX_DEPTH = 3  # root + two levels of nesting


@dataclass
class CategoryNode:
    category: Category
    transaction_count: int
    subtree_count: int
    depth: int


class CategoryService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.repo = CategoryRepository(session)

    # -------------------------------------------------------------- reading

    def get(self, category_id: int) -> Category:
        category = self.repo.get(category_id)
        if category is None:
            raise NotFoundError(f"Category {category_id} was not found.")
        return category

    def list_nodes(
        self, *, kind: str | None = None, include_inactive: bool = True
    ) -> list[CategoryNode]:
        rows = self.repo.list(kind=kind, include_inactive=include_inactive)
        counts = self.repo.transaction_counts()
        nodes: list[CategoryNode] = []
        for row in rows:
            subtree = self.repo.subtree_ids(row.id)
            nodes.append(
                CategoryNode(
                    category=row,
                    transaction_count=counts.get(row.id, 0),
                    subtree_count=sum(counts.get(cid, 0) for cid in subtree),
                    depth=self.repo.depth_of(row.id),
                )
            )
        return nodes

    # -------------------------------------------------------------- writing

    def _check_parent(self, parent_id: int | None, kind: str, *, moving: int | None = None) -> None:
        if parent_id is None:
            return
        parent = self.repo.get(parent_id)
        if parent is None:
            raise NotFoundError(f"Parent category {parent_id} was not found.")
        if parent.kind != kind:
            raise ValidationError("A category must have the same kind as its parent.")
        if moving is not None:
            if parent_id == moving:
                raise ValidationError("A category cannot be its own parent.")
            if parent_id in self.repo.descendant_ids(moving):
                raise ValidationError(
                    "A category cannot be moved inside one of its own subcategories."
                )
        if self.repo.depth_of(parent_id) + 1 >= MAX_DEPTH:
            raise ValidationError(
                f"Categories can be nested {MAX_DEPTH} levels deep at most."
            )

    def _check_duplicate(self, name: str, kind: str, parent_id: int | None, exclude: int | None):
        siblings = [
            row
            for row in self.repo.list(kind=kind, include_inactive=True)
            if row.parent_id == parent_id and row.id != exclude
        ]
        if any(row.name.lower() == name.lower() for row in siblings):
            raise ConflictError(f"A category named '{name}' already exists here.")

    def create(self, data: dict) -> Category:
        name = (data.get("name") or "").strip()
        if not name:
            raise ValidationError("Category name is required.")
        kind = CategoryKind(data["kind"]).value
        parent_id = data.get("parent_id")
        self._check_parent(parent_id, kind)
        self._check_duplicate(name, kind, parent_id, None)
        category = self.repo.add(
            Category(
                name=name,
                kind=kind,
                parent_id=parent_id,
                sort_order=int(data.get("sort_order") or 0),
            )
        )
        self.session.commit()
        logger.info("category_created id=%s kind=%s", category.id, kind)
        return category

    def update(self, category_id: int, data: dict) -> Category:
        category = self.get(category_id)
        if data.get("kind") and data["kind"] != category.kind:
            raise ValidationError(
                "A category's kind cannot be changed. Create a new category instead."
            )

        new_parent = data["parent_id"] if "parent_id" in data else category.parent_id
        if "parent_id" in data and new_parent != category.parent_id:
            self._check_parent(new_parent, category.kind, moving=category.id)
            # Moving a subtree must not push its descendants past the limit.
            deepest = max(
                (self.repo.depth_of(cid) for cid in self.repo.subtree_ids(category.id)),
                default=0,
            )
            subtree_height = deepest - self.repo.depth_of(category.id)
            if self.repo.depth_of(new_parent) + 1 + subtree_height >= MAX_DEPTH:
                raise ValidationError(
                    f"Moving this category would nest its subcategories more than "
                    f"{MAX_DEPTH} levels deep."
                )
            category.parent_id = new_parent

        new_name = (data.get("name") or category.name).strip()
        if not new_name:
            raise ValidationError("Category name is required.")
        self._check_duplicate(new_name, category.kind, category.parent_id, category.id)
        category.name = new_name

        if data.get("sort_order") is not None:
            category.sort_order = int(data["sort_order"])
        if data.get("is_active") is not None:
            self._set_active(category, bool(data["is_active"]))

        self.session.commit()
        logger.info("category_updated id=%s", category.id)
        return category

    def _set_active(self, category: Category, active: bool) -> None:
        if active and category.parent_id is not None:
            parent = self.repo.get(category.parent_id)
            if parent is not None and not parent.is_active:
                raise ValidationError(
                    f"Restore '{parent.name}' first — a subcategory cannot be active "
                    "inside an archived parent."
                )
        category.is_active = active
        if not active:
            # Archiving hides the whole branch so nothing orphaned stays usable.
            for child_id in self.repo.descendant_ids(category.id):
                child = self.repo.get(child_id)
                if child is not None:
                    child.is_active = False

    def archive(self, category_id: int, archived: bool = True) -> Category:
        category = self.get(category_id)
        self._set_active(category, not archived)
        self.session.commit()
        logger.info("category_archived id=%s archived=%s", category.id, archived)
        return category

    def delete(self, category_id: int) -> None:
        """Hard delete only when nothing references the category."""
        category = self.get(category_id)
        if self.repo.children_of(category.id):
            raise ConflictError(
                f"'{category.name}' has subcategories. Remove or move them first."
            )
        if self.repo.is_used(category.id):
            raise ConflictError(
                f"'{category.name}' is used by existing records and cannot be deleted. "
                "Archive it instead — your history will keep showing it."
            )
        self.repo.delete(category)
        self.session.commit()
        logger.info("category_deleted id=%s", category_id)
