from __future__ import annotations

from sqlalchemy import BigInteger, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class Posting(Base, TimestampMixin):
    """One leg of a transaction.

    Account legs (`account_id` set) drive balances; category legs
    (`category_id` set) classify the movement; asset legs (`asset_id` set)
    balance a purchase or sale against the thing being bought or sold. Amounts
    are signed in the leg's own currency, and every transaction's legs sum to
    zero in the base currency.
    """

    __tablename__ = "postings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    transaction_id: Mapped[int] = mapped_column(
        ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    account_id: Mapped[int | None] = mapped_column(
        ForeignKey("accounts.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    asset_id: Mapped[int | None] = mapped_column(
        ForeignKey("assets.id", ondelete="CASCADE"), nullable=True, index=True
    )
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    base_amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    fx_rate_to_base: Mapped[object] = mapped_column(Numeric(24, 10), nullable=False, default=1)

    transaction = relationship("Transaction", back_populates="postings")
