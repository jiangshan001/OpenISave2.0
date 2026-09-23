"""Application configuration.

Data lives outside the repository by default (%LOCALAPPDATA%\OpenISave2 on
Windows).  A repo-local database may be requested explicitly for development
via OPENISAVE_DEV_LOCAL_DATA=1, never by accident.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

APP_DIR_NAME = "OpenISave2"


def _default_data_root() -> Path:
    if os.environ.get("OPENISAVE_DEV_LOCAL_DATA") == "1":
        return Path(__file__).resolve().parents[2] / ".localdata"
    base = os.environ.get("LOCALAPPDATA") or os.environ.get("XDG_DATA_HOME")
    if base:
        return Path(base) / APP_DIR_NAME
    return Path.home() / f".{APP_DIR_NAME.lower()}"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="OPENISAVE_", env_file=".env", extra="ignore")

    app_name: str = "OpenISave 2.0"
    api_v1_prefix: str = "/api/v1"

    host: str = "127.0.0.1"
    port: int = 8756
    debug: bool = False

    data_root: Path = _default_data_root()
    database_url: str | None = None

    #: The Vite dev server, plus the origins the Tauri webview uses.
    cors_origins: list[str] = [
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "tauri://localhost",
        "http://tauri.localhost",
        "https://tauri.localhost",
    ]

    fx_provider_url: str = "https://api.frankfurter.dev/v1"
    fx_timeout_seconds: float = 8.0
    fx_stale_after_days: int = 3

    log_level: str = "INFO"

    @property
    def data_dir(self) -> Path:
        return self.data_root / "data"

    @property
    def backup_dir(self) -> Path:
        return self.data_root / "backups"

    @property
    def log_dir(self) -> Path:
        return self.data_root / "logs"

    @property
    def db_path(self) -> Path:
        return self.data_dir / "finance.db"

    @property
    def sqlalchemy_url(self) -> str:
        if self.database_url:
            return self.database_url
        return f"sqlite:///{self.db_path.as_posix()}"

    def ensure_directories(self) -> None:
        for directory in (self.data_dir, self.backup_dir, self.log_dir):
            directory.mkdir(parents=True, exist_ok=True)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
