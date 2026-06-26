"""Navigator flow-unit helpers for Ariad Builder delivery."""

from __future__ import annotations

from dataclasses import dataclass

from memory.builder.delivery_cursor import (
    BuilderDeliveryCursor,
    get_delivery_cursor,
    set_delivery_cursor,
)
from memory.builder.lifecycle_ribbon import render_lifecycle_ribbon
from memory.builder.surface_protocol import wrap_ariad_surface
from memory.storage.store import Store

FLOW_UNIT_STORY_BY_STORY = "story_by_story"
FLOW_UNIT_DELIVERY_STORY = "delivery_story"
ALLOWED_FLOW_UNITS = (FLOW_UNIT_STORY_BY_STORY, FLOW_UNIT_DELIVERY_STORY)


@dataclass(frozen=True)
class NavigatorFlowUnitReport:
    journey: str
    method: str
    active_item: str | None
    active_item_title: str | None
    active_item_level: str | None
    flow_unit: str
    source: str
    cursor: BuilderDeliveryCursor


def effective_navigator_flow_unit(cursor: BuilderDeliveryCursor) -> tuple[str, str]:
    """Return the effective Navigator flow unit and its source."""
    if cursor.navigator_flow_unit in ALLOWED_FLOW_UNITS:
        return cursor.navigator_flow_unit, "cursor"
    return FLOW_UNIT_STORY_BY_STORY, "default"


def set_navigator_flow_unit(
    store: Store,
    *,
    journey: str,
    method: str,
    flow_unit: str,
) -> NavigatorFlowUnitReport:
    """Persist the Navigator-facing flow unit for active Builder delivery."""
    if flow_unit not in ALLOWED_FLOW_UNITS:
        allowed = ", ".join(ALLOWED_FLOW_UNITS)
        raise ValueError(f"navigator flow unit must be one of: {allowed}")
    existing = get_delivery_cursor(store, journey)
    if existing is None:
        raise ValueError("delivery cursor is required before choosing navigator flow unit")
    updated = set_delivery_cursor(
        store,
        journey=journey,
        method=method,
        active_item=existing.active_item,
        active_item_title=existing.active_item_title,
        active_item_level=existing.active_item_level,
        active_checkpoint=existing.active_checkpoint,
        pending_confirmation=existing.pending_confirmation,
        last_delivery_event="navigator_flow_unit_selected",
        cadence_profile=existing.cadence_profile,
        cadence_limits=existing.cadence_limits,
        granularity_decision=existing.granularity_decision,
        navigator_flow_unit=flow_unit,
        child_work_items=existing.child_work_items,
        aggregate_checkpoint_status=existing.aggregate_checkpoint_status,
    )
    return NavigatorFlowUnitReport(
        journey=journey,
        method=method,
        active_item=updated.active_item,
        active_item_title=updated.active_item_title,
        active_item_level=updated.active_item_level,
        flow_unit=flow_unit,
        source="cursor",
        cursor=updated,
    )


def inspect_navigator_flow_unit(
    store: Store,
    *,
    journey: str,
    method: str,
) -> NavigatorFlowUnitReport:
    """Inspect the effective Navigator flow unit for active Builder delivery."""
    cursor = get_delivery_cursor(store, journey)
    if cursor is None:
        raise ValueError("delivery cursor is required before inspecting navigator flow unit")
    flow_unit, source = effective_navigator_flow_unit(cursor)
    return NavigatorFlowUnitReport(
        journey=journey,
        method=method,
        active_item=cursor.active_item,
        active_item_title=cursor.active_item_title,
        active_item_level=cursor.active_item_level,
        flow_unit=flow_unit,
        source=source,
        cursor=cursor,
    )


def render_navigator_flow_unit_report(report: NavigatorFlowUnitReport) -> str:
    """Render a deterministic Ariad surface for the Navigator flow-unit decision."""
    body = "\n".join(
        [
            "Delivery",
            render_lifecycle_ribbon("expand"),
            "",
            "╭────────────────────────────────────────────────────────╮",
            "│        🧭■  NAVIGATOR FLOW UNIT                        │",
            "│                                                        │",
            _card_text("journey"),
            _card_text(report.journey),
            "│                                                        │",
            _card_text("method"),
            _card_text(report.method),
            "│                                                        │",
            _card_text("active item"),
            _card_text(report.active_item or "none"),
            "│                                                        │",
            _card_text("active item title"),
            *_card_wrapped(report.active_item_title or "none"),
            "│                                                        │",
            _card_text("active item level"),
            _card_text(report.active_item_level or "none"),
            "│                                                        │",
            _card_text("effective flow unit"),
            _card_text(report.flow_unit),
            "│                                                        │",
            _card_text("source"),
            _card_text(report.source),
            "│                                                        │",
            _card_text("available choices"),
            *_card_prefixed(
                (
                    "story_by_story: child User/Technical Stories remain Navigator-facing lifecycle units",
                    "delivery_story: parent Delivery Story becomes the Navigator-facing lifecycle unit while child stories remain traceable Driver work packages",
                ),
                "○",
            ),
            "│                                                        │",
            _card_text("default"),
            *_card_wrapped(
                "story_by_story preserves current Ariad Builder behavior when no choice is recorded."
            ),
            "│                                                        │",
            _card_text("boundary"),
            *_card_wrapped(
                "No Plan, implementation, validation, push, or release work was executed."
            ),
            "╰────────────────────────────────────────────────────────╯",
        ]
    )
    return wrap_ariad_surface("navigator_flow_unit", body + "\n")


def _card_text(text: str) -> str:
    width = 54
    return f"│ {text[:width]:<{width}} │"


def _card_prefixed(items: tuple[str, ...], prefix: str) -> list[str]:
    lines: list[str] = []
    for item in items:
        wrapped = _wrap_plain_text(item, width=52)
        for index, line in enumerate(wrapped):
            marker = prefix if index == 0 else " "
            lines.append(_card_text(f"{marker} {line}"))
    return lines or [_card_text("none")]


def _card_wrapped(text: str) -> list[str]:
    return [_card_text(line) for line in _wrap_plain_text(text, width=54)]


def _wrap_plain_text(text: str, *, width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        if len(word) > width:
            if current:
                lines.append(current)
                current = ""
            for start in range(0, len(word), width):
                lines.append(word[start : start + width])
            continue
        candidate = f"{current} {word}".strip()
        if len(candidate) > width and current:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines or ["none"]
