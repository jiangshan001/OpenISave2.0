from __future__ import annotations

from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class AppSetting(Base, TimestampMixin):
    """Singleton settings row (id == 1)."""

    __tablename__ = "app_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    base_currency: Mapped[str] = mapped_column(String(3), nullable=False, default="CNY")
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="Asia/Shanghai")
    locale: Mapped[str] = mapped_column(String(16), nullable=False, default="en")
    fx_stale_after_days: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
