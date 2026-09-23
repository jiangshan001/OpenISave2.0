from __future__ import annotations

from fastapi import APIRouter, Response

from app.api.deps import GoalDep
from app.schemas.goal import GoalContributionRead, GoalCreate, GoalRead, GoalUpdate
from app.services.goal_service import GoalProgress

router = APIRouter(prefix="/goals", tags=["goals"])


def _to_read(progress: GoalProgress) -> GoalRead:
    goal = progress.goal
    return GoalRead(
        id=goal.id,
        name=goal.name,
        currency=goal.currency,
        target_amount_minor=goal.target_amount_minor,
        deadline=goal.deadline,
        selection_mode=goal.selection_mode,
        note=goal.note,
        is_active=goal.is_active,
        current_amount_minor=progress.current_amount_minor,
        progress_percent=progress.progress_percent,
        remaining_minor=progress.remaining_minor,
        fx_freshness=progress.fx_freshness,
        account_count=progress.account_count,
        account_ids=[item.account_id for item in progress.contributions],
        contributions=[
            GoalContributionRead.model_validate(item, from_attributes=True)
            for item in progress.contributions
        ],
        unconverted_accounts=progress.unconverted_accounts,
        created_at=goal.created_at,
    )


@router.get("", response_model=list[GoalRead])
def list_goals(service: GoalDep, include_inactive: bool = False) -> list[GoalRead]:
    return [_to_read(item) for item in service.list_progress(include_inactive=include_inactive)]


@router.post("", response_model=GoalRead, status_code=201)
def create_goal(payload: GoalCreate, service: GoalDep) -> GoalRead:
    goal = service.create(payload.model_dump())
    return _to_read(service.progress(goal))


@router.get("/{goal_id}", response_model=GoalRead)
def get_goal(goal_id: int, service: GoalDep) -> GoalRead:
    return _to_read(service.progress(service.get(goal_id)))


@router.patch("/{goal_id}", response_model=GoalRead)
def update_goal(goal_id: int, payload: GoalUpdate, service: GoalDep) -> GoalRead:
    goal = service.update(goal_id, payload.model_dump(exclude_unset=True))
    return _to_read(service.progress(goal))


@router.delete("/{goal_id}", status_code=204, response_class=Response)
def delete_goal(goal_id: int, service: GoalDep) -> Response:
    service.delete(goal_id)
    return Response(status_code=204)
