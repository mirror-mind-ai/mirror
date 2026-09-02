"""Runtime state helpers for Builder delivery cursors."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, replace

from memory.storage.store import Store

_CURSOR_SESSION_PREFIX = "__builder_delivery_cursor__:"
_KEEP_PREAUTHORIZATION = object()
_KEEP_RELEASE_INTENT = object()


@dataclass(frozen=True)
class PlanPreauthorizationReceipt:
    """Bounded single-use Navigator authority for one exact Plan scope."""

    journey: str
    method: str
    cursor_generation: int
    active_item: str
    active_item_level: str
    flow_unit: str
    child_work_items: tuple[str, ...]
    plan_contract_version: str
    policy: str
    stop_boundary: str
    scope_fingerprint: str
    status: str = "pending"
    reason: str | None = None


class DeliveryCursorConflict(RuntimeError):
    """The persisted cursor changed after the caller observed it."""


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
    cursor_generation: int = 0
    plan_preauthorization: PlanPreauthorizationReceipt | None = None
    release_intent_delivery_story: str | None = None
    release_intent: str | None = None


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
        cursor_generation=_optional_nonnegative_int(data.get("cursor_generation")),
        plan_preauthorization=_deserialize_preauthorization(data.get("plan_preauthorization")),
        release_intent_delivery_story=_optional_string(data.get("release_intent_delivery_story")),
        release_intent=_optional_release_intent(data.get("release_intent")),
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
    cursor_generation: int | None = None,
    plan_preauthorization: PlanPreauthorizationReceipt | None | object = _KEEP_PREAUTHORIZATION,
    expected_cursor: BuilderDeliveryCursor | None = None,
    release_intent_delivery_story: str | None | object = _KEEP_RELEASE_INTENT,
    release_intent: str | None | object = _KEEP_RELEASE_INTENT,
    refresh_projection: bool = True,
) -> BuilderDeliveryCursor:
    """Persist the Builder delivery cursor for a journey."""
    normalized_journey = _normalize_required(journey, "journey")
    normalized_method = _normalize_required(method, "method")
    previous = get_delivery_cursor(store, normalized_journey)
    resolved_generation = (
        previous.cursor_generation
        if cursor_generation is None and previous is not None
        else _normalize_nonnegative_int(cursor_generation)
    )
    preauthorization_was_explicit = plan_preauthorization is not _KEEP_PREAUTHORIZATION
    resolved_preauthorization = (
        previous.plan_preauthorization
        if not preauthorization_was_explicit and previous is not None
        else plan_preauthorization
    )
    if resolved_preauthorization is _KEEP_PREAUTHORIZATION:
        resolved_preauthorization = None
    resolved_release_story = (
        previous.release_intent_delivery_story
        if release_intent_delivery_story is _KEEP_RELEASE_INTENT and previous is not None
        else release_intent_delivery_story
    )
    resolved_release_intent = (
        previous.release_intent
        if release_intent is _KEEP_RELEASE_INTENT and previous is not None
        else release_intent
    )
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
        cursor_generation=resolved_generation,
        plan_preauthorization=(
            resolved_preauthorization
            if isinstance(resolved_preauthorization, PlanPreauthorizationReceipt)
            else None
        ),
        release_intent_delivery_story=_normalize_optional(
            resolved_release_story if isinstance(resolved_release_story, str) else None
        ),
        release_intent=_normalize_release_intent(
            resolved_release_intent if isinstance(resolved_release_intent, str) else None
        ),
    )
    if not preauthorization_was_explicit:
        cursor = replace(
            cursor,
            plan_preauthorization=_invalidate_for_coordinate_change(previous, cursor),
        )
    metadata = _serialize_cursor(cursor)
    if expected_cursor is not None:
        if expected_cursor.journey != normalized_journey:
            raise ValueError("expected cursor journey does not match")
        swapped = store.compare_and_swap_runtime_session_metadata(
            _session_id(normalized_journey),
            expected_metadata=_serialize_cursor(expected_cursor),
            metadata=metadata,
        )
        if not swapped:
            raise DeliveryCursorConflict("delivery cursor changed before atomic update")
    else:
        store.upsert_runtime_session(
            _session_id(normalized_journey),
            interface="builder_delivery_cursor",
            journey=normalized_journey,
            active=True,
            metadata=metadata,
        )
    if refresh_projection and _projected_active_work(previous) != _projected_active_work(cursor):
        store.request_projection_refresh(normalized_journey)
    return cursor


def clear_delivery_cursor(store: Store, journey: str) -> None:
    """Clear the Builder delivery cursor for a journey."""
    normalized_journey = _normalize_required(journey, "journey")
    previous = get_delivery_cursor(store, normalized_journey)
    store.upsert_runtime_session(
        _session_id(normalized_journey),
        interface="builder_delivery_cursor",
        journey=normalized_journey,
        active=False,
        metadata=None,
    )
    if _projected_active_work(previous) is not None:
        store.request_projection_refresh(normalized_journey)


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


def _projected_active_work(
    cursor: BuilderDeliveryCursor | None,
) -> tuple[str, str | None, str | None, str] | None:
    if cursor is None or cursor.active_item is None:
        return None
    return (
        cursor.active_item,
        cursor.active_checkpoint,
        cursor.pending_confirmation,
        cursor.last_delivery_event or "active",
    )


def _session_id(journey: str) -> str:
    return f"{_CURSOR_SESSION_PREFIX}{journey}"


def _serialize_cursor(cursor: BuilderDeliveryCursor) -> str:
    return json.dumps(
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
            "cursor_generation": cursor.cursor_generation,
            "plan_preauthorization": (
                asdict(cursor.plan_preauthorization)
                if cursor.plan_preauthorization is not None
                else None
            ),
            "release_intent_delivery_story": cursor.release_intent_delivery_story,
            "release_intent": cursor.release_intent,
        },
        ensure_ascii=False,
    )


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


def _normalize_release_intent(value: str | None) -> str | None:
    normalized = _normalize_optional(value)
    if normalized is None:
        return None
    if normalized not in {"planned", "none", "undecided"}:
        raise ValueError("release_intent must be planned, none, or undecided")
    return normalized


def _optional_release_intent(value: object) -> str | None:
    normalized = _optional_string(value)
    return normalized if normalized in {"planned", "none", "undecided"} else None


def _optional_string_tuple(value: object) -> tuple[str, ...]:
    if not isinstance(value, (list, tuple)):
        return ()
    normalized: list[str] = []
    for item in value:
        if isinstance(item, str) and item.strip():
            normalized.append(item.strip())
    return tuple(normalized)


def _normalize_nonnegative_int(value: int | None) -> int:
    if value is None:
        return 0
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError("cursor_generation must be a non-negative integer")
    return value


def _optional_nonnegative_int(value: object) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        return 0
    return value


def _deserialize_preauthorization(value: object) -> PlanPreauthorizationReceipt | None:
    if not isinstance(value, dict):
        return None
    required_strings = (
        "journey",
        "method",
        "active_item",
        "active_item_level",
        "flow_unit",
        "plan_contract_version",
        "policy",
        "stop_boundary",
        "scope_fingerprint",
    )
    strings = {name: _optional_string(value.get(name)) for name in required_strings}
    generation = value.get("cursor_generation")
    status = _optional_string(value.get("status")) or "pending"
    reason = _optional_string(value.get("reason"))
    children = _optional_string_tuple(value.get("child_work_items"))
    if (
        any(item is None for item in strings.values())
        or isinstance(generation, bool)
        or not isinstance(generation, int)
        or generation < 0
        or (strings["flow_unit"] == "delivery_story" and not children)
        or status not in {"pending", "consumed", "invalidated"}
    ):
        return None
    return PlanPreauthorizationReceipt(
        journey=strings["journey"] or "",
        method=strings["method"] or "",
        cursor_generation=generation,
        active_item=strings["active_item"] or "",
        active_item_level=strings["active_item_level"] or "",
        flow_unit=strings["flow_unit"] or "",
        child_work_items=children,
        plan_contract_version=strings["plan_contract_version"] or "",
        policy=strings["policy"] or "",
        stop_boundary=strings["stop_boundary"] or "",
        scope_fingerprint=strings["scope_fingerprint"] or "",
        status=status,
        reason=reason,
    )


def _invalidate_for_coordinate_change(
    previous: BuilderDeliveryCursor | None,
    current: BuilderDeliveryCursor,
) -> PlanPreauthorizationReceipt | None:
    receipt = current.plan_preauthorization
    if previous is None or receipt is None or receipt.status != "pending":
        return receipt
    reason: str | None = None
    if previous.cursor_generation != current.cursor_generation:
        reason = "cursor_generation_changed"
    elif previous.active_item != current.active_item:
        reason = "active_item_changed"
    elif previous.active_item_level != current.active_item_level:
        reason = "active_item_level_changed"
    elif previous.navigator_flow_unit != current.navigator_flow_unit:
        reason = "flow_unit_changed"
    elif set(previous.child_work_items) != set(current.child_work_items):
        reason = "child_scope_changed"
    if reason is None:
        return receipt
    return replace(receipt, status="invalidated", reason=reason)
