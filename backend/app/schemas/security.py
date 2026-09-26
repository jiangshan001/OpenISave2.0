from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel


class UnlockRequest(ApiModel):
    recovery_key: str = Field(min_length=10, max_length=200)


class ConfirmRequest(ApiModel):
    """Explicit confirmation body.

    A JSON body also forces a CORS preflight, so no other web page can trigger
    these endpoints with a simple cross-site form post.
    """

    confirm: Literal[True]


class RestoreRequest(ConfirmRequest):
    backup_id: str = Field(min_length=5, max_length=200)


class VerifyBackupRequest(ApiModel):
    backup_id: str = Field(min_length=5, max_length=200)


class RemovePlaintextRequest(ApiModel):
    confirm: Literal["REMOVE PLAINTEXT"]
