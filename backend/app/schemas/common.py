"""Shared schema primitives.

The API speaks minor units and currency codes; the frontend converts for
display. Amounts may also be supplied as decimal strings, which are converted
here through Decimal (never float).
"""

from __future__ import annotations

from decimal import Decimal
from typing import Annotated, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.money import SUPPORTED_CURRENCIES

T = TypeVar("T")

CurrencyCode = Annotated[str, Field(min_length=3, max_length=3)]
PositiveMinor = Annotated[int, Field(gt=0)]


class ApiModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class CurrencyRead(ApiModel):
    code: str
    symbol: str
    minor_unit_digits: int
    display_name: str
    is_active: bool


class Page(ApiModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int


class MessageResponse(ApiModel):
    ok: bool = True
    message: str


class ErrorResponse(ApiModel):
    code: str
    message: str
    details: dict = {}


def validate_currency(value: str) -> str:
    code = value.upper()
    if code not in SUPPORTED_CURRENCIES:
        raise ValueError(f"Currency {code} is not supported")
    return code


class CurrencyMixin(BaseModel):
    @field_validator("currency", check_fields=False)
    @classmethod
    def _currency_supported(cls, value: str) -> str:
        return validate_currency(value)


def decimal_to_minor(value: Decimal | str | int, currency: str) -> int:
    from app.core.money import to_minor

    return to_minor(value, currency)
