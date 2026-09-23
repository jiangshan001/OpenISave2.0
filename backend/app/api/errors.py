"""Exception handlers.

Every failure reaches the frontend as a structured `{code, message, details}`
payload with an explanation a person can act on -- never a bare 500.
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.exceptions import AppError
from app.core.logging import get_logger
from app.core.money import MoneyError

logger = get_logger(__name__)


def _payload(code: str, message: str, details: dict | None = None) -> dict:
    return {"code": code, "message": message, "details": details or {}}


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(_: Request, exc: AppError) -> JSONResponse:
        logger.info("app_error code=%s", exc.code)
        return JSONResponse(
            status_code=exc.status_code, content=_payload(exc.code, exc.message, exc.details)
        )

    @app.exception_handler(MoneyError)
    async def handle_money_error(_: Request, exc: MoneyError) -> JSONResponse:
        return JSONResponse(status_code=422, content=_payload("invalid_amount", str(exc)))

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        issues = []
        for error in exc.errors():
            location = ".".join(str(part) for part in error.get("loc", []) if part != "body")
            issues.append({"field": location or "request", "message": error.get("msg", "Invalid")})
        first = issues[0]["message"] if issues else "The submitted data is not valid."
        return JSONResponse(
            status_code=422,
            content=_payload("validation_error", first, {"issues": issues}),
        )

    @app.exception_handler(Exception)
    async def handle_unexpected(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled_error type=%s", type(exc).__name__)
        return JSONResponse(
            status_code=500,
            content=_payload(
                "internal_error",
                "Something went wrong while processing this request. "
                "The details were written to the local log file.",
            ),
        )
