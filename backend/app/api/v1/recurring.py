from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Query

from app.api.deps import RecurringDep
from app.core.enums import OccurrenceStatus
from app.schemas.recurring import (
    OccurrenceRead,
    ProcessDueResult,
    RecurringRuleCreate,
    RecurringRuleRead,
    RecurringRuleUpdate,
    UpcomingItem,
)

router = APIRouter(prefix="/recurring", tags=["recurring"])


def _today() -> date:
    return date.today()


def _read(service, rule) -> RecurringRuleRead:
    body = RecurringRuleRead.model_validate(rule)
    body.due_count = len(service.due_dates(rule, _today()))
    body.generated_count = service.generated_count(rule.id)
    return body


@router.get("", response_model=list[RecurringRuleRead])
def list_rules(service: RecurringDep, include_archived: bool = False) -> list[RecurringRuleRead]:
    return [_read(service, rule) for rule in service.list(include_archived=include_archived)]


@router.post("", response_model=RecurringRuleRead, status_code=201)
def create_rule(payload: RecurringRuleCreate, service: RecurringDep) -> RecurringRuleRead:
    return _read(service, service.create(payload.model_dump()))


@router.get("/upcoming", response_model=list[UpcomingItem])
def upcoming(
    service: RecurringDep, days: int = Query(default=14, ge=1, le=90)
) -> list[UpcomingItem]:
    return [
        UpcomingItem(
            rule_id=item.rule.id,
            name=item.rule.name,
            transaction_type=item.rule.transaction_type,
            amount_minor=item.rule.amount_minor,
            currency=item.rule.currency,
            account_id=item.rule.account_id,
            destination_account_id=item.rule.destination_account_id,
            category_id=item.rule.category_id,
            occurrence_date=item.occurrence_date,
            days_until=item.days_until,
            is_due=item.is_due,
            mode=item.rule.mode,
        )
        for item in service.upcoming(_today(), days)
    ]


@router.post("/process-due", response_model=ProcessDueResult)
def process_due(service: RecurringDep) -> ProcessDueResult:
    """Create due occurrences of automatic rules. Idempotent; safe on every launch."""
    result = service.process_due(_today())
    return ProcessDueResult(
        generated=[
            OccurrenceRead(
                rule_id=rule_id,
                occurrence_date=on,
                status=OccurrenceStatus.GENERATED.value,
                transaction_id=tx_id,
            )
            for rule_id, on, tx_id in result.generated
        ],
        failed=[
            {"rule_id": rule_id, "occurrence_date": on.isoformat(), "message": message}
            for rule_id, on, message in result.failed
        ],
    )


@router.get("/{rule_id}", response_model=RecurringRuleRead)
def get_rule(rule_id: int, service: RecurringDep) -> RecurringRuleRead:
    return _read(service, service.get(rule_id))


@router.patch("/{rule_id}", response_model=RecurringRuleRead)
def update_rule(
    rule_id: int, payload: RecurringRuleUpdate, service: RecurringDep
) -> RecurringRuleRead:
    return _read(service, service.update(rule_id, payload.model_dump(exclude_unset=True)))


@router.post("/{rule_id}/pause", response_model=RecurringRuleRead)
def pause_rule(rule_id: int, service: RecurringDep) -> RecurringRuleRead:
    return _read(service, service.pause(rule_id))


@router.post("/{rule_id}/resume", response_model=RecurringRuleRead)
def resume_rule(rule_id: int, service: RecurringDep) -> RecurringRuleRead:
    return _read(service, service.resume(rule_id, _today()))


@router.post("/{rule_id}/archive", response_model=RecurringRuleRead)
def archive_rule(rule_id: int, service: RecurringDep) -> RecurringRuleRead:
    return _read(service, service.archive(rule_id))


@router.post("/{rule_id}/occurrences/{occurrence_date}/generate", response_model=OccurrenceRead)
def generate_occurrence(
    rule_id: int, occurrence_date: date, service: RecurringDep
) -> OccurrenceRead:
    return OccurrenceRead.model_validate(service.generate(rule_id, occurrence_date, _today()))


@router.post("/{rule_id}/occurrences/{occurrence_date}/skip", response_model=OccurrenceRead)
def skip_occurrence(rule_id: int, occurrence_date: date, service: RecurringDep) -> OccurrenceRead:
    return OccurrenceRead.model_validate(service.skip(rule_id, occurrence_date, _today()))
