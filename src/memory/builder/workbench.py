"""Builder-domain helpers for Ariad Refinement Workbench state."""

from __future__ import annotations

from dataclasses import dataclass

from memory.models import _now
from memory.storage.builder_workbench import ChangeRequestRecord, RefinementStoryRecord
from memory.storage.store import Store


@dataclass(frozen=True)
class RefinementStoryOverview:
    story: RefinementStoryRecord
    change_requests: tuple[ChangeRequestRecord, ...]


@dataclass(frozen=True)
class RefinementFlowEvent:
    journey: str
    event: str
    refinement_story: RefinementStoryRecord
    change_request: ChangeRequestRecord | None
    previous_status: str | None
    new_status: str | None
    detail: str | None
    active_change_request_id: str | None


@dataclass(frozen=True)
class WorkbenchSnapshot:
    storage_state: str
    active_refinement_story: RefinementStoryRecord | None
    active_change_request: ChangeRequestRecord | None
    refinement_story_count: int
    change_request_count: int
    unassigned_change_request_count: int


def create_refinement_story(
    store: Store,
    *,
    journey: str,
    title: str,
    description: str | None = None,
    status: str = "draft",
    source: str = "manual",
    provenance: str | None = None,
) -> RefinementStoryRecord:
    """Create a durable Refinement Story without starting Refinement flow."""
    return store.create_refinement_story(
        journey=journey,
        title=title,
        description=description,
        status=status,
        source=source,
        provenance=provenance,
    )


def capture_change_request(
    store: Store,
    *,
    journey: str,
    title: str,
    body: str,
    refinement_story_id: str | None = None,
    status: str = "captured",
    source: str = "manual",
    provenance: str | None = None,
) -> ChangeRequestRecord:
    """Capture a durable Change Request without activating a CR cycle."""
    return store.create_change_request(
        journey=journey,
        title=title,
        body=body,
        refinement_story_id=refinement_story_id,
        status=status,
        source=source,
        provenance=provenance,
    )


def attach_change_request_to_story(
    store: Store,
    *,
    change_request_id: str,
    refinement_story_id: str,
) -> ChangeRequestRecord:
    """Associate an existing Change Request to a Refinement Story."""
    return store.attach_change_request_to_story(change_request_id, refinement_story_id)


def pull_refinement_story(
    store: Store, *, journey: str, refinement_story_id: str
) -> RefinementStoryOverview:
    """Pull a Refinement Story into active Refinement Work without selecting a CR."""
    overview = get_refinement_story_overview(
        store,
        journey=journey,
        refinement_story_id=refinement_story_id,
    )
    if overview.story.status != "active":
        store.update_refinement_story_status(overview.story.id, "active", pulled_at=_now())
    store.set_refinement_cursor(
        journey=journey,
        active_refinement_story_id=overview.story.id,
        active_change_request_id=None,
        last_refinement_event="refinement_story_pulled",
    )
    return get_refinement_story_overview(
        store,
        journey=journey,
        refinement_story_id=refinement_story_id,
    )


def select_change_request(
    store: Store, *, journey: str, change_request_id: str
) -> RefinementFlowEvent:
    """Select a CR inside the active RS without implementing it."""
    story, cr = _require_active_story_and_cr(store, journey, change_request_id)
    _require_status(cr.status, {"captured"}, "select")
    updated = store.update_change_request_status(cr.id, "active")
    store.set_refinement_cursor(
        journey=journey,
        active_refinement_story_id=story.id,
        active_change_request_id=updated.id,
        last_refinement_event="change_request_selected",
    )
    return _flow_event(journey, "change_request_selected", story, updated, cr.status, None)


def confirm_change_request(
    store: Store, *, journey: str, change_request_id: str
) -> RefinementFlowEvent:
    story, cr = _require_active_story_and_cr(store, journey, change_request_id)
    _require_active_cr(store, journey, cr.id)
    _require_status(cr.status, {"active"}, "confirm")
    store.set_refinement_cursor(
        journey=journey,
        active_refinement_story_id=story.id,
        active_change_request_id=cr.id,
        last_refinement_event="change_request_confirmed",
    )
    return _flow_event(journey, "change_request_confirmed", story, cr, cr.status, None)


def plan_change_request(
    store: Store, *, journey: str, change_request_id: str, summary: str
) -> RefinementFlowEvent:
    story, cr = _require_active_story_and_cr(store, journey, change_request_id)
    _require_active_cr(store, journey, cr.id)
    _require_status(cr.status, {"active"}, "plan")
    updated = store.update_change_request_status(cr.id, "planned", outcome_notes=summary)
    store.set_refinement_cursor(
        journey=journey,
        active_refinement_story_id=story.id,
        active_change_request_id=updated.id,
        last_refinement_event="change_request_planned",
    )
    return _flow_event(journey, "change_request_planned", story, updated, cr.status, summary)


def mark_change_request_implemented(
    store: Store, *, journey: str, change_request_id: str, evidence: str
) -> RefinementFlowEvent:
    story, cr = _require_active_story_and_cr(store, journey, change_request_id)
    _require_active_cr(store, journey, cr.id)
    _require_status(cr.status, {"planned"}, "mark implemented")
    updated = store.update_change_request_status(cr.id, "implemented", outcome_notes=evidence)
    store.set_refinement_cursor(
        journey=journey,
        active_refinement_story_id=story.id,
        active_change_request_id=updated.id,
        last_refinement_event="change_request_implemented",
    )
    return _flow_event(journey, "change_request_implemented", story, updated, cr.status, evidence)


def validate_change_request(
    store: Store, *, journey: str, change_request_id: str, evidence: str
) -> RefinementFlowEvent:
    story, cr = _require_active_story_and_cr(store, journey, change_request_id)
    _require_active_cr(store, journey, cr.id)
    _require_status(cr.status, {"implemented"}, "validate")
    updated = store.update_change_request_status(cr.id, "validated", outcome_notes=evidence)
    store.set_refinement_cursor(
        journey=journey,
        active_refinement_story_id=story.id,
        active_change_request_id=updated.id,
        last_refinement_event="change_request_validated",
    )
    return _flow_event(journey, "change_request_validated", story, updated, cr.status, evidence)


def complete_change_request(
    store: Store, *, journey: str, change_request_id: str, notes: str
) -> RefinementFlowEvent:
    story, cr = _require_active_story_and_cr(store, journey, change_request_id)
    _require_active_cr(store, journey, cr.id)
    _require_status(cr.status, {"validated"}, "done")
    updated = store.update_change_request_status(
        cr.id, "done", outcome_notes=notes, completed_at=_now()
    )
    store.set_refinement_cursor(
        journey=journey,
        active_refinement_story_id=story.id,
        active_change_request_id=None,
        last_refinement_event="change_request_done",
    )
    return _flow_event(journey, "change_request_done", story, updated, cr.status, notes)


def review_refinement_story(
    store: Store, *, journey: str, refinement_story_id: str, summary: str
) -> RefinementFlowEvent:
    overview = get_refinement_story_overview(
        store, journey=journey, refinement_story_id=refinement_story_id
    )
    _require_status(overview.story.status, {"active"}, "review")
    store.set_refinement_cursor(
        journey=journey,
        active_refinement_story_id=overview.story.id,
        active_change_request_id=None,
        last_refinement_event="refinement_story_reviewed",
    )
    return _flow_event(
        journey, "refinement_story_reviewed", overview.story, None, overview.story.status, summary
    )


def coherence_refinement_story(
    store: Store, *, journey: str, refinement_story_id: str, summary: str
) -> RefinementFlowEvent:
    overview = get_refinement_story_overview(
        store, journey=journey, refinement_story_id=refinement_story_id
    )
    cursor = store.get_refinement_cursor(journey)
    if cursor is None or cursor.last_refinement_event != "refinement_story_reviewed":
        raise ValueError("coherence requires refinement story review first")
    store.set_refinement_cursor(
        journey=journey,
        active_refinement_story_id=overview.story.id,
        active_change_request_id=None,
        last_refinement_event="refinement_story_coherent",
    )
    return _flow_event(
        journey, "refinement_story_coherent", overview.story, None, overview.story.status, summary
    )


def close_refinement_story(
    store: Store, *, journey: str, refinement_story_id: str, summary: str
) -> RefinementFlowEvent:
    overview = get_refinement_story_overview(
        store, journey=journey, refinement_story_id=refinement_story_id
    )
    cursor = store.get_refinement_cursor(journey)
    if cursor is None or cursor.last_refinement_event != "refinement_story_coherent":
        raise ValueError("close requires refinement story coherence first")
    updated_story = store.update_refinement_story_status(
        overview.story.id, "closed", closed_at=_now()
    )
    store.set_refinement_cursor(
        journey=journey,
        active_refinement_story_id=None,
        active_change_request_id=None,
        last_refinement_event="refinement_story_closed",
    )
    return _flow_event(
        journey, "refinement_story_closed", updated_story, None, overview.story.status, summary
    )


def get_active_refinement_story_overview(
    store: Store, journey: str
) -> RefinementStoryOverview | None:
    """Return the active Refinement Story overview for a journey, if any."""
    cursor = store.get_refinement_cursor(journey)
    if cursor is None or cursor.active_refinement_story_id is None:
        return None
    return get_refinement_story_overview(
        store,
        journey=journey,
        refinement_story_id=cursor.active_refinement_story_id,
    )


def get_refinement_story_overview(
    store: Store, *, journey: str, refinement_story_id: str
) -> RefinementStoryOverview:
    """Return one Refinement Story with its ordered Change Requests."""
    story = store.get_refinement_story(refinement_story_id)
    if story is None:
        raise ValueError("refinement_story_id does not exist")
    if story.journey != journey:
        raise ValueError("refinement_story_id belongs to a different journey")
    return RefinementStoryOverview(
        story=story,
        change_requests=store.list_change_requests(
            journey,
            refinement_story_id=refinement_story_id,
        ),
    )


def _require_active_story_and_cr(
    store: Store, journey: str, change_request_id: str
) -> tuple[RefinementStoryRecord, ChangeRequestRecord]:
    cursor = store.get_refinement_cursor(journey)
    if cursor is None or cursor.active_refinement_story_id is None:
        raise ValueError("active Refinement Story is required")
    story = store.get_refinement_story(cursor.active_refinement_story_id)
    cr = store.get_change_request(change_request_id)
    if story is None:
        raise ValueError("active Refinement Story does not exist")
    if cr is None:
        raise ValueError("change_request_id does not exist")
    if cr.journey != journey:
        raise ValueError("change_request_id belongs to a different journey")
    if cr.refinement_story_id != story.id:
        raise ValueError("Change Request does not belong to the active Refinement Story")
    return story, cr


def _require_active_cr(store: Store, journey: str, change_request_id: str) -> None:
    cursor = store.get_refinement_cursor(journey)
    if cursor is None or cursor.active_change_request_id != change_request_id:
        raise ValueError("active Change Request is required")


def _require_status(actual: str, allowed: set[str], action: str) -> None:
    if actual not in allowed:
        expected = ", ".join(sorted(allowed))
        raise ValueError(f"cannot {action} from status '{actual}'; expected {expected}")


def _flow_event(
    journey: str,
    event: str,
    story: RefinementStoryRecord,
    cr: ChangeRequestRecord | None,
    previous_status: str | None,
    detail: str | None,
) -> RefinementFlowEvent:
    return RefinementFlowEvent(
        journey=journey,
        event=event,
        refinement_story=story,
        change_request=cr,
        previous_status=previous_status,
        new_status=cr.status if cr is not None else story.status,
        detail=detail,
        active_change_request_id=cr.id if cr is not None and cr.status != "done" else None,
    )


def get_workbench_snapshot(store: Store, journey: str) -> WorkbenchSnapshot:
    """Return compact Workbench state for Builder Home rendering."""
    stories = store.list_refinement_stories(journey)
    change_requests = store.list_change_requests(journey)
    unassigned = tuple(cr for cr in change_requests if cr.refinement_story_id is None)
    cursor = store.get_refinement_cursor(journey)
    active_story = None
    active_change_request = None
    if cursor and cursor.active_refinement_story_id:
        active_story = store.get_refinement_story(cursor.active_refinement_story_id)
    if cursor and cursor.active_change_request_id:
        active_change_request = store.get_change_request(cursor.active_change_request_id)
    return WorkbenchSnapshot(
        storage_state="implemented",
        active_refinement_story=active_story,
        active_change_request=active_change_request,
        refinement_story_count=len(stories),
        change_request_count=len(change_requests),
        unassigned_change_request_count=len(unassigned),
    )
