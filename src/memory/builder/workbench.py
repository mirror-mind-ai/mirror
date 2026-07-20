"""Builder-domain helpers for Ariad Refinement Workbench state."""

from __future__ import annotations

from dataclasses import dataclass

from memory.models import _now
from memory.storage.builder_workbench import (
    TERMINAL_CHANGE_REQUEST_STATUSES,
    ChangeRequestRecord,
    RefinementStoryRecord,
)
from memory.storage.store import Store


@dataclass(frozen=True)
class RefinementStoryOverview:
    story: RefinementStoryRecord
    change_requests: tuple[ChangeRequestRecord, ...]
    active_change_request: ChangeRequestRecord | None = None
    last_refinement_event: str | None = None


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
    last_refinement_event: str | None
    refinement_story_count: int
    change_request_count: int
    unassigned_change_request_count: int


@dataclass(frozen=True)
class ChangeRequestDiscard:
    journey: str
    change_request: ChangeRequestRecord
    refinement_story: RefinementStoryRecord | None
    reason: str


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


def discard_change_request(
    store: Store,
    *,
    journey: str,
    change_request_id: str,
    reason: str,
) -> ChangeRequestDiscard:
    """Delete an accidental captured CR before it enters the active cycle."""
    normalized_reason = reason.strip()
    if not normalized_reason:
        raise ValueError("discard reason is required")
    cr = store.get_change_request(change_request_id)
    if cr is None:
        raise ValueError("change_request_id does not exist")
    if cr.journey != journey:
        raise ValueError("change_request_id belongs to a different journey")
    if cr.status != "captured":
        raise ValueError("only captured Change Requests can be discarded")
    cursor = store.get_refinement_cursor(journey)
    if cursor is not None and cursor.active_change_request_id == cr.id:
        raise ValueError("active Change Request cannot be discarded")
    story = store.get_refinement_story(cr.refinement_story_id) if cr.refinement_story_id else None
    store.delete_change_request(cr.id)
    return ChangeRequestDiscard(
        journey=journey,
        change_request=cr,
        refinement_story=story,
        reason=normalized_reason,
    )


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
    store: Store,
    *,
    journey: str,
    change_request_id: str,
    evidence: str,
    plan: str | None = None,
) -> RefinementFlowEvent:
    story, cr = _require_active_story_and_cr(store, journey, change_request_id)
    _require_active_cr(store, journey, cr.id)
    _require_status(cr.status, {"active", "planned"}, "mark implemented")
    if cr.status == "active":
        _require_confirmed_cr(store, journey, cr.id)
    detail = _implementation_detail(plan=plan, evidence=evidence)
    updated = store.update_change_request_status(cr.id, "implemented", outcome_notes=detail)
    store.set_refinement_cursor(
        journey=journey,
        active_refinement_story_id=story.id,
        active_change_request_id=updated.id,
        last_refinement_event="change_request_implemented",
    )
    return _flow_event(journey, "change_request_implemented", story, updated, cr.status, detail)


def validate_change_request(
    store: Store,
    *,
    journey: str,
    change_request_id: str,
    evidence: str,
    close: bool = False,
    notes: str | None = None,
) -> RefinementFlowEvent:
    story, cr = _require_active_story_and_cr(store, journey, change_request_id)
    _require_active_cr(store, journey, cr.id)
    _require_status(cr.status, {"implemented"}, "validate")
    if close:
        detail = _validation_closure_detail(evidence=evidence, notes=notes)
        updated = store.update_change_request_status(
            cr.id,
            "done",
            outcome_notes=detail,
            completed_at=_now(),
        )
        store.set_refinement_cursor(
            journey=journey,
            active_refinement_story_id=story.id,
            active_change_request_id=None,
            last_refinement_event="change_request_done",
        )
        return _flow_event(journey, "change_request_done", story, updated, cr.status, detail)
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


def park_change_request(
    store: Store,
    *,
    journey: str,
    change_request_id: str,
    reason: str,
    revisit_trigger: str,
) -> RefinementFlowEvent:
    """Defer a Change Request as parked, keeping the record with a revisit trigger."""
    story, cr = _require_terminable_cr(store, journey, change_request_id, action="park")
    normalized_reason = _require_text(reason, "reason")
    normalized_trigger = _require_text(revisit_trigger, "revisit_trigger")
    detail = _terminal_detail(
        f"Parked: {normalized_reason}\nRevisit trigger: {normalized_trigger}",
        cr.outcome_notes,
    )
    updated = store.update_change_request_status(cr.id, "parked", outcome_notes=detail)
    _clear_active_cr_if_current(
        store, journey=journey, change_request_id=cr.id, event="change_request_parked"
    )
    return _flow_event(journey, "change_request_parked", story, updated, cr.status, detail)


def reject_change_request(
    store: Store, *, journey: str, change_request_id: str, reason: str
) -> RefinementFlowEvent:
    """Decide against a Change Request, keeping the record with a rejection reason.

    Contrast with ``discard_change_request``: discard deletes an accidental
    capture; reject is a deliberate no that keeps the record auditable.
    """
    story, cr = _require_terminable_cr(store, journey, change_request_id, action="reject")
    normalized_reason = _require_text(reason, "reason")
    detail = _terminal_detail(f"Rejected: {normalized_reason}", cr.outcome_notes)
    updated = store.update_change_request_status(cr.id, "rejected", outcome_notes=detail)
    _clear_active_cr_if_current(
        store, journey=journey, change_request_id=cr.id, event="change_request_rejected"
    )
    return _flow_event(journey, "change_request_rejected", story, updated, cr.status, detail)


def promote_change_request(
    store: Store,
    *,
    journey: str,
    change_request_id: str,
    target: str,
    notes: str | None = None,
) -> RefinementFlowEvent:
    """Promote a Change Request out of Refinement Work to a Delivery target.

    Minimal by design: records the target and terminal state only. Does not
    create or mutate a roadmap item — Ariad is not an autonomous project manager.
    """
    story, cr = _require_terminable_cr(store, journey, change_request_id, action="promote")
    normalized_target = _require_text(target, "target")
    body = f"Promoted to: {normalized_target}"
    normalized_notes = notes.strip() if notes else ""
    if normalized_notes:
        body += f"\nNotes: {normalized_notes}"
    detail = _terminal_detail(body, cr.outcome_notes)
    updated = store.update_change_request_status(cr.id, "promoted", outcome_notes=detail)
    _clear_active_cr_if_current(
        store, journey=journey, change_request_id=cr.id, event="change_request_promoted"
    )
    return _flow_event(journey, "change_request_promoted", story, updated, cr.status, detail)


def park_refinement_story(
    store: Store,
    *,
    journey: str,
    refinement_story_id: str,
    reason: str,
    revisit_trigger: str,
) -> RefinementFlowEvent:
    """Defer the active Refinement Story as parked, without requiring closable CRs.

    Symmetric with the CR-level park: an RS can be deliberately punted as a
    whole ("not now") without forcing each attached CR to reach a terminal
    state first.
    """
    overview = get_refinement_story_overview(
        store, journey=journey, refinement_story_id=refinement_story_id
    )
    _require_active_refinement_story(store, journey, overview.story.id, "park")
    normalized_reason = _require_text(reason, "reason")
    normalized_trigger = _require_text(revisit_trigger, "revisit_trigger")
    detail = f"Parked: {normalized_reason}\nRevisit trigger: {normalized_trigger}"
    updated_story = store.update_refinement_story_status(overview.story.id, "parked")
    store.set_refinement_cursor(
        journey=journey,
        active_refinement_story_id=None,
        active_change_request_id=None,
        last_refinement_event="refinement_story_parked",
    )
    return _flow_event(
        journey, "refinement_story_parked", updated_story, None, overview.story.status, detail
    )


def review_refinement_story(
    store: Store, *, journey: str, refinement_story_id: str, summary: str
) -> RefinementFlowEvent:
    overview = get_refinement_story_overview(
        store, journey=journey, refinement_story_id=refinement_story_id
    )
    _require_active_refinement_story(store, journey, overview.story.id, "review")
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
    _require_active_refinement_story(store, journey, overview.story.id, "coherence")
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
    _require_active_refinement_story(store, journey, overview.story.id, "close")
    cursor = store.get_refinement_cursor(journey)
    if cursor is None or cursor.last_refinement_event != "refinement_story_coherent":
        raise ValueError("close requires refinement story coherence first")
    _require_closable_change_requests(overview.change_requests)
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


def recommend_next_change_request(
    store: Store, *, journey: str, refinement_story_id: str
) -> ChangeRequestRecord | None:
    """Recommend the next unfinished CR in a Refinement Story, without selecting it."""
    overview = get_refinement_story_overview(
        store,
        journey=journey,
        refinement_story_id=refinement_story_id,
    )
    candidates = [
        cr for cr in overview.change_requests if cr.status not in TERMINAL_CHANGE_REQUEST_STATUSES
    ]
    if not candidates:
        return None
    return sorted(
        candidates,
        key=lambda cr: (
            _NEXT_CR_STATUS_ORDER.get(cr.status, 99),
            cr.position,
            cr.created_at,
            cr.id,
        ),
    )[0]


_NEXT_CR_STATUS_ORDER = {
    "implemented": 0,
    "validated": 1,
    "planned": 2,
    "active": 3,
    "captured": 4,
}


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
    cursor = store.get_refinement_cursor(journey)
    active_change_request = None
    last_refinement_event = None
    if cursor and cursor.active_refinement_story_id == story.id:
        last_refinement_event = cursor.last_refinement_event
        if cursor.active_change_request_id is not None:
            active_change_request = store.get_change_request(cursor.active_change_request_id)
    return RefinementStoryOverview(
        story=story,
        change_requests=store.list_change_requests(
            journey,
            refinement_story_id=refinement_story_id,
        ),
        active_change_request=active_change_request,
        last_refinement_event=last_refinement_event,
    )


def _require_active_refinement_story(
    store: Store, journey: str, refinement_story_id: str, action: str
) -> None:
    cursor = store.get_refinement_cursor(journey)
    if cursor is None or cursor.active_refinement_story_id != refinement_story_id:
        raise ValueError(f"active Refinement Story is required to {action}")
    if cursor.active_change_request_id is not None:
        raise ValueError(f"cannot {action} while a Change Request is active")


def _require_closable_change_requests(change_requests: tuple[ChangeRequestRecord, ...]) -> None:
    unfinished = tuple(
        cr for cr in change_requests if cr.status not in TERMINAL_CHANGE_REQUEST_STATUSES
    )
    if unfinished:
        summary = ", ".join(f"{cr.id} ({cr.status})" for cr in unfinished)
        raise ValueError(
            "cannot close Refinement Story with unfinished Change Requests: " + summary
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


def _require_confirmed_cr(store: Store, journey: str, change_request_id: str) -> None:
    cursor = store.get_refinement_cursor(journey)
    if (
        cursor is None
        or cursor.active_change_request_id != change_request_id
        or cursor.last_refinement_event != "change_request_confirmed"
    ):
        raise ValueError("confirmed Change Request is required to mark implemented")


def _require_terminable_cr(
    store: Store, journey: str, change_request_id: str, *, action: str
) -> tuple[RefinementStoryRecord, ChangeRequestRecord]:
    """Resolve a CR eligible for a terminal-state verb (CV20.DS14).

    Unlike ``_require_active_story_and_cr``, this does NOT require the CR to be
    the active one, nor its Refinement Story to be the active Refinement Story
    (N2): park/reject/promote are decision exits that commonly apply to a CR
    that is not currently in flight (the CR023 shape). The CR must still be
    assigned to some Refinement Story in the same journey — an unassigned CR
    uses ``discard`` instead — and must not already be terminal.
    """
    cr = store.get_change_request(change_request_id)
    if cr is None:
        raise ValueError("change_request_id does not exist")
    if cr.journey != journey:
        raise ValueError("change_request_id belongs to a different journey")
    if cr.refinement_story_id is None:
        raise ValueError(f"cannot {action} an unassigned Change Request; use discard instead")
    story = store.get_refinement_story(cr.refinement_story_id)
    if story is None or story.journey != journey:
        raise ValueError("change_request_id belongs to a different journey")
    if cr.status in TERMINAL_CHANGE_REQUEST_STATUSES:
        raise ValueError(
            f"cannot {action} from status '{cr.status}'; Change Request is already terminal"
        )
    return story, cr


def _clear_active_cr_if_current(
    store: Store, *, journey: str, change_request_id: str, event: str
) -> None:
    """Clear the cursor's active CR iff it is the one being terminated.

    Leaves the cursor entirely untouched otherwise — including when a
    different Refinement Story's CR is active (the cross-RS shape).
    """
    cursor = store.get_refinement_cursor(journey)
    if cursor is not None and cursor.active_change_request_id == change_request_id:
        store.set_refinement_cursor(
            journey=journey,
            active_refinement_story_id=cursor.active_refinement_story_id,
            active_change_request_id=None,
            last_refinement_event=event,
        )


def _require_text(value: str, field: str) -> str:
    normalized = value.strip() if value else ""
    if not normalized:
        raise ValueError(f"{field} is required")
    return normalized


def _terminal_detail(new_note: str, existing_notes: str | None) -> str:
    """Compose a terminal outcome note without discarding prior lifecycle notes.

    ``update_change_request_status`` overwrites ``outcome_notes`` on write, so a
    terminal verb applied to, e.g., a ``validated`` CR would otherwise clobber
    its validation evidence. Prepending preserves it (database-architect review).
    """
    if existing_notes:
        return f"{new_note}\nPrior note: {existing_notes}"
    return new_note


def _implementation_detail(*, plan: str | None, evidence: str) -> str:
    normalized_plan = plan.strip() if plan else ""
    normalized_evidence = evidence.strip()
    if normalized_plan:
        return f"Implementation plan: {normalized_plan}\nImplementation evidence: {normalized_evidence}"
    return normalized_evidence


def _validation_closure_detail(*, evidence: str, notes: str | None) -> str:
    normalized_evidence = evidence.strip()
    normalized_notes = notes.strip() if notes else ""
    if normalized_notes:
        return f"Validation evidence: {normalized_evidence}\nDone note: {normalized_notes}"
    return f"Validation evidence: {normalized_evidence}\nDone note: Navigator accepted the change and authorized closure."


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
        active_change_request_id=(
            cr.id if cr is not None and cr.status not in TERMINAL_CHANGE_REQUEST_STATUSES else None
        ),
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
        last_refinement_event=cursor.last_refinement_event if cursor else None,
        refinement_story_count=len(stories),
        change_request_count=len(change_requests),
        unassigned_change_request_count=len(unassigned),
    )
