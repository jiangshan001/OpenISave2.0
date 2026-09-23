from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Query

from app.api.deps import LedgerDep
from app.core.enums import TransactionType
from app.schemas.common import Page
from app.schemas.transaction import (
    TransactionCreate,
    TransactionRead,
    TransactionUpdate,
    TransferCreate,
)

router = APIRouter(tags=["transactions"])


@router.get("/transactions", response_model=Page[TransactionRead])
def list_transactions(
    ledger: LedgerDep,
    account_id: int | None = None,
    type: TransactionType | None = None,
    category_id: int | None = None,
    currency: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    search: str | None = None,
    include_voided: bool = False,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> Page[TransactionRead]:
    filters = {
        "account_id": account_id,
        "transaction_type": type.value if type else None,
        "category_id": category_id,
        "currency": currency.upper() if currency else None,
        "date_from": date_from,
        "date_to": date_to,
        "search": search,
        "include_voided": include_voided,
    }
    rows = ledger.list(limit=limit, offset=offset, **filters)
    return Page[TransactionRead](
        items=[TransactionRead.model_validate(row) for row in rows],
        total=ledger.count(**filters),
        limit=limit,
        offset=offset,
    )


@router.post("/transactions", response_model=TransactionRead, status_code=201)
def create_transaction(payload: TransactionCreate, ledger: LedgerDep) -> TransactionRead:
    transaction = ledger.create_transaction(payload.model_dump())
    return TransactionRead.model_validate(transaction)


@router.get("/transactions/{transaction_id}", response_model=TransactionRead)
def get_transaction(transaction_id: int, ledger: LedgerDep) -> TransactionRead:
    return TransactionRead.model_validate(ledger.get(transaction_id))


@router.patch("/transactions/{transaction_id}", response_model=TransactionRead)
def update_transaction(
    transaction_id: int, payload: TransactionUpdate, ledger: LedgerDep
) -> TransactionRead:
    updated = ledger.update_transaction(transaction_id, payload.model_dump(exclude_unset=True))
    return TransactionRead.model_validate(updated)


@router.post("/transactions/{transaction_id}/void", response_model=TransactionRead)
def void_transaction(transaction_id: int, ledger: LedgerDep) -> TransactionRead:
    return TransactionRead.model_validate(ledger.void(transaction_id))


@router.delete("/transactions/{transaction_id}", response_model=TransactionRead)
def delete_transaction(transaction_id: int, ledger: LedgerDep) -> TransactionRead:
    """Deletion is a void: financial history is preserved for auditability."""
    return TransactionRead.model_validate(ledger.void(transaction_id))


@router.post("/transfers", response_model=TransactionRead, status_code=201)
def create_transfer(payload: TransferCreate, ledger: LedgerDep) -> TransactionRead:
    transfer = ledger.create_transfer(payload.model_dump())
    return TransactionRead.model_validate(transfer)
