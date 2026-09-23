"""Asset, asset category and asset valuation persistence."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import AssetStatus
from app.models.asset import Asset, AssetCategory, AssetValuation


class AssetRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    # ------------------------------------------------------------- assets

    def get(self, asset_id: int) -> Asset | None:
        return self.session.get(Asset, asset_id)

    def list(self, *, status: str | None = None) -> list[Asset]:
        stmt = select(Asset)
        if status:
            stmt = stmt.where(Asset.status == status)
        return list(
            self.session.scalars(stmt.order_by(Asset.purchase_date.desc(), Asset.id.desc()))
        )

    def list_holding(self) -> list[Asset]:
        return self.list(status=AssetStatus.HOLDING.value)

    def add(self, asset: Asset) -> Asset:
        self.session.add(asset)
        self.session.flush()
        return asset

    def delete(self, asset: Asset) -> None:
        self.session.delete(asset)
        self.session.flush()

    def linked_to_liability(self, liability_id: int) -> list[Asset]:
        stmt = select(Asset).where(Asset.linked_liability_id == liability_id)
        return list(self.session.scalars(stmt))

    # --------------------------------------------------------- valuations

    def add_valuation(self, valuation: AssetValuation) -> AssetValuation:
        self.session.add(valuation)
        self.session.flush()
        return valuation

    def get_valuation(self, valuation_id: int) -> AssetValuation | None:
        return self.session.get(AssetValuation, valuation_id)

    def valuations(self, asset_id: int) -> list[AssetValuation]:
        stmt = (
            select(AssetValuation)
            .where(AssetValuation.asset_id == asset_id)
            .order_by(AssetValuation.valuation_date.desc(), AssetValuation.id.desc())
        )
        return list(self.session.scalars(stmt))

    def latest_valuation(self, asset_id: int) -> AssetValuation | None:
        rows = self.valuations(asset_id)
        return rows[0] if rows else None

    def delete_valuation(self, valuation: AssetValuation) -> None:
        self.session.delete(valuation)
        self.session.flush()

    # --------------------------------------------------------- categories

    def categories(self, *, include_inactive: bool = False) -> list[AssetCategory]:
        stmt = select(AssetCategory)
        if not include_inactive:
            stmt = stmt.where(AssetCategory.is_active.is_(True))
        return list(self.session.scalars(stmt.order_by(AssetCategory.sort_order, AssetCategory.id)))

    def get_category(self, category_id: int) -> AssetCategory | None:
        return self.session.get(AssetCategory, category_id)

    def add_category(self, category: AssetCategory) -> AssetCategory:
        self.session.add(category)
        self.session.flush()
        return category

    def category_by_name(self, name: str) -> AssetCategory | None:
        return self.session.scalar(select(AssetCategory).where(AssetCategory.name == name))
