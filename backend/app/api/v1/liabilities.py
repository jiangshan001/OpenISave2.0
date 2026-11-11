from __future__ import annotations

from fastapi import APIRouter, Query, Response
from sqlalchemy import func, select

from app.api.deps import LedgerDep, LiabilityDep
from app.schemas.asset import (
    LiabilityCreate,
    LiabilityRead,
    LiabilityReceiptCreate,
    LiabilityRepayment,
    LiabilityUpdate,
)
from app.schemas.transaction import TransactionRead
from app.schemas.common import Page
from app.models.transaction import Transaction
from app.services.liability_service import LiabilityView

router = APIRouter(prefix="/liabilities", tags=["liabilities"])


def _to_read(view: LiabilityView) -> LiabilityRead:
    liability = view.liability
    return LiabilityRead(
        id=liability.id,
        name=liability.name,
        liability_type=liability.liability_type,
        account_id=view.account_id,
        account_name=view.account_name,
        currency=view.outstanding_currency,
        original_amount_minor=liability.original_amount_minor,
        outstanding_minor=view.outstanding_minor,
        base_outstanding_minor=view.base_outstanding_minor,
        repaid_minor=view.repaid_minor,
        repaid_percent=view.repaid_percent,
        fx_freshness=view.fx_freshness,
        start_date=liability.start_date,
        end_date=liability.end_date,
        interest_rate_percent=liability.interest_rate_percent,
        lender=liability.lender,
        note=liability.note,
        linked_asset_names=view.linked_asset_names,
        receipt_status=view.receipt_status,
        created_at=liability.created_at,
    )


@router.get("", response_model=list[LiabilityRead])
def list_liabilities(service: LiabilityDep) -> list[LiabilityRead]:
    return [_to_read(view) for view in service.list_views()]


@router.post("", response_model=LiabilityRead, status_code=201)
def create_liability(payload: LiabilityCreate, service: LiabilityDep) -> LiabilityRead:
    liability = service.create(payload.model_dump())
    return _to_read(service.view(liability))


@router.get("/{liability_id}", response_model=LiabilityRead)
def get_liability(liability_id: int, service: LiabilityDep) -> LiabilityRead:
    return _to_read(service.view(service.get(liability_id)))


@router.patch("/{liability_id}", response_model=LiabilityRead)
def update_liability(
    liability_id: int, payload: LiabilityUpdate, service: LiabilityDep
) -> LiabilityRead:
    liability = service.update(liability_id, payload.model_dump(exclude_unset=True))
    return _to_read(service.view(liability))


@router.post("/{liability_id}/repayments", response_model=TransactionRead, status_code=201)
def record_repayment(
    liability_id: int,
    payload: LiabilityRepayment,
    service: LiabilityDep,
    ledger: LedgerDep,
) -> TransactionRead:
    """A repayment is an ordinary transfer from cash into the debt account."""
    transfer = service.record_repayment(liability_id, payload.model_dump())
    return TransactionRead.model_validate(ledger.create_transfer(transfer))


@router.get("/{liability_id}/repayments", response_model=Page[TransactionRead])
def list_repayments(
    liability_id: int, service: LiabilityDep,
    limit: int = Query(default=25, ge=1, le=100), offset: int = Query(default=0, ge=0),
) -> Page[TransactionRead]:
    liability = service.get(liability_id)
    conditions = (Transaction.type == "transfer", Transaction.to_account_id == liability.account_id,
                  Transaction.is_voided.is_(False))
    count = int(service.session.scalar(select(func.count(Transaction.id)).where(*conditions)) or 0)
    rows = service.session.scalars(select(Transaction).where(*conditions)
        .order_by(Transaction.transaction_date.desc(), Transaction.id.desc()).limit(limit).offset(offset))
    return Page[TransactionRead](items=[TransactionRead.model_validate(row) for row in rows],
                                 total=count, limit=limit, offset=offset)


@router.post("/{liability_id}/receipt", response_model=TransactionRead, status_code=201)
def record_legacy_receipt(
    liability_id: int, payload: LiabilityReceiptCreate, service: LiabilityDep
) -> TransactionRead:
    return TransactionRead.model_validate(service.record_legacy_receipt(liability_id, payload.model_dump()))


@router.delete("/{liability_id}", status_code=204, response_class=Response)
def delete_liability(liability_id: int, service: LiabilityDep) -> Response:
    service.delete(liability_id)
    return Response(status_code=204)
