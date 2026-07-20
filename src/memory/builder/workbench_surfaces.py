"""Ariad Workbench composition surface renderers."""

from __future__ import annotations

from memory.builder.lifecycle_ribbon import (
    render_change_request_lifecycle_ribbon,
    render_refinement_lifecycle_ribbon,
)
from memory.builder.surface_protocol import wrap_ariad_surface
from memory.builder.workbench import (
    ChangeRequestDiscard,
    RefinementFlowEvent,
    RefinementStoryOverview,
)
from memory.storage.builder_workbench import (
    TERMINAL_CHANGE_REQUEST_STATUSES,
    ChangeRequestRecord,
    RefinementStoryRecord,
)


def render_change_request_discarded_surface(discard: ChangeRequestDiscard) -> str:
    lines = [
        "Refinement Work",
        "",
        "╭────────────────────────────────────────────────────────╮",
        "│        🧹  CHANGE REQUEST DISCARDED                    │",
        "│                                                        │",
        *_card_wrapped(format_cr_ref(discard.change_request)),
        "│                                                        │",
        _card_text("Discarded"),
        *_card_wrapped(
            "This captured Change Request was removed before entering the active CR cycle."
        ),
        "│                                                        │",
        _card_text("Reason"),
        *_card_wrapped(discard.reason),
        "│                                                        │",
        _card_text("Refinement Story"),
        *_card_wrapped(
            format_rs_ref(discard.refinement_story) if discard.refinement_story else "unassigned"
        ),
    ]
    lines.append("╰────────────────────────────────────────────────────────╯")
    return wrap_ariad_surface("change_request_discarded", "\n".join(lines) + "\n")


def render_change_request_captured_surface(
    *,
    journey: str,
    change_request: ChangeRequestRecord,
    refinement_story: RefinementStoryRecord | None,
) -> str:
    """Render a Navigator-facing surface for captured Change Requests."""
    lines = [
        "Refinement Work",
        "",
        "╭────────────────────────────────────────────────────────╮",
        "│        🧰■  CHANGE REQUEST CAPTURED                    │",
        "│                                                        │",
        *_card_wrapped(format_cr_ref(change_request)),
        "│                                                        │",
        _card_text("Requested change"),
        *_card_wrapped(change_request.body),
        "│                                                        │",
        _card_text("Refinement Story"),
        *_card_wrapped(format_rs_ref(refinement_story) if refinement_story else "unassigned"),
        "╰────────────────────────────────────────────────────────╯",
    ]
    return wrap_ariad_surface("change_request_captured", "\n".join(lines) + "\n")


def render_refinement_story_pulled_surface(
    *,
    journey: str,
    overview: RefinementStoryOverview,
) -> str:
    """Render a Navigator-facing surface for pulled Refinement Stories."""
    lines = [
        "Refinement Work",
        render_refinement_lifecycle_ribbon("pull"),
        "",
        "╭────────────────────────────────────────────────────────╮",
        "│        🧰■  REFINEMENT STORY PULLED                    │",
        "│                                                        │",
        *_card_wrapped(format_rs_ref(overview.story)),
        "│                                                        │",
        _card_text("Pulled"),
        *_card_wrapped("This Refinement Story entered active Refinement Work."),
        "│                                                        │",
        _card_text(f"change requests (#{len(overview.change_requests)})"),
    ]
    lines.extend(_render_overview_change_requests(overview.change_requests))
    lines.append("╰────────────────────────────────────────────────────────╯")
    return wrap_ariad_surface("refinement_story_pulled", "\n".join(lines) + "\n")


def render_refinement_story_overview_surface(
    *,
    journey: str,
    overview: RefinementStoryOverview,
) -> str:
    """Render a Navigator-facing overview of one Refinement Story."""
    lines = [
        "Refinement Work",
        "",
        "╭────────────────────────────────────────────────────────╮",
        "│        🧰■  REFINEMENT STORY OVERVIEW                  │",
        "│                                                        │",
        *_card_wrapped(overview.story.title),
        "│                                                        │",
        _card_text(f"change requests (#{len(overview.change_requests)})"),
    ]
    lines.extend(_render_overview_change_requests(overview.change_requests))
    lines.append("╰────────────────────────────────────────────────────────╯")
    return wrap_ariad_surface("refinement_story_overview", "\n".join(lines) + "\n")


def render_refinement_flow_event_surface(event: RefinementFlowEvent) -> str:
    """Render a Navigator-facing Refinement flow transition surface."""
    lines = [
        "Refinement Work",
        _event_lifecycle_ribbon(event),
        "",
        "╭────────────────────────────────────────────────────────╮",
        _event_header(event),
        "│                                                        │",
        *_event_body_lines(event),
    ]
    if event.change_request is not None:
        lines.extend(
            [
                "│                                                        │",
                _card_text("Refinement Story"),
                *_card_wrapped(format_rs_ref(event.refinement_story)),
            ]
        )
    lines.append("╰────────────────────────────────────────────────────────╯")
    return wrap_ariad_surface("refinement_flow_event", "\n".join(lines) + "\n")


def _event_header(event: RefinementFlowEvent) -> str:
    subject = (
        event.change_request.display_code
        if event.change_request is not None
        else event.refinement_story.display_code
    )
    return _card_text(f"{_event_icon(event)} {subject} {_human_event_phase(event).upper()}")


def _event_icon(event: RefinementFlowEvent) -> str:
    return {
        "change_request_selected": "🟪",
        "change_request_confirmed": "🧭",
        "change_request_planned": "🟦",
        "change_request_implemented": "🟧",
        "change_request_validated": "🟩",
        "change_request_done": "◻",
        "change_request_parked": "🟫",
        "change_request_rejected": "🟥",
        "change_request_promoted": "🔷",
        "refinement_story_reviewed": "🔎",
        "refinement_story_coherent": "◉",
        "refinement_story_closed": "◻",
        "refinement_story_parked": "🟫",
    }.get(event.event, "⬜")


def _human_event_phase(event: RefinementFlowEvent) -> str:
    return {
        "change_request_selected": "Selected",
        "change_request_confirmed": "Confirmed",
        "change_request_planned": "Planned",
        "change_request_implemented": "Implemented",
        "change_request_validated": "Validated",
        "change_request_done": "Done",
        "change_request_parked": "Parked",
        "change_request_rejected": "Rejected",
        "change_request_promoted": "Promoted",
        "refinement_story_reviewed": "Review",
        "refinement_story_coherent": "Coherence",
        "refinement_story_closed": "Closed",
        "refinement_story_parked": "Parked",
    }.get(event.event, "Updated")


def _event_body_lines(event: RefinementFlowEvent) -> list[str]:
    if event.event == "change_request_selected" and event.change_request is not None:
        return _scope_confirmation_lines(event.change_request)
    return _card_wrapped(_event_body(event))


def _scope_confirmation_lines(change_request: ChangeRequestRecord) -> list[str]:
    return [
        _card_text("Scope confirmation"),
        _card_text("My understanding:"),
        *_card_prefixed(
            (
                change_request.title,
                change_request.body,
            ),
            "-",
        ),
        "│                                                        │",
        _card_text("Before I plan or implement, confirm:"),
        *_card_wrapped("1. Is this the right scope?"),
        *_card_wrapped("2. Is anything out of scope?"),
        *_card_wrapped("3. What validation evidence will satisfy you?"),
    ]


def _event_body(event: RefinementFlowEvent) -> str:
    if event.detail:
        return event.detail
    return {
        "change_request_selected": "This Change Request entered the active CR cycle.",
        "change_request_confirmed": "The Change Request understanding was confirmed.",
        "change_request_planned": "The Change Request implementation route was planned.",
        "change_request_implemented": "Implementation evidence was recorded for this Change Request.",
        "change_request_validated": "Validation evidence was recorded for this Change Request.",
        "change_request_done": "The Change Request was closed with a done note.",
        "change_request_parked": "This Change Request was parked for a later revisit.",
        "change_request_rejected": "This Change Request was rejected; the record was kept.",
        "change_request_promoted": "This Change Request was promoted out of Refinement Work.",
        "refinement_story_reviewed": "The Refinement Story review was recorded.",
        "refinement_story_coherent": "The Refinement Story coherence check was recorded.",
        "refinement_story_closed": "The Refinement Story was closed.",
        "refinement_story_parked": "This Refinement Story was parked for a later revisit.",
    }.get(event.event, "The Refinement Work state was updated.")


def render_refinement_story_progress_surface(
    *,
    story: RefinementStoryRecord,
    change_requests: tuple[ChangeRequestRecord, ...],
    next_change_request: ChangeRequestRecord | None,
) -> str:
    resolved_count = sum(
        1 for cr in change_requests if cr.status in TERMINAL_CHANGE_REQUEST_STATUSES
    )
    total = len(change_requests)
    lines = [
        "Refinement Work",
        "",
        "╭────────────────────────────────────────────────────────╮",
        _card_text(f"{story.display_code} PROGRESS"),
        "│                                                        │",
        *_card_wrapped(story.title),
        *_card_wrapped(
            f"{_progress_bar(change_requests, next_change_request)} {resolved_count}/{total} resolved"
        ),
        "│                                                        │",
        _card_text("🟩 resolved   🟦 next   🟥 remaining"),
        "│                                                        │",
    ]
    for cr in change_requests:
        lines.extend(
            _card_wrapped(
                f"{_progress_icon(cr, next_change_request)} {format_cr_ref(cr)} [{cr.status}]"
            )
        )
    if next_change_request is None:
        lines.extend(
            [
                "│                                                        │",
                *_card_wrapped("No remaining actionable Change Requests in this Refinement Story."),
            ]
        )
    else:
        lines.extend(
            [
                "│                                                        │",
                *_card_wrapped(
                    "Next CR recommendation: "
                    f"{next_change_request.display_code}. Await Navigator confirmation before selecting it."
                ),
            ]
        )
    lines.append("╰────────────────────────────────────────────────────────╯")
    return wrap_ariad_surface("refinement_story_progress", "\n".join(lines) + "\n")


def render_next_change_request_recommendation(
    change_request: ChangeRequestRecord | None,
) -> str:
    if change_request is None:
        return "Next CR recommendation: no remaining actionable Change Requests in this RS."
    return (
        "Next CR recommendation: "
        f"{change_request.display_code} — {change_request.title} "
        f"[{change_request.status}]. Await Navigator confirmation before selecting it."
    )


def _progress_bar(
    change_requests: tuple[ChangeRequestRecord, ...],
    next_change_request: ChangeRequestRecord | None,
) -> str:
    return "".join(_progress_icon(cr, next_change_request) for cr in change_requests) or "none"


def _progress_icon(
    change_request: ChangeRequestRecord,
    next_change_request: ChangeRequestRecord | None,
) -> str:
    # Terminal CRs (done/parked/rejected/promoted) are all resolved (QA-1,
    # CV20.DS14): the progress surface must never render a terminal CR as
    # "remaining" while simultaneously reporting no actionable CRs left. A
    # uniform resolved mark is used here (rather than one mark per terminal
    # status) to avoid a color collision with the "remaining" mark; the
    # per-item "[status]" suffix carries the precise status instead.
    if change_request.status in TERMINAL_CHANGE_REQUEST_STATUSES:
        return "🟩"
    if next_change_request is not None and change_request.id == next_change_request.id:
        return "🟦"
    return "🟥"


def format_rs_ref(story: RefinementStoryRecord) -> str:
    return f"{story.display_code}: {story.title}"


def format_cr_ref(change_request: ChangeRequestRecord) -> str:
    return f"{change_request.display_code}: {change_request.title}"


def _event_lifecycle_ribbon(event: RefinementFlowEvent) -> str:
    if event.event.startswith("change_request_"):
        return render_change_request_lifecycle_ribbon(_change_request_ribbon_stage(event))
    return render_refinement_lifecycle_ribbon(_refinement_story_ribbon_stage(event))


def _change_request_ribbon_stage(event: RefinementFlowEvent) -> str:
    return {
        "change_request_selected": "confirm",
        "change_request_confirmed": "confirm",
        "change_request_planned": "plan",
        "change_request_implemented": "implement",
        "change_request_validated": "validate",
        "change_request_done": "done_note",
        # Terminal exits (CV20.DS14): park/reject/promote can fire from any
        # non-terminal CR stage. There is no dedicated ribbon stage for a
        # terminal exit, so map to the closest end-of-cycle stage rather than
        # invent a new ribbon shape for a v1 (accepted minor imprecision for
        # an early-stage exit).
        "change_request_parked": "done_note",
        "change_request_rejected": "done_note",
        "change_request_promoted": "done_note",
    }.get(event.event, "confirm")


def _refinement_story_ribbon_stage(event: RefinementFlowEvent) -> str:
    return {
        "refinement_story_pulled": "pull",
        "refinement_story_reviewed": "review",
        "refinement_story_coherent": "coherence",
        "refinement_story_closed": "close",
        "refinement_story_parked": "close",
    }.get(event.event, "cr_cycle")


def _phase_label(event: RefinementFlowEvent) -> str:
    if event.event.startswith("refinement_story_"):
        return "current RS phase"
    return "current CR phase"


def _current_phase(event: RefinementFlowEvent) -> str:
    return {
        "change_request_selected": "selected",
        "change_request_confirmed": "confirmed",
        "change_request_planned": "planned",
        "change_request_implemented": "implemented evidence recorded",
        "change_request_validated": "validated",
        "change_request_done": "done note recorded",
        "refinement_story_reviewed": "RS review",
        "refinement_story_coherent": "RS coherence",
        "refinement_story_closed": "RS closed",
    }.get(event.event, event.new_status or "unknown")


def _next_conversational_move(event: RefinementFlowEvent) -> str:
    return {
        "change_request_selected": "confirm this CR before planning it",
        "change_request_confirmed": "record a short plan for this CR",
        "change_request_planned": "implement this CR only with explicit Navigator authorization",
        "change_request_implemented": "validate this CR with concrete evidence",
        "change_request_validated": "record the done note for this CR",
        "change_request_done": "select another CR or review the Refinement Story",
        "refinement_story_reviewed": "check coherence for the Refinement Story",
        "refinement_story_coherent": "close the Refinement Story or add follow-up CRs",
        "refinement_story_closed": "return to Builder Home or pull another work item",
    }.get(event.event, "choose the next Refinement movement")


def _render_change_requests(change_requests: tuple[ChangeRequestRecord, ...]) -> list[str]:
    if not change_requests:
        return [_card_text("none")]
    lines: list[str] = []
    for cr in change_requests:
        lines.extend(_card_wrapped(f"- {format_cr_ref(cr)} [{cr.status}]"))
    return lines


_STATUS_SORT_ORDER = {
    "implemented": 0,
    "validated": 1,
    "planned": 2,
    "active": 3,
    "captured": 4,
    "parked": 5,
    "promoted": 6,
    "rejected": 7,
    "done": 8,
}

_STATUS_MARKS = {
    "implemented": "🟧",
    "validated": "🟩",
    "planned": "🟦",
    "active": "🟪",
    "captured": "🟨",
    "parked": "🟫",
    "promoted": "🔷",
    "rejected": "🟥",
    "done": "🟩",
}


def _render_overview_change_requests(change_requests: tuple[ChangeRequestRecord, ...]) -> list[str]:
    if not change_requests:
        return [_card_text("none")]
    lines: list[str] = []
    for cr in sorted(
        change_requests,
        key=lambda item: (
            _STATUS_SORT_ORDER.get(item.status, 99),
            item.position,
            item.created_at,
            item.id,
        ),
    ):
        mark = _STATUS_MARKS.get(cr.status, "⬜")
        lines.extend(_card_wrapped(f"- {mark} {format_cr_ref(cr)} [{cr.status}]"))
    return lines


def _defuse_surface_markers(text: str) -> str:
    """Neutralize literal Ariad transport marker prefixes inside rendered text.

    Free-text CR/RS fields (title, body, reason, notes, target) can contain
    Navigator- or dogfooding-sourced text and are rendered verbatim inside a
    card that is itself wrapped by ``wrap_ariad_surface``. A forged
    ``<<<ARIAD:...>>>`` or ``<<<END:...>>>`` sequence inside that text could be
    mistaken by a renderer scanning for the marker tokens for a real transport
    boundary (security-engineer review, CV20.DS14). Break just the two prefixes
    the transport protocol scans for so the text still reads naturally.
    """
    return text.replace("<<<ARIAD:", "<{ARIAD:").replace("<<<END:", "<{END:")


def _card_text(text: str) -> str:
    width = 54
    safe_text = _defuse_surface_markers(text)
    return f"│ {safe_text[:width]:<{width}} │"


def _card_wrapped(text: str) -> list[str]:
    return [_card_text(line) for line in _wrap_plain_text(text, width=54)]


def _card_prefixed(items: tuple[str, ...], prefix: str) -> list[str]:
    lines: list[str] = []
    for item in items:
        wrapped = _wrap_plain_text(item, width=52)
        for index, line in enumerate(wrapped):
            marker = prefix if index == 0 else " "
            lines.append(_card_text(f"{marker} {line}"))
    return lines


def _wrap_plain_text(text: str, *, width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if len(candidate) > width and current:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines or ["none"]
