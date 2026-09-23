from __future__ import annotations

from fastapi import APIRouter, Query

from app.api.deps import AccountDep, LedgerDep
from app.core.enums import ACCOUNT_GROUPS, AccountType
from app.core.money import BASE_CURRENCY
from app.schemas.account import (
    ACCOUNT_PURPOSE_LABELS,
    AccountBalanceRead,
    AccountCreate,
    AccountPurposeOption,
    AccountRead,
    AccountUpdate,
)
from app.schemas.transaction import TransactionRead

router = APIRouter(prefix="/accounts", tags=["accounts"])


def _to_balance_read(service: AccountDep, item) -> AccountBalanceRead:
    payload = AccountRead.model_validate(item.account).model_dump()
    payload.update(
        balance_minor=item.balance_minor,
        base_balance_minor=item.base_balance_minor,
        base_currency=BASE_CURRENCY,
        fx_rate=item.fx_rate,
        fx_freshness=item.fx_freshness,
        group=ACCOUNT_GROUPS[AccountType(item.account.account_type)],
        is_liability=service.is_liability_account(item.account),
    )
    return AccountBalanceRead.model_validate(payload)


@router.get("", response_model=list[AccountBalanceRead])
def list_accounts(
    service: AccountDep, include_archived: bool = Query(default=False)
) -> list[AccountBalanceRead]:
    return [
        _to_balance_read(service, item)
        for item in service.balances(include_archived=include_archived)
    ]


@router.get("/purposes", response_model=list[AccountPurposeOption])
def list_purposes() -> list[AccountPurposeOption]:
    return [
        AccountPurposeOption(value=value, label=label)
        for value, label in ACCOUNT_PURPOSE_LABELS.items()
    ]


@router.get("/types", response_model=list[str])
def list_types() -> list[str]:
    return [item.value for item in AccountType]


@router.post("", response_model=AccountRead, status_code=201)
def create_account(payload: AccountCreate, service: AccountDep) -> AccountRead:
    account = service.create(payload.model_dump())
    return AccountRead.model_validate(account)


@router.get("/{account_id}", response_model=AccountBalanceRead)
def get_account(account_id: int, service: AccountDep) -> AccountBalanceRead:
    return _to_balance_read(service, service.balance_for(account_id))


@router.patch("/{account_id}", response_model=AccountRead)
def update_account(account_id: int, payload: AccountUpdate, service: AccountDep) -> AccountRead:
    account = service.update(account_id, payload.model_dump(exclude_unset=True))
    return AccountRead.model_validate(account)


@router.post("/{account_id}/archive", response_model=AccountRead)
def archive_account(account_id: int, service: AccountDep, archived: bool = True) -> AccountRead:
    return AccountRead.model_validate(service.archive(account_id, archived))


@router.get("/{account_id}/transactions", response_model=list[TransactionRead])
def account_transactions(
    account_id: int,
    service: AccountDep,
    ledger: LedgerDep,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> list[TransactionRead]:
    service.get(account_id)
    rows = ledger.list(account_id=account_id, limit=limit, offset=offset)
    return [TransactionRead.model_validate(row) for row in rows]
