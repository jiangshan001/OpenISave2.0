from __future__ import annotations

from sqlalchemy import ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class LiabilityReceipt(Base, TimestampMixin):
    """Idempotency marker for a historical deposit credited to a cash account."""

    __tablename__ = "liability_receipts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="RESTRICT"), nullable=False, unique=True
    )
    liability_id: Mapped[int | None] = mapped_column(
        ForeignKey("liabilities.id", ondelete="SET NULL"), nullable=True
    )
    transaction_id: Mapped[int] = mapped_column(
        ForeignKey("transactions.id", ondelete="RESTRICT"), nullable=False, unique=True
    )
