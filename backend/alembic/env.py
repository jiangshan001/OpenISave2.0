from __future__ import annotations

from logging.config import fileConfig

from alembic import context

from app.db.base import Base
from app.models import *  # noqa: F401,F403  (import side effect: register all tables)

config = context.config

# Only configure logging when Alembic runs from its own CLI. Inside the app,
# fileConfig would disable every existing logger and silently stop the
# application log (which is what happened in 2.0.x after the first migration).
if config.config_file_name is not None and config.attributes.get("configure_logger", True):
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def _run(connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Migrate over a connection the caller opened (and keyed).

    The encrypted database cannot be reached from a URL, so the application
    always hands Alembic a live connection. From the CLI, the vault runtime
    opens the production database with the key from Credential Manager.
    """
    connection = config.attributes.get("connection")
    if connection is not None:
        _run(connection)
        return

    from app.db.session import get_engine
    from app.security.runtime import get_runtime

    get_runtime().unlock_for_cli()
    with get_engine().begin() as connection:
        _run(connection)


if context.is_offline_mode():
    raise SystemExit("Offline (SQL script) migrations are not supported for the encrypted database.")
run_migrations_online()
