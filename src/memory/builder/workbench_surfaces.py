"""Ariad Workbench composition surface renderers."""

from __future__ import annotations

from memory.builder.lifecycle_ribbon import render_lifecycle_ribbon
from memory.builder.surface_protocol import wrap_ariad_surface
from memory.builder.workbench import RefinementFlowEvent, RefinementStoryOverview
from memory.storage.builder_workbench import ChangeRequestRecord, RefinementStoryRecord


def render_change_request_captured_surface(
    *,
    journey: str,
    change_request: ChangeRequestRecord,
    refinement_story: RefinementStoryRecord | None,
) -> str:
    """Render a Navigator-facing surface for captured Change Requests."""
    lines = [
        "Refinement",
        render_lifecycle_ribbon("pull"),
        "",
        "╭────────────────────────────────────────────────────────╮",
        "│        🧰■  CHANGE REQUEST CAPTURED                    │",
        "│                                                        │",
        _card_text("journey"),
        _card_text(journey),
        "│                                                        │",
        _card_text("change request"),
        _card_text(change_request.id),
        *_card_wrapped(change_request.title),
        "│                                                        │",
        _card_text("status"),
        _card_text(change_request.status),
        "│                                                        │",
        _card_text("source"),
        _card_text(change_request.source),
    ]
    if change_request.provenance:
        lines.extend([_card_text("provenance"), *_card_wrapped(change_request.provenance)])
    lines.extend(
        [
            "│                                                        │",
            _card_text("refinement story"),
            *_card_wrapped(
                f"{refinement_story.id} — {refinement_story.title}"
                if refinement_story
                else "unassigned"
            ),
            "│                                                        │",
            _card_text("boundary"),
            *_card_wrapped(
                "Change Request was captured only; no Refinement Story was pulled and no CR lifecycle work was executed."
            ),
            "╰────────────────────────────────────────────────────────╯",
        ]
    )
    return wrap_ariad_surface("change_request_captured", "\n".join(lines) + "\n")


def render_refinement_story_pulled_surface(
    *,
    journey: str,
    overview: RefinementStoryOverview,
) -> str:
    """Render a Navigator-facing surface for pulled Refinement Stories."""
    lines = [
        "Refinement",
        render_lifecycle_ribbon("pull"),
        "",
        "╭────────────────────────────────────────────────────────╮",
        "│        🧰■  REFINEMENT STORY PULLED                    │",
        "│                                                        │",
        _card_text("journey"),
        _card_text(journey),
        "│                                                        │",
        _card_text("refinement story"),
        _card_text(overview.story.id),
        *_card_wrapped(overview.story.title),
        "│                                                        │",
        _card_text("status"),
        _card_text(overview.story.status),
        "│                                                        │",
        _card_text("active refinement cursor"),
        _card_text(f"active RS: {overview.story.id}"),
        _card_text("active CR: none"),
        "│                                                        │",
        _card_text("change requests"),
        _card_text(str(len(overview.change_requests))),
    ]
    lines.extend(_render_change_requests(overview.change_requests))
    lines.extend(
        [
            "│                                                        │",
            _card_text("next refinement move"),
            *_card_wrapped("select or confirm first CR later (not implemented in this story)"),
            "│                                                        │",
            _card_text("boundary"),
            *_card_wrapped(
                "Refinement Story was pulled into active Refinement Work; no CR lifecycle work was executed and no Delivery Work was pulled or executed."
            ),
            "╰────────────────────────────────────────────────────────╯",
        ]
    )
    return wrap_ariad_surface("refinement_story_pulled", "\n".join(lines) + "\n")


def render_refinement_story_overview_surface(
    *,
    journey: str,
    overview: RefinementStoryOverview,
) -> str:
    """Render a Navigator-facing overview of one Refinement Story."""
    lines = [
        "Refinement",
        render_lifecycle_ribbon("pull"),
        "",
        "╭────────────────────────────────────────────────────────╮",
        "│        🧰■  REFINEMENT STORY OVERVIEW                  │",
        "│                                                        │",
        _card_text("journey"),
        _card_text(journey),
        "│                                                        │",
        _card_text("refinement story"),
        _card_text(overview.story.id),
        *_card_wrapped(overview.story.title),
        "│                                                        │",
        _card_text("status"),
        _card_text(overview.story.status),
        "│                                                        │",
        _card_text("change requests"),
        _card_text(str(len(overview.change_requests))),
    ]
    lines.extend(_render_change_requests(overview.change_requests))
    lines.extend(
        [
            "│                                                        │",
            _card_text("available next moves"),
            *_card_prefixed(
                (
                    "add another CR",
                    "attach an existing CR",
                    "pull RS later (not implemented in this story)",
                ),
                "-",
            ),
            "│                                                        │",
            _card_text("boundary"),
            *_card_wrapped(
                "Overview only; no Refinement Story was pulled and no CR lifecycle work was executed."
            ),
            "╰────────────────────────────────────────────────────────╯",
        ]
    )
    return wrap_ariad_surface("refinement_story_overview", "\n".join(lines) + "\n")


def render_refinement_flow_event_surface(event: RefinementFlowEvent) -> str:
    """Render a Navigator-facing Refinement flow transition surface."""
    lines = [
        "Refinement",
        render_lifecycle_ribbon("implement"),
        "",
        "╭────────────────────────────────────────────────────────╮",
        "│        🧰■  REFINEMENT FLOW EVENT                      │",
        "│                                                        │",
        _card_text("event"),
        _card_text(event.event),
        "│                                                        │",
        _card_text("journey"),
        _card_text(event.journey),
        "│                                                        │",
        _card_text("refinement story"),
        _card_text(event.refinement_story.id),
        *_card_wrapped(event.refinement_story.title),
    ]
    if event.change_request is not None:
        lines.extend(
            [
                "│                                                        │",
                _card_text("change request"),
                _card_text(event.change_request.id),
                *_card_wrapped(event.change_request.title),
            ]
        )
    lines.extend(
        [
            "│                                                        │",
            _card_text("status transition"),
            *_card_wrapped(f"{event.previous_status or 'none'} → {event.new_status or 'none'}"),
            "│                                                        │",
            _card_text("active cursor"),
            _card_text(
                f"active RS: {event.refinement_story.id if event.event != 'refinement_story_closed' else 'none'}"
            ),
            _card_text(f"active CR: {event.active_change_request_id or 'none'}"),
        ]
    )
    if event.detail:
        lines.extend(
            [
                "│                                                        │",
                _card_text("detail"),
                *_card_wrapped(event.detail),
            ]
        )
    if event.event in {"refinement_story_reviewed", "refinement_story_coherent"}:
        lines.extend(
            [
                "│                                                        │",
                _card_text("review/coherence boundary"),
                *_card_wrapped(
                    "This checkpoint does not mutate files; required changes must become Change Requests or future work."
                ),
            ]
        )
    lines.extend(
        [
            "│                                                        │",
            _card_text("boundary"),
            *_card_wrapped(
                "Runtime state transition only; no files were mutated and no Delivery Work was pulled or executed."
            ),
            "╰────────────────────────────────────────────────────────╯",
        ]
    )
    return wrap_ariad_surface("refinement_flow_event", "\n".join(lines) + "\n")


def _render_change_requests(change_requests: tuple[ChangeRequestRecord, ...]) -> list[str]:
    if not change_requests:
        return [_card_text("none")]
    lines: list[str] = []
    for cr in change_requests:
        lines.extend(_card_wrapped(f"- {cr.id} — {cr.title} [{cr.status}]"))
    return lines


def _card_text(text: str) -> str:
    width = 54
    return f"│ {text[:width]:<{width}} │"


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
