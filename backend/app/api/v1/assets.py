from __future__ import annotations

from fastapi import APIRouter, Query, Response

from app.api.deps import AssetDep
from app.core.enums import AssetStatus
from app.schemas.asset import (
    AssetCategoryCreate,
    AssetCategoryRead,
    AssetCategoryUpdate,
    AssetCreate,
    AssetDetailRead,
    AssetRead,
    AssetSale,
    AssetUpdate,
    AssetValuationCreate,
    AssetValuationRead,
    CurrentValueRead,
)
from app.services.asset_service import AssetView

router = APIRouter(prefix="/assets", tags=["assets"])


def _to_read(view: AssetView) -> AssetRead:
    asset = view.asset
    return AssetRead(
        id=asset.id,
        name=asset.name,
        asset_category_id=asset.asset_category_id,
        category_name=view.category_name,
        description=asset.description,
        purchase_date=asset.purchase_date,
        purchase_price_minor=asset.purchase_price_minor,
        purchase_currency=asset.purchase_currency,
        purchase_base_minor=asset.purchase_base_minor,
        status=asset.status,
        sale_date=asset.sale_date,
        sale_price_minor=asset.sale_price_minor,
        sale_currency=asset.sale_currency,
        sale_base_minor=asset.sale_base_minor,
        include_in_net_worth=asset.include_in_net_worth,
        include_in_net_worth_source="manual" if asset.include_in_net_worth_manual else "category",
        linked_liability_id=asset.linked_liability_id,
        liability_name=view.liability_name,
        note=asset.note,
        current_value=(
            CurrentValueRead.model_validate(view.current_value, from_attributes=True)
            if view.current_value
            else None
        ),
        days_held=view.days_held,
        holding_cost_per_day_minor=view.holding_cost_per_day_minor,
        net_cost_minor=view.net_cost_minor,
        effective_cost_per_day_minor=view.effective_cost_per_day_minor,
        created_at=asset.created_at,
        updated_at=asset.updated_at,
    )


@router.get("", response_model=list[AssetRead])
def list_assets(service: AssetDep, status: AssetStatus | None = Query(default=None)) -> list[AssetRead]:
    views = service.list_views(status=status.value if status else None)
    return [_to_read(view) for view in views]


@router.get("/categories", response_model=list[AssetCategoryRead])
def list_asset_categories(service: AssetDep) -> list[AssetCategoryRead]:
    return [AssetCategoryRead.model_validate(row) for row in service.categories()]


@router.post("/categories", response_model=AssetCategoryRead, status_code=201)
def create_asset_category(payload: AssetCategoryCreate, service: AssetDep) -> AssetCategoryRead:
    category = service.create_category(payload.name, payload.include_in_net_worth_default)
    return AssetCategoryRead.model_validate(category)


@router.patch("/categories/{category_id}", response_model=AssetCategoryRead)
def update_asset_category(
    category_id: int, payload: AssetCategoryUpdate, service: AssetDep
) -> AssetCategoryRead:
    category = service.set_category_default(category_id, payload.include_in_net_worth_default)
    return AssetCategoryRead.model_validate(category)


@router.post("", response_model=AssetRead, status_code=201)
def create_asset(payload: AssetCreate, service: AssetDep) -> AssetRead:
    data = payload.model_dump()
    asset = service.purchase(data)
    return _to_read(service.view(asset))


@router.get("/{asset_id}", response_model=AssetDetailRead)
def get_asset(asset_id: int, service: AssetDep) -> AssetDetailRead:
    asset = service.get(asset_id)
    payload = _to_read(service.view(asset)).model_dump()
    payload["valuations"] = [
        AssetValuationRead.model_validate(row).model_dump()
        for row in service.repo.valuations(asset_id)
    ]
    return AssetDetailRead.model_validate(payload)


@router.patch("/{asset_id}", response_model=AssetRead)
def update_asset(asset_id: int, payload: AssetUpdate, service: AssetDep) -> AssetRead:
    asset = service.update(asset_id, payload.model_dump(exclude_unset=True))
    return _to_read(service.view(asset))


@router.post("/{asset_id}/sell", response_model=AssetRead)
def sell_asset(asset_id: int, payload: AssetSale, service: AssetDep) -> AssetRead:
    asset = service.sell(asset_id, payload.model_dump())
    return _to_read(service.view(asset))


@router.get("/{asset_id}/valuations", response_model=list[AssetValuationRead])
def list_valuations(asset_id: int, service: AssetDep) -> list[AssetValuationRead]:
    service.get(asset_id)
    return [AssetValuationRead.model_validate(row) for row in service.repo.valuations(asset_id)]


@router.post("/{asset_id}/valuations", response_model=AssetValuationRead, status_code=201)
def add_valuation(
    asset_id: int, payload: AssetValuationCreate, service: AssetDep
) -> AssetValuationRead:
    return AssetValuationRead.model_validate(service.add_valuation(asset_id, payload.model_dump()))


@router.delete("/{asset_id}/valuations/{valuation_id}", status_code=204, response_class=Response)
def delete_valuation(asset_id: int, valuation_id: int, service: AssetDep) -> Response:
    service.delete_valuation(asset_id, valuation_id)
    return Response(status_code=204)


@router.delete("/{asset_id}", status_code=204, response_class=Response)
def delete_asset(asset_id: int, service: AssetDep) -> Response:
    service.delete(asset_id)
    return Response(status_code=204)
