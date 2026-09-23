"""FastAPI application entry point.

The server binds to 127.0.0.1 only (invariant 10) and runs with debug off by
default.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.errors import register_exception_handlers
from app.api.v1.router import api_router
from app.core.config import settings
from app.core.logging import configure_logging, get_logger
from app.core.money import BASE_CURRENCY
from app.db.seed import seed_all
from app.db.session import session_scope

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    configure_logging()
    settings.ensure_directories()
    with session_scope() as session:
        seeded = seed_all(session)
    logger.info("startup_complete seeded=%s", seeded)
    yield
    logger.info("shutdown_complete")


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version="1.0.0",
        debug=settings.debug,
        lifespan=lifespan,
        docs_url="/docs",
        openapi_url="/openapi.json",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_exception_handlers(app)
    app.include_router(api_router, prefix=settings.api_v1_prefix)

    @app.get("/api/v1/health", tags=["system"])
    def health() -> dict:
        return {
            "status": "ok",
            "app": settings.app_name,
            "version": "1.0.0",
            "base_currency": BASE_CURRENCY,
        }

    return app


app = create_app()
