"""Application level exceptions.

Every exception carries a human readable message plus a machine readable code so
the frontend can render an explanation instead of a bare 500.
"""

from __future__ import annotations

from typing import Any


class AppError(Exception):
    status_code = 400
    code = "app_error"

    def __init__(self, message: str, *, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"


class ValidationError(AppError):
    status_code = 422
    code = "validation_error"


class ConflictError(AppError):
    status_code = 409
    code = "conflict"


class FxRateUnavailableError(AppError):
    """No usable exchange rate exists and none may be invented."""

    status_code = 409
    code = "fx_rate_unavailable"

    def __init__(self, from_currency: str, to_currency: str) -> None:
        super().__init__(
            f"Exchange rate unavailable for {from_currency}/{to_currency}. "
            "Refresh exchange rates or enter a manual rate.",
            details={"from_currency": from_currency, "to_currency": to_currency},
        )


class FxProviderError(AppError):
    status_code = 503
    code = "fx_provider_unavailable"
