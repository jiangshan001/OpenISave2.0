from __future__ import annotations

from fastapi import APIRouter, Response

from app.api.deps import CategoryDep
from app.core.enums import CategoryKind
from app.schemas.misc import CategoryCreate, CategoryRead, CategoryUpdate

router = APIRouter(prefix="/categories", tags=["categories"])


def _to_read(node) -> CategoryRead:
    category = node.category
    return CategoryRead(
        id=category.id,
        name=category.name,
        kind=category.kind,
        parent_id=category.parent_id,
        sort_order=category.sort_order,
        is_active=category.is_active,
        depth=node.depth,
        transaction_count=node.transaction_count,
        subtree_transaction_count=node.subtree_count,
    )


@router.get("", response_model=list[CategoryRead])
def list_categories(
    service: CategoryDep,
    kind: CategoryKind | None = None,
    include_inactive: bool = False,
) -> list[CategoryRead]:
    nodes = service.list_nodes(
        kind=kind.value if kind else None, include_inactive=include_inactive
    )
    return [_to_read(node) for node in nodes]


@router.post("", response_model=CategoryRead, status_code=201)
def create_category(payload: CategoryCreate, service: CategoryDep) -> CategoryRead:
    category = service.create(payload.model_dump())
    node = next(
        item for item in service.list_nodes(kind=category.kind) if item.category.id == category.id
    )
    return _to_read(node)


@router.patch("/{category_id}", response_model=CategoryRead)
def update_category(
    category_id: int, payload: CategoryUpdate, service: CategoryDep
) -> CategoryRead:
    category = service.update(category_id, payload.model_dump(exclude_unset=True))
    node = next(
        item
        for item in service.list_nodes(kind=category.kind, include_inactive=True)
        if item.category.id == category.id
    )
    return _to_read(node)


@router.post("/{category_id}/archive", response_model=CategoryRead)
def archive_category(
    category_id: int, service: CategoryDep, archived: bool = True
) -> CategoryRead:
    category = service.archive(category_id, archived)
    node = next(
        item
        for item in service.list_nodes(kind=category.kind, include_inactive=True)
        if item.category.id == category.id
    )
    return _to_read(node)


@router.delete("/{category_id}", status_code=204, response_class=Response)
def delete_category(category_id: int, service: CategoryDep) -> Response:
    service.delete(category_id)
    return Response(status_code=204)
