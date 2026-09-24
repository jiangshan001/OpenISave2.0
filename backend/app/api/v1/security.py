"""Data & Security endpoints.

`/security/status` and `/security/unlock` answer even while the vault is
locked; everything else requires an unlocked vault (enforced by the gate
middleware in app.main). No endpoint ever returns the database key; the
recovery-key export is the single, explicit exception and requires a
confirmation body.
"""

from __future__ import annotations

import os
import sys

from fastapi import APIRouter

from app.db import bootstrap
from app.schemas.security import (
    ConfirmRequest,
    RemovePlaintextRequest,
    RestoreRequest,
    UnlockRequest,
    VerifyBackupRequest,
)
from app.security.backups import BackupError
from app.security.runtime import SecurityError, VaultState, get_runtime

router = APIRouter(prefix="/security", tags=["security"])


@router.get("/status")
def status() -> dict:
    return get_runtime().status()


@router.post("/unlock")
def unlock(payload: UnlockRequest) -> dict:
    get_runtime().unlock_with_recovery_key(payload.recovery_key)
    return get_runtime().status()


@router.post("/migration/retry")
def retry_migration() -> dict:
    runtime = get_runtime()
    if runtime.state not in (VaultState.MIGRATION_FAILED, VaultState.ERROR):
        raise SecurityError("There is no failed migration to retry.")
    runtime.start()
    return runtime.status()


@router.post("/recovery-key/export")
def export_recovery_key(_: ConfirmRequest) -> dict:
    """Reveal the recovery key once, on explicit request. Never logged."""
    return {"recovery_key": get_runtime().export_recovery_key()}


@router.get("/backups")
def list_backups() -> list[dict]:
    return [item.to_dict() for item in get_runtime().backups.list()]


@router.post("/backups", status_code=201)
def back_up_now() -> dict:
    try:
        return get_runtime().backups.create("manual").to_dict()
    except BackupError as exc:
        raise SecurityError(str(exc)) from exc


@router.post("/backups/verify")
def verify_backup(payload: VerifyBackupRequest) -> dict:
    runtime = get_runtime()
    try:
        info = runtime.backups.resolve(payload.backup_id)
    except BackupError as exc:
        raise SecurityError(str(exc)) from exc
    result = runtime.backups.verify(info, bootstrap.known_revisions())
    return {"backup": info.to_dict(), "ok": result.ok, "problems": result.problems}


@router.post("/restore")
def restore(payload: RestoreRequest) -> dict:
    result = get_runtime().restore(payload.backup_id)
    return {**result, "status": get_runtime().status()}


@router.post("/open-data-folder")
def open_data_folder() -> dict:
    folder = get_runtime().settings.data_root
    if sys.platform == "win32":
        os.startfile(str(folder))  # noqa: S606 - opens Explorer on our own folder
    return {"opened": str(folder)}


@router.post("/plaintext/remove")
def remove_plaintext(_: RemovePlaintextRequest) -> dict:
    result = get_runtime().remove_plaintext()
    return {**result, "status": get_runtime().status()}
