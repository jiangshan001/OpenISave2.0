from __future__ import annotations

from fastapi import APIRouter, Response

from app.api.deps import RulesDep
from app.schemas.statement_import import ReorderIn, RuleIn, RuleOut, RuleUpdate
from app.services.categorisation_service import RuleSpec

router = APIRouter(prefix="/categorisation-rules", tags=["categorisation"])


def _out(rule) -> RuleOut:
    body = RuleOut.model_validate(rule)
    body.explanation = RuleSpec.of(rule).explain()
    return body


@router.get("", response_model=list[RuleOut])
def list_rules(service: RulesDep) -> list[RuleOut]:
    return [_out(rule) for rule in service.list()]


@router.post("", response_model=RuleOut, status_code=201)
def create_rule(payload: RuleIn, service: RulesDep) -> RuleOut:
    return _out(service.create(payload.model_dump(mode="json")))


@router.patch("/{rule_id}", response_model=RuleOut)
def update_rule(rule_id: int, payload: RuleUpdate, service: RulesDep) -> RuleOut:
    return _out(service.update(rule_id, payload.model_dump(mode="json", exclude_unset=True)))


@router.delete("/{rule_id}", status_code=204)
def delete_rule(rule_id: int, service: RulesDep) -> Response:
    service.delete(rule_id)
    return Response(status_code=204)


@router.post("/reorder", response_model=list[RuleOut])
def reorder(payload: ReorderIn, service: RulesDep) -> list[RuleOut]:
    return [_out(rule) for rule in service.reorder(payload.rule_ids)]
