"""Runtime state helpers for Builder delivery cursors."""

from __future__ import annotations

import json
from dataclasses import dataclass

from memory.storage.store import Store

_CURSOR_SESSION_PREFIX = "__builder_delivery_cursor__:"


@dataclass(frozen=True)
class BuilderDeliveryCursor:
    journey: str
    method: str
    active_item: str | None = None
    active_item_title: str | None = None
    active_item_level: str | None = None
    active_checkpoint: str | None = None
    pending_confirmation: str | None = None
    last_delivery_event: str | None = None
    cadence_profile: str | None = None
    cadence_limits: tuple[str, ...] = ()
    granularity_decision: str | None = None
    navigator_flow_unit: str | None = None
    child_work_items: tuple[str, ...] = ()
    aggregate_checkpoint_status: tuple[str, ...] = ()


def get_delivery_cursor(store: Store, journey: str) -> BuilderDeliveryCursor | None:
    """Return the delivery cursor for a journey, if one exists."""
    normalized_journey = _normalize_required(journey, "journey")
    session = store.get_runtime_session(_session_id(normalized_journey))
    if not session or not session.active or not session.metadata:
        return None
    try:
        data = json.loads(session.metadata)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    method = _optional_string(data.get("method"))
    if method is None:
        return None
    return BuilderDeliveryCursor(
        journey=normalized_journey,
        method=method,
        active_item=_optional_string(data.get("active_item")),
        active_item_title=_optional_string(data.get("active_item_title")),
        active_item_level=_optional_string(data.get("active_item_level")),
        active_checkpoint=_optional_string(data.get("active_checkpoint")),
        pending_confirmation=_optional_string(data.get("pending_confirmation")),
        last_delivery_event=_optional_string(data.get("last_delivery_event")),
        cadence_profile=_optional_string(data.get("cadence_profile")),
        cadence_limits=_optional_string_tuple(data.get("cadence_limits")),
        granularity_decision=_optional_string(data.get("granularity_decision")),
        navigator_flow_unit=_optional_string(data.get("navigator_flow_unit")),
        child_work_items=_optional_string_tuple(data.get("child_work_items")),
        aggregate_checkpoint_status=_optional_string_tuple(data.get("aggregate_checkpoint_status")),
    )


def set_delivery_cursor(
    store: Store,
    *,
    journey: str,
    method: str,
    active_item: str | None = None,
    active_item_title: str | None = None,
    active_item_level: str | None = None,
    active_checkpoint: str | None = None,
    pending_confirmation: str | None = None,
    last_delivery_event: str | None = None,
    cadence_profile: str | None = None,
    cadence_limits: tuple[str, ...] = (),
    granularity_decision: str | None = None,
    navigator_flow_unit: str | None = None,
    child_work_items: tuple[str, ...] = (),
    aggregate_checkpoint_status: tuple[str, ...] = (),
) -> BuilderDeliveryCursor:
    """Persist the Builder delivery cursor for a journey."""
    normalized_journey = _normalize_required(journey, "journey")
    normalized_method = _normalize_required(method, "method")
    cursor = BuilderDeliveryCursor(
        journey=normalized_journey,
        method=normalized_method,
        active_item=_normalize_optional(active_item),
        active_item_title=_normalize_optional(active_item_title),
        active_item_level=_normalize_optional(active_item_level),
        active_checkpoint=_normalize_optional(active_checkpoint),
        pending_confirmation=_normalize_optional(pending_confirmation),
        last_delivery_event=_normalize_optional(last_delivery_event),
        cadence_profile=_normalize_optional(cadence_profile),
        cadence_limits=_normalize_optional_tuple(cadence_limits),
        granularity_decision=_normalize_optional(granularity_decision),
        navigator_flow_unit=_normalize_optional(navigator_flow_unit),
        child_work_items=_normalize_optional_tuple(child_work_items),
        aggregate_checkpoint_status=_normalize_optional_tuple(aggregate_checkpoint_status),
    )
    store.upsert_runtime_session(
        _session_id(normalized_journey),
        interface="builder_delivery_cursor",
        journey=normalized_journey,
        active=True,
        metadata=json.dumps(
            {
                "method": cursor.method,
                "active_item": cursor.active_item,
                "active_item_title": cursor.active_item_title,
                "active_item_level": cursor.active_item_level,
                "active_checkpoint": cursor.active_checkpoint,
                "pending_confirmation": cursor.pending_confirmation,
                "last_delivery_event": cursor.last_delivery_event,
                "cadence_profile": cursor.cadence_profile,
                "cadence_limits": cursor.cadence_limits,
                "granularity_decision": cursor.granularity_decision,
                "navigator_flow_unit": cursor.navigator_flow_unit,
                "child_work_items": cursor.child_work_items,
                "aggregate_checkpoint_status": cursor.aggregate_checkpoint_status,
            },
            ensure_ascii=False,
        ),
    )
    return cursor


def clear_delivery_cursor(store: Store, journey: str) -> None:
    """Clear the Builder delivery cursor for a journey."""
    normalized_journey = _normalize_required(journey, "journey")
    store.upsert_runtime_session(
        _session_id(normalized_journey),
        interface="builder_delivery_cursor",
        journey=normalized_journey,
        active=False,
        metadata=None,
    )


def render_delivery_cursor_sync_report(cursor: BuilderDeliveryCursor) -> str:
    """Render a delivery cursor sync report."""
    return (
        "\n".join(
            [
                "■ Builder Delivery Cursor Synced",
                "",
                "journey",
                cursor.journey,
                "",
                "method",
                cursor.method,
                "",
                "active item",
                cursor.active_item or "none",
                "",
                "active item title",
                cursor.active_item_title or "none",
                "",
                "active item level",
                cursor.active_item_level or "none",
                "",
                "cadence profile",
                cursor.cadence_profile or "stepwise",
                "",
                "cadence limits",
                ", ".join(cursor.cadence_limits) if cursor.cadence_limits else "none",
                "",
                "navigator flow unit",
                cursor.navigator_flow_unit or "story_by_story",
                "",
                "child work items",
                ", ".join(cursor.child_work_items) if cursor.child_work_items else "none",
                "",
                "aggregate checkpoint status",
                (
                    ", ".join(cursor.aggregate_checkpoint_status)
                    if cursor.aggregate_checkpoint_status
                    else "none"
                ),
                "",
                "active checkpoint",
                cursor.active_checkpoint or "none",
                "",
                "pending confirmation",
                cursor.pending_confirmation or "none",
                "",
                "last delivery event",
                cursor.last_delivery_event or "none",
                "",
                "boundary",
                "No story lifecycle work was executed.",
            ]
        )
        + "\n"
    )


def _session_id(journey: str) -> str:
    return f"{_CURSOR_SESSION_PREFIX}{journey}"


def _normalize_required(value: str, field_name: str) -> str:
    normalized = value.strip() if isinstance(value, str) else ""
    if not normalized:
        raise ValueError(f"{field_name} must not be empty")
    return normalized


def _normalize_optional(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip() if isinstance(value, str) else ""
    return normalized or None


def _normalize_optional_tuple(values: tuple[str, ...]) -> tuple[str, ...]:
    normalized: list[str] = []
    for value in values:
        item = _normalize_optional(value)
        if item is not None:
            normalized.append(item)
    return tuple(normalized)


def _optional_string(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _optional_string_tuple(value: object) -> tuple[str, ...]:
    if not isinstance(value, list):
        return ()
    normalized: list[str] = []
    for item in value:
        if isinstance(item, str) and item.strip():
            normalized.append(item.strip())
    return tuple(normalized)
