"""Read-only Builder resume state composition."""

from __future__ import annotations

from dataclasses import dataclass

from memory.builder.delivery_cursor import BuilderDeliveryCursor, get_delivery_cursor
from memory.builder.method_adoption import get_adopted_method
from memory.builder.workbench import WorkbenchSnapshot, get_workbench_snapshot
from memory.storage.store import Store

NO_ACTIVE_ITEM_ACTIONS = (
    "inspect_roadmap",
    "pull_candidate_if_known",
    "inspect_method",
)
ACTIVE_ITEM_ACTIONS = (
    "prepare_active_item",
    "inspect_roadmap",
    "inspect_method",
)
PENDING_CONFIRMATION_ACTIONS = ("answer_pending_confirmation", "inspect_method")


@dataclass(frozen=True)
class BuilderResumeState:
    journey: str
    adopted_method: str | None
    cursor: BuilderDeliveryCursor | None
    resumable: bool
    reason: str | None
    allowed_next_actions: tuple[str, ...]
    refinement: WorkbenchSnapshot | None = None


def read_builder_resume_state(
    store: Store,
    journey: str,
    *,
    include_refinement: bool = True,
) -> BuilderResumeState:
    """Compose Builder resume state, optionally excluding compatibility-only Refinement."""
    normalized_journey = _normalize_journey(journey)
    adopted_method = get_adopted_method(store, normalized_journey)
    if not adopted_method:
        return BuilderResumeState(
            journey=normalized_journey,
            adopted_method=None,
            cursor=None,
            resumable=False,
            reason="adoption_required",
            allowed_next_actions=("adopt_method", "inspect_method"),
            refinement=(
                get_workbench_snapshot(store, normalized_journey) if include_refinement else None
            ),
        )

    cursor = get_delivery_cursor(store, normalized_journey)
    if cursor is None:
        return BuilderResumeState(
            journey=normalized_journey,
            adopted_method=adopted_method,
            cursor=None,
            resumable=False,
            reason="cursor_sync_required",
            allowed_next_actions=("sync_cursor", "inspect_method"),
            refinement=(
                get_workbench_snapshot(store, normalized_journey) if include_refinement else None
            ),
        )

    refinement = get_workbench_snapshot(store, normalized_journey) if include_refinement else None
    allowed_next_actions: tuple[str, ...]
    if cursor.pending_confirmation:
        allowed_next_actions = PENDING_CONFIRMATION_ACTIONS
    elif cursor.active_item:
        allowed_next_actions = ACTIVE_ITEM_ACTIONS
    else:
        allowed_next_actions = NO_ACTIVE_ITEM_ACTIONS
    return BuilderResumeState(
        journey=normalized_journey,
        adopted_method=adopted_method,
        cursor=cursor,
        resumable=True,
        reason=None,
        allowed_next_actions=allowed_next_actions,
        refinement=refinement,
    )


def _normalize_journey(journey: str) -> str:
    normalized = journey.strip() if isinstance(journey, str) else ""
    if not normalized:
        raise ValueError("journey must not be empty")
    return normalized
