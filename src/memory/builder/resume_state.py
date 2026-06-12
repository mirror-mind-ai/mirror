"""Read-only Builder resume state composition."""

from __future__ import annotations

from dataclasses import dataclass

from memory.builder.delivery_cursor import BuilderDeliveryCursor, get_delivery_cursor
from memory.builder.method_adoption import get_adopted_method
from memory.storage.store import Store

DEFAULT_ALLOWED_NEXT_ACTIONS = (
    "inspect_method",
    "prepare_templates",
    "sync_cursor",
    "pull_next_story",
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


def read_builder_resume_state(store: Store, journey: str) -> BuilderResumeState:
    """Compose adopted method and delivery cursor state for Builder resume."""
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
        )

    allowed_next_actions = (
        PENDING_CONFIRMATION_ACTIONS
        if cursor.pending_confirmation
        else DEFAULT_ALLOWED_NEXT_ACTIONS
    )
    return BuilderResumeState(
        journey=normalized_journey,
        adopted_method=adopted_method,
        cursor=cursor,
        resumable=True,
        reason=None,
        allowed_next_actions=allowed_next_actions,
    )


def _normalize_journey(journey: str) -> str:
    normalized = journey.strip() if isinstance(journey, str) else ""
    if not normalized:
        raise ValueError("journey must not be empty")
    return normalized
