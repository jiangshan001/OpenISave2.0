from __future__ import annotations

from datetime import date

from sqlalchemy import BigInteger, Boolean, Date, ForeignKey, Integer, String, Text, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import AssetStatus
from app.db.base import Base, TimestampMixin


class AssetCategory(Base, TimestampMixin):
    """Classification for physical assets.

    Deliberately separate from spending categories: an asset category describes
    a thing you own, a transaction category describes where money went.

    `include_in_net_worth_default` decides whether assets in this category
    count towards net worth unless the user says otherwise. Only stores of
    wealth (property, investment assets) default to true; personal possessions
    such as electronics or vehicles are tracked but excluded.
    """

    __tablename__ = "asset_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    icon: Mapped[str | None] = mapped_column(String(32), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    include_in_net_worth_default: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )


class Asset(Base, TimestampMixin):
    """A physical asset such as a laptop, camera or vehicle.

    Purchase and sale amounts keep their native currency plus a frozen base
    value, exactly as transactions do.
    """

    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    asset_category_id: Mapped[int | None] = mapped_column(
        ForeignKey("asset_categories.id", ondelete="SET NULL"), nullable=True, index=True
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    purchase_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    purchase_price_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    purchase_currency: Mapped[str] = mapped_column(ForeignKey("currencies.code"), nullable=False)
    purchase_base_minor: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)

    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=AssetStatus.HOLDING.value, index=True
    )
    sale_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    sale_price_minor: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    sale_currency: Mapped[str | None] = mapped_column(String(3), nullable=True)
    sale_base_minor: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    #: Effective flag, always stored so net worth never has to resolve defaults.
    include_in_net_worth: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    #: True once the user chose the flag explicitly; otherwise it follows the
    #: category default and moves with it.
    include_in_net_worth_manual: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    linked_liability_id: Mapped[int | None] = mapped_column(
        ForeignKey("liabilities.id", ondelete="SET NULL"), nullable=True
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    valuations = relationship(
        "AssetValuation",
        back_populates="asset",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="AssetValuation.valuation_date.desc(), AssetValuation.id.desc()",
    )


class AssetValuation(Base, TimestampMixin):
    """A dated estimate of what an asset is worth.

    Valuations are appended, never overwritten, so depreciation stays visible.
    """

    __tablename__ = "asset_valuations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    asset_id: Mapped[int] = mapped_column(
        ForeignKey("assets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    valuation_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    value_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    asset = relationship("Asset", back_populates="valuations")
