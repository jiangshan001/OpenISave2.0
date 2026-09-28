"""Statement import endpoints.

The file travels as the raw request body (application/octet-stream) and is
parsed in memory; it is never written to disk or kept after parsing.
"""

from __future__ import annotations

from urllib.parse import unquote

from fastapi import APIRouter, Request, Response

from app.api.deps import ImportDep
from app.core.exceptions import ValidationError
from app.importers import IMPORTERS
from app.importers.wechat import MAX_BYTES
from app.schemas.statement_import import (
    ConfirmRequest,
    IgnoredItemOut,
    ImportBatchOut,
    ImportResultOut,
    MappingOut,
    PreviewOut,
    PreviewRequest,
    PreviewRowOut,
    RowErrorOut,
)
from app.services.statement_import_service import ImportPlan

router = APIRouter(prefix="/imports", tags=["imports"])


def _preview_out(plan: ImportPlan) -> PreviewOut:
    parsed = plan.staged.parsed
    start, end = parsed.period
    rows = []
    for row in plan.rows:
        src = row.source
        rows.append(
            PreviewRowOut(
                row_id=row.row_id,
                row_number=src.row_number,
                external_id=src.external_id,
                occurred_at=src.occurred_at.isoformat(),
                transaction_date=src.source_date,
                source_timezone=src.source_timezone,
                source_type=src.source_type,
                direction=src.direction,
                counterparty=src.counterparty,
                product=src.product,
                note=src.note,
                remark=src.remark,
                payment_method=src.payment_method,
                amount_minor=src.amount_minor,
                currency=src.currency,
                source_label=src.source_label,
                dest_label=src.dest_label,
                status=row.status,
                kind=row.kind,
                account_id=row.account_id,
                counter_account_id=row.counter_account_id,
                category_id=row.category_id,
                method=row.method,
                rule_id=row.rule_id if (row.rule_id or 0) > 0 else None,
                rule_name=row.rule_name,
                reason=row.reason,
                issues=row.issues,
                ignore_state=row.ignore_state,
            )
        )
    return PreviewOut(
        token=plan.staged.token,
        source=plan.staged.source,
        file_name=plan.staged.file_name,
        period_start=start,
        period_end=end,
        header_row=parsed.header_row,
        summary=plan.summary,
        labels=plan.labels,
        rows=rows,
        errors=[RowErrorOut(row_number=e.row_number, message=e.message) for e in parsed.errors],
    )


@router.get("/sources")
def list_sources() -> list[dict]:
    return [
        {"source": key, "name": importer.display_name, "currency": importer.currency}
        for key, importer in IMPORTERS.items()
    ]


@router.post("/{source}/parse", response_model=PreviewOut)
async def parse_statement(source: str, request: Request, service: ImportDep) -> PreviewOut:
    declared = int(request.headers.get("content-length") or 0)
    if declared > MAX_BYTES:
        raise ValidationError("The file is larger than 10 MB.")
    content = await request.body()
    file_name = unquote(request.headers.get("x-file-name") or "") or None
    try:
        plan = service.parse(source, content, file_name)
    finally:
        del content  # release the statement bytes as soon as they are parsed
    return _preview_out(plan)


@router.post("/sessions/{token}/preview", response_model=PreviewOut)
def preview(token: str, payload: PreviewRequest, service: ImportDep) -> PreviewOut:
    body = payload.model_dump(mode="json")
    return _preview_out(service.preview(token, body["mappings"], body["overrides"]))


@router.post("/sessions/{token}/confirm", response_model=ImportResultOut, status_code=201)
def confirm(token: str, payload: ConfirmRequest, service: ImportDep) -> ImportResultOut:
    body = payload.model_dump(mode="json")
    batch = service.confirm(
        token,
        body["mappings"],
        body["overrides"],
        remember_mappings=payload.remember_mappings,
        skip_unresolved=payload.skip_unresolved,
    )
    return ImportResultOut(
        **ImportBatchOut.model_validate(batch).model_dump(),
        transaction_ids=service.batch_transactions(batch.id),
    )


@router.delete("/sessions/{token}", status_code=204)
def discard(token: str, service: ImportDep) -> Response:
    service.discard(token)
    return Response(status_code=204)


@router.get("/history", response_model=list[ImportBatchOut])
def history(service: ImportDep) -> list[ImportBatchOut]:
    return [ImportBatchOut.model_validate(batch) for batch in service.history()]


@router.get("/history/{batch_id}/transactions", response_model=list[int])
def batch_transactions(batch_id: int, service: ImportDep) -> list[int]:
    return service.batch_transactions(batch_id)


@router.get("/ignored", response_model=list[IgnoredItemOut])
def list_ignored(service: ImportDep, source: str | None = None) -> list[IgnoredItemOut]:
    return [IgnoredItemOut.model_validate(item) for item in service.list_ignored(source)]


@router.delete("/ignored/{item_id}", status_code=204)
def restore_ignored(item_id: int, service: ImportDep) -> Response:
    """Restore a permanently ignored row: later imports offer it again."""
    service.restore_ignored(item_id)
    return Response(status_code=204)


@router.get("/mappings", response_model=list[MappingOut])
def list_mappings(service: ImportDep, source: str | None = None) -> list[MappingOut]:
    return [MappingOut.model_validate(m) for m in service.list_mappings(source)]


@router.delete("/mappings/{mapping_id}", status_code=204)
def delete_mapping(mapping_id: int, service: ImportDep) -> Response:
    service.delete_mapping(mapping_id)
    return Response(status_code=204)
