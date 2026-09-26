"""FastAPI application entry point.

The server binds to 127.0.0.1 only (invariant 10), answers only to loopback
Host headers, and runs with debug off by default. At startup the storage
runtime opens the encrypted vault (migrating 2.0.x plaintext data if needed);
until the vault is unlocked, only the Data & Security status and recovery
endpoints respond.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.api.errors import register_exception_handlers
from app.api.v1.router import api_router
from app.core.config import settings
from app.core.logging import configure_logging, get_logger
from app.core.money import BASE_CURRENCY
from app.security.runtime import VaultState, get_runtime

logger = get_logger(__name__)

_PREFIX = settings.api_v1_prefix
#: Paths (after the API prefix) that answer in each non-ready state.
_ALWAYS_OPEN = {("GET", "/health"), ("GET", "/security/status")}
_OPEN_BY_STATE: dict[VaultState, set[tuple[str, str]]] = {
    VaultState.LOCKED: {("POST", "/security/unlock")},
    VaultState.VAULT_MISSING: {
        ("POST", "/security/unlock"),
        ("GET", "/security/backups"),
        ("POST", "/security/restore"),
        ("POST", "/security/open-data-folder"),
    },
    VaultState.MIGRATION_FAILED: {
        ("POST", "/security/migration/retry"),
        ("POST", "/security/open-data-folder"),
    },
    VaultState.ERROR: {("POST", "/security/migration/retry")},
}


def _gate_response(state: VaultState, message: str | None) -> JSONResponse:
    code = "vault_locked" if state == VaultState.LOCKED else f"vault_{state.value}"
    return JSONResponse(
        status_code=423,
        content={
            "code": code,
            "message": message or "Your encrypted database is not available yet.",
            "details": {"state": state.value},
        },
    )


@asynccontextmanager
async def lifespan(_: FastAPI):
    configure_logging()
    runtime = get_runtime()
    if runtime.state == VaultState.STARTING:
        runtime.start()
    logger.info("startup_complete vault=%s", runtime.state.value)
    yield
    logger.info("shutdown_complete")


class _OpenGate:
    """Test double: a storage gate that is always open."""

    state = VaultState.READY
    message = None

    def request_started(self) -> bool:
        return True

    def request_finished(self) -> None:
        return None


def create_app(*, storage=None) -> FastAPI:
    """Build the app. `storage="open"` disables the vault gate (tests only)."""
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        debug=settings.debug,
        lifespan=lifespan,
        docs_url="/docs",
        openapi_url="/openapi.json",
    )
    gate_override = _OpenGate() if storage == "open" else storage

    @app.middleware("http")
    async def vault_gate(request: Request, call_next):
        path = request.url.path
        if not path.startswith(_PREFIX) or request.method == "OPTIONS":
            return await call_next(request)
        storage_runtime = gate_override or get_runtime()
        route = (request.method, path[len(_PREFIX):])
        state = storage_runtime.state
        if state != VaultState.READY and route not in _ALWAYS_OPEN:
            if route not in _OPEN_BY_STATE.get(state, set()):
                return _gate_response(state, storage_runtime.message)
        if not storage_runtime.request_started():
            return JSONResponse(
                status_code=503,
                content={
                    "code": "maintenance",
                    "message": "OpenISave is restoring a backup. Try again in a moment.",
                    "details": {},
                },
            )
        try:
            return await call_next(request)
        finally:
            storage_runtime.request_finished()

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.trusted_hosts)
    register_exception_handlers(app)
    app.include_router(api_router, prefix=_PREFIX)

    @app.get("/api/v1/health", tags=["system"])
    def health() -> dict:
        return {
            "status": "ok",
            "app": settings.app_name,
            "version": settings.app_version,
            "base_currency": BASE_CURRENCY,
            "vault": (gate_override or get_runtime()).state.value,
        }

    return app


app = create_app()
