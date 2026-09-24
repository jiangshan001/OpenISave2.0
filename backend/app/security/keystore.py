"""Where the database key lives.

Production uses Windows Credential Manager through the `keyring` library's
WinVault backend (a generic credential protected by DPAPI for the current
Windows user). The backend is instantiated directly rather than discovered via
entry points, so the packaged app can never silently fall back to a weaker
store.

The key never touches the data directory, config files, .env or logs.
"""

from __future__ import annotations

import sys
from typing import Protocol

from app.core.config import Settings

#: Account name stored alongside the secret; the target is the service name.
CREDENTIAL_USER = "OpenISave2"


class KeyStoreError(RuntimeError):
    """The OS key store could not be read or written."""


class KeyStore(Protocol):
    kind: str
    label: str
    target: str

    def get(self) -> str | None: ...

    def set(self, key: str) -> None: ...

    def delete(self) -> None: ...


class CredentialManagerKeyStore:
    """Windows Credential Manager, generic credential `target`."""

    kind = "windows_credential_manager"
    label = "Windows Credential Manager"

    def __init__(self, target: str) -> None:
        if sys.platform != "win32":  # pragma: no cover - Windows-only product
            raise KeyStoreError("Windows Credential Manager is only available on Windows.")
        from keyring.backends.Windows import WinVaultKeyring

        self.target = target
        self._backend = WinVaultKeyring()

    def get(self) -> str | None:
        try:
            return self._backend.get_password(self.target, CREDENTIAL_USER)
        except Exception as exc:  # pragma: no cover - OS failure
            raise KeyStoreError("Could not read from Windows Credential Manager.") from exc

    def set(self, key: str) -> None:
        try:
            self._backend.set_password(self.target, CREDENTIAL_USER, key)
        except Exception as exc:  # pragma: no cover - OS failure
            raise KeyStoreError("Could not write to Windows Credential Manager.") from exc

    def delete(self) -> None:
        from keyring.errors import PasswordDeleteError

        try:
            self._backend.delete_password(self.target, CREDENTIAL_USER)
        except PasswordDeleteError:
            return


class MemoryKeyStore:
    """Process-local store for tests. Never selected in production builds."""

    kind = "memory"
    label = "In-memory (tests only)"

    def __init__(self, target: str = "memory") -> None:
        self.target = target
        self._key: str | None = None

    def get(self) -> str | None:
        return self._key

    def set(self, key: str) -> None:
        self._key = key

    def delete(self) -> None:
        self._key = None


def build_key_store(settings: Settings) -> KeyStore:
    if settings.key_store == "memory":
        return MemoryKeyStore(settings.credential_service)
    if settings.key_store == "windows":
        return CredentialManagerKeyStore(settings.credential_service)
    raise KeyStoreError(f"Unknown key store '{settings.key_store}'.")
