"""Application configuration.

Financial data lives in its own directory, independent of the source
repository, the installation directory and any build output:

    %LOCALAPPDATA%\\OpenISave2Data\\
        vault\\finance.db      SQLCipher-encrypted database
        backups\\              encrypted backups (daily/weekly/monthly/...)
        config\\               non-secret storage metadata
        logs\\                 event logs (never amounts)
        migration\\            plaintext-to-encrypted migration records

The database key is never configured here: it lives in Windows Credential
Manager (see app.security.keystore). A repo-local data directory may be
requested explicitly for development via OPENISAVE_DEV_LOCAL_DATA=1, never by
accident; it never looks at the legacy V2 data.
"""

from __future__ import annotations

import os
import sys
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

APP_DATA_DIR_NAME = "OpenISave2Data"
#: Where OpenISave 2.0.x kept its plaintext database.
LEGACY_DIR_NAME = "OpenISave2"
#: Windows Credential Manager target holding the database key.
CREDENTIAL_SERVICE = "OpenISave2/DatabaseEncryptionKey"
APP_VERSION = "2.2.0"


def local_app_data() -> Path:
    """The user's canonical LocalAppData folder.

    Asks Windows (SHGetKnownFolderPath) rather than trusting the environment,
    falling back to %LOCALAPPDATA% and then the home directory.
    """
    if sys.platform == "win32":
        try:
            import ctypes
            from ctypes import wintypes
            from uuid import UUID

            class GUID(ctypes.Structure):
                _fields_ = [
                    ("Data1", wintypes.DWORD),
                    ("Data2", wintypes.WORD),
                    ("Data3", wintypes.WORD),
                    ("Data4", wintypes.BYTE * 8),
                ]

            folder = UUID("{F1B32785-6FBA-4FCF-9D55-7B8E7F157091}")  # FOLDERID_LocalAppData
            guid = GUID(
                folder.fields[0],
                folder.fields[1],
                folder.fields[2],
                (wintypes.BYTE * 8).from_buffer_copy(folder.bytes[8:]),
            )
            path_ptr = ctypes.c_wchar_p()
            shell32 = ctypes.windll.shell32
            result = shell32.SHGetKnownFolderPath(
                ctypes.byref(guid), 0, None, ctypes.byref(path_ptr)
            )
            try:
                if result == 0 and path_ptr.value:
                    return Path(path_ptr.value)
            finally:
                ctypes.windll.ole32.CoTaskMemFree(path_ptr)
        except Exception:  # pragma: no cover - fall through to the environment
            pass
    base = os.environ.get("LOCALAPPDATA") or os.environ.get("XDG_DATA_HOME")
    if base:
        return Path(base)
    return Path.home() / ".local" / "share"


def _dev_local() -> bool:
    return os.environ.get("OPENISAVE_DEV_LOCAL_DATA") == "1"


def _default_data_root() -> Path:
    if _dev_local():
        return Path(__file__).resolve().parents[2] / ".localdata"
    return local_app_data() / APP_DATA_DIR_NAME


def _default_legacy_root() -> Path:
    if _dev_local():
        # Development never migrates (or even looks at) the real V2 data.
        return Path(__file__).resolve().parents[2] / ".localdata-legacy"
    return local_app_data() / LEGACY_DIR_NAME


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="OPENISAVE_", env_file=".env", extra="ignore")

    app_name: str = "OpenISave 2.0"
    app_version: str = APP_VERSION
    api_v1_prefix: str = "/api/v1"

    host: str = "127.0.0.1"
    port: int = 8756
    debug: bool = False

    data_root: Path = _default_data_root()
    legacy_data_root: Path = _default_legacy_root()

    #: "windows" (Credential Manager) in production; "memory" only in tests.
    key_store: str = "windows"
    #: Development uses its own credential so it can never replace the real key.
    credential_service: str = (
        "OpenISave2-Dev/DatabaseEncryptionKey" if _dev_local() else CREDENTIAL_SERVICE
    )

    #: The Vite dev server, plus the origins the Tauri webview uses.
    cors_origins: list[str] = [
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "tauri://localhost",
        "http://tauri.localhost",
        "https://tauri.localhost",
    ]
    #: Host headers the API answers to. Anything else (e.g. a DNS-rebinding
    #: page pretending to be 127.0.0.1) is refused.
    trusted_hosts: list[str] = ["127.0.0.1", "localhost", "testserver"]

    fx_provider_url: str = "https://api.frankfurter.dev/v1"
    fx_timeout_seconds: float = 8.0
    fx_stale_after_days: int = 3

    log_level: str = "INFO"

    # ------------------------------------------------------------------ paths

    @property
    def vault_dir(self) -> Path:
        return self.data_root / "vault"

    @property
    def db_path(self) -> Path:
        return self.vault_dir / "finance.db"

    @property
    def backup_dir(self) -> Path:
        return self.data_root / "backups"

    @property
    def config_dir(self) -> Path:
        return self.data_root / "config"

    @property
    def log_dir(self) -> Path:
        return self.data_root / "logs"

    @property
    def migration_dir(self) -> Path:
        return self.data_root / "migration"

    @property
    def legacy_db_path(self) -> Path:
        return self.legacy_data_root / "data" / "finance.db"

    def ensure_directories(self) -> None:
        for directory in (self.vault_dir, self.backup_dir, self.config_dir, self.log_dir):
            directory.mkdir(parents=True, exist_ok=True)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
