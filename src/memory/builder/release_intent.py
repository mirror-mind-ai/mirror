"""Delivery Story release intent without release authorization."""

from __future__ import annotations

import re
from dataclasses import dataclass

from memory.builder.delivery_cursor import (
    BuilderDeliveryCursor,
    get_delivery_cursor,
    set_delivery_cursor,
)
from memory.builder.surface_protocol import wrap_ariad_surface
from memory.storage.store import Store

RELEASE_INTENTS = ("planned", "none", "undecided")


@dataclass(frozen=True)
class ReleaseIntentReport:
    journey: str
    method: str
    delivery_story: str
    intent: str
    cursor: BuilderDeliveryCursor
    changed: bool


def set_release_intent(
    store: Store,
    *,
    journey: str,
    method: str,
    intent: str,
) -> ReleaseIntentReport:
    """Record informational release intent for the active Delivery Story boundary."""
    normalized = intent.strip().lower()
    if normalized not in RELEASE_INTENTS:
        raise ValueError("release intent must be planned, none, or undecided")
    cursor, delivery_story = _active_delivery_story(store, journey, method)
    changed = not (
        cursor.release_intent_delivery_story == delivery_story
        and cursor.release_intent == normalized
    )
    updated = _persist_release_intent(
        store,
        cursor,
        delivery_story=delivery_story,
        intent=normalized,
    )
    return ReleaseIntentReport(
        journey=journey,
        method=method,
        delivery_story=delivery_story,
        intent=normalized,
        cursor=updated,
        changed=changed,
    )


def inspect_release_intent(
    store: Store,
    *,
    journey: str,
    method: str,
) -> ReleaseIntentReport:
    """Inspect release intent distinctly from an explicit ``none`` state."""
    cursor, delivery_story = _active_delivery_story(store, journey, method)
    intent = (
        cursor.release_intent
        if cursor.release_intent_delivery_story == delivery_story and cursor.release_intent
        else "not_recorded"
    )
    return ReleaseIntentReport(
        journey=journey,
        method=method,
        delivery_story=delivery_story,
        intent=intent,
        cursor=cursor,
        changed=False,
    )


def delivery_story_code_for_item(item_code: str | None) -> str | None:
    """Return the authored Delivery Story ancestor for supported Ariad codes."""
    if not item_code:
        return None
    parts = tuple(part.strip() for part in item_code.split(".") if part.strip())
    for index, part in enumerate(parts):
        if re.fullmatch(r"DS-?\d+", part, flags=re.IGNORECASE):
            return ".".join(parts[: index + 1])
    return None


def render_release_intent_report(report: ReleaseIntentReport) -> str:
    action = "recorded" if report.changed else "inspected"
    meaning = {
        "planned": "This Delivery Story is expected to create a release boundary if completed coherently.",
        "none": "This Delivery Story is not expected to create a release boundary.",
        "undecided": "Release intent is intentionally unresolved and may be revisited later.",
        "not_recorded": "No release intent has been recorded for this Delivery Story.",
    }[report.intent]
    body = "\n".join(
        [
            "Delivery",
            "",
            "╭────────────────────────────────────────────────────────╮",
            "│        🚦  DELIVERY STORY RELEASE INTENT               │",
            "│                                                        │",
            _card_text("Delivery Story"),
            *_card_wrapped(report.delivery_story),
            "│                                                        │",
            _card_text("Intent"),
            *_card_wrapped(report.intent),
            "│                                                        │",
            _card_text("Meaning"),
            *_card_wrapped(meaning),
            "│                                                        │",
            _card_text("Action"),
            *_card_wrapped(action),
            "│                                                        │",
            _card_text("Authority boundary"),
            *_card_wrapped(
                "Release intent does not authorize commit, push, tag creation, stable promotion, release publication, or remote mutation."
            ),
            "╰────────────────────────────────────────────────────────╯",
        ]
    )
    return wrap_ariad_surface("release_intent", body + "\n")


def _active_delivery_story(
    store: Store, journey: str, method: str
) -> tuple[BuilderDeliveryCursor, str]:
    cursor = get_delivery_cursor(store, journey)
    if cursor is None:
        raise ValueError("delivery cursor is required before release intent")
    if cursor.method != method:
        raise ValueError("active Builder method does not match release intent method")
    delivery_story = delivery_story_code_for_item(cursor.active_item)
    if delivery_story is None:
        raise ValueError("active Delivery Story boundary is required for release intent")
    return cursor, delivery_story


def _persist_release_intent(
    store: Store,
    cursor: BuilderDeliveryCursor,
    *,
    delivery_story: str,
    intent: str,
) -> BuilderDeliveryCursor:
    return set_delivery_cursor(
        store,
        journey=cursor.journey,
        method=cursor.method,
        active_item=cursor.active_item,
        active_item_title=cursor.active_item_title,
        active_item_level=cursor.active_item_level,
        active_checkpoint=cursor.active_checkpoint,
        pending_confirmation=cursor.pending_confirmation,
        last_delivery_event=cursor.last_delivery_event,
        cadence_profile=cursor.cadence_profile,
        cadence_limits=cursor.cadence_limits,
        granularity_decision=cursor.granularity_decision,
        navigator_flow_unit=cursor.navigator_flow_unit,
        child_work_items=cursor.child_work_items,
        aggregate_checkpoint_status=cursor.aggregate_checkpoint_status,
        cursor_generation=cursor.cursor_generation,
        release_intent_delivery_story=delivery_story,
        release_intent=intent,
    )


def _card_text(text: str) -> str:
    width = 54
    return f"│ {text[:width]:<{width}} │"


def _card_wrapped(text: str) -> list[str]:
    return [_card_text(line) for line in _wrap_plain_text(text, width=54)]


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
