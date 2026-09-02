"""Conditional Plan authority for implementable Ariad stories."""

from __future__ import annotations

from dataclasses import dataclass, replace
from pathlib import Path

from memory.builder.delivery_cursor import (
    BuilderDeliveryCursor,
    DeliveryCursorConflict,
    get_delivery_cursor,
    set_delivery_cursor,
)
from memory.builder.flow_unit import FLOW_UNIT_STORY_BY_STORY
from memory.builder.plan_preauthorization import (
    STORY_PLAN_CONTRACT,
    STORY_PLAN_REQUIRED_SECTIONS,
    PlanPreauthorizationMismatch,
    invalidate_plan_preauthorization,
    plan_preauthorization_mismatch_reason,
    unfilled_plan_sections_for,
)
from memory.builder.surface_protocol import wrap_ariad_surface
from memory.storage.store import Store


@dataclass(frozen=True)
class StoryPlanPreauthorizationReport:
    """Result of conditionally consuming one exact story Plan receipt."""

    cursor: BuilderDeliveryCursor
    status: str
    unfilled_sections: tuple[str, ...] = ()
    implementation_started: bool = False


def approve_story_plan_with_preauthorization(
    store: Store,
    *,
    journey: str,
    method: str,
    plan_artifact_path: Path | None,
) -> StoryPlanPreauthorizationReport:
    """Atomically consume exact story authority with Plan approval."""
    cursor = get_delivery_cursor(store, journey)
    if cursor is None:
        raise ValueError("delivery cursor is required before story Plan approval")
    if _is_consumed_story_approval(cursor):
        return StoryPlanPreauthorizationReport(cursor=cursor, status="already_approved")
    if cursor.active_item_level not in {"user_story", "technical_story"}:
        raise ValueError("story Plan preauthorization requires a User or Technical Story")
    if (
        cursor.active_checkpoint != "after_plan"
        or cursor.pending_confirmation != "navigator_approval"
    ):
        raise ValueError("story Plan approval requires a pending after_plan checkpoint")
    unfilled = unfilled_plan_sections_for(
        plan_artifact_path,
        required_sections=STORY_PLAN_REQUIRED_SECTIONS,
    )
    mismatch = plan_preauthorization_mismatch_reason(
        cursor,
        journey=journey,
        method=method,
        flow_unit=FLOW_UNIT_STORY_BY_STORY,
        child_work_items=(),
        plan_contract_version=STORY_PLAN_CONTRACT,
        unfilled_sections=unfilled,
    )
    if mismatch is not None:
        invalidate_plan_preauthorization(store, cursor, reason=mismatch)
        raise PlanPreauthorizationMismatch(mismatch)
    receipt = cursor.plan_preauthorization
    if receipt is None:  # pragma: no cover - mismatch guard establishes this
        raise PlanPreauthorizationMismatch("authorization_missing")
    try:
        updated = set_delivery_cursor(
            store,
            journey=journey,
            method=method,
            active_item=cursor.active_item,
            active_item_title=cursor.active_item_title,
            active_item_level=cursor.active_item_level,
            active_checkpoint=None,
            pending_confirmation=None,
            last_delivery_event="plan_approved",
            cadence_profile=cursor.cadence_profile,
            cadence_limits=cursor.cadence_limits,
            granularity_decision=cursor.granularity_decision,
            navigator_flow_unit=cursor.navigator_flow_unit,
            child_work_items=cursor.child_work_items,
            aggregate_checkpoint_status=cursor.aggregate_checkpoint_status,
            cursor_generation=cursor.cursor_generation,
            plan_preauthorization=replace(receipt, status="consumed", reason=None),
            expected_cursor=cursor,
            refresh_projection=False,
        )
    except DeliveryCursorConflict:
        current = get_delivery_cursor(store, journey)
        if current is not None and _is_consumed_story_approval(current):
            return StoryPlanPreauthorizationReport(cursor=current, status="already_approved")
        raise PlanPreauthorizationMismatch("cursor_changed") from None
    store.request_projection_refresh(journey)
    return StoryPlanPreauthorizationReport(
        cursor=updated,
        status="approved",
        unfilled_sections=unfilled,
        implementation_started=True,
    )


def cancel_story_plan_preauthorization(
    store: Store,
    *,
    journey: str,
    method: str,
) -> BuilderDeliveryCursor:
    """Cancel pending story authority while retaining ordinary Plan approval."""
    cursor = get_delivery_cursor(store, journey)
    if cursor is None:
        raise ValueError("delivery cursor is required before Plan preauthorization cancellation")
    if cursor.method != method:
        raise ValueError("active Builder method does not match cancellation method")
    if cursor.active_item_level not in {"user_story", "technical_story"}:
        raise ValueError("story Plan cancellation requires a User or Technical Story")
    receipt = cursor.plan_preauthorization
    if receipt is None or receipt.status != "pending":
        raise ValueError("pending Plan preauthorization is required before cancellation")
    return invalidate_plan_preauthorization(store, cursor, reason="navigator_cancelled")


def render_story_plan_preauthorization_recorded(cursor: BuilderDeliveryCursor) -> str:
    """Render story authority using bounded structural coordinates only."""
    receipt = cursor.plan_preauthorization
    if receipt is None:
        raise ValueError("Plan preauthorization receipt is required")
    body = "\n".join(
        [
            "Delivery",
            "",
            "╭────────────────────────────────────────────────────────╮",
            "│        🧭  PLAN PREAUTHORIZATION RECORDED              │",
            "│                                                        │",
            _card_text("Authorized story"),
            _card_text(receipt.active_item),
            "│                                                        │",
            _card_text("Story level"),
            _card_text(receipt.active_item_level),
            "│                                                        │",
            _card_text("Policy"),
            _card_text(receipt.policy),
            "│                                                        │",
            _card_text("Fixed stop"),
            _card_text(receipt.stop_boundary),
            "│                                                        │",
            _card_text("Boundary"),
            _card_text("Single-use authority remains pending until the"),
            _card_text("Driver completes the exact story Plan."),
            "╰────────────────────────────────────────────────────────╯",
        ]
    )
    return wrap_ariad_surface("plan_preauthorization_recorded", body + "\n")


def render_story_implementation_started(cursor: BuilderDeliveryCursor) -> str:
    """Render the single local implementation start after story approval."""
    body = "\n".join(
        [
            "Delivery",
            "",
            "╭────────────────────────────────────────────────────────╮",
            "│        🟧  IMPLEMENTATION STARTED                     │",
            "│                                                        │",
            _card_text("Active story"),
            _card_text(cursor.active_item or "none"),
            "│                                                        │",
            _card_text("Boundary"),
            _card_text("Local implementation may proceed under the exact"),
            _card_text("approved Plan and stops at Navigator Validation."),
            "╰────────────────────────────────────────────────────────╯",
        ]
    )
    return wrap_ariad_surface("implementation_started", body + "\n")


def render_story_preauthorization_already_consumed(cursor: BuilderDeliveryCursor) -> str:
    """Render an idempotent retry without another implementation start."""
    body = "\n".join(
        [
            "Delivery",
            "",
            "╭────────────────────────────────────────────────────────╮",
            "│        ✓  PLAN PREAUTHORIZATION ALREADY CONSUMED       │",
            "│                                                        │",
            _card_text("Active story"),
            _card_text(cursor.active_item or "none"),
            "│                                                        │",
            _card_text("Outcome"),
            _card_text("No approval or implementation start was repeated."),
            "╰────────────────────────────────────────────────────────╯",
        ]
    )
    return wrap_ariad_surface("plan_preauthorization_already_consumed", body + "\n")


def render_story_plan_preauthorization_mismatch(*, active_item: str | None, reason: str) -> str:
    """Render payload-free fallback to ordinary story Plan approval."""
    body = "\n".join(
        [
            "Delivery",
            "",
            "╭────────────────────────────────────────────────────────╮",
            "│        ✕  PLAN PREAUTHORIZATION MISMATCH               │",
            "│                                                        │",
            _card_text("Active story"),
            _card_text(active_item or "none"),
            "│                                                        │",
            _card_text("Reason"),
            _card_text(reason),
            "│                                                        │",
            _card_text("Fallback"),
            _card_text("Ordinary Navigator Plan approval remains required."),
            "╰────────────────────────────────────────────────────────╯",
        ]
    )
    return wrap_ariad_surface("plan_preauthorization_mismatch", body + "\n")


def _is_consumed_story_approval(cursor: BuilderDeliveryCursor) -> bool:
    receipt = cursor.plan_preauthorization
    return bool(
        receipt is not None
        and receipt.status == "consumed"
        and receipt.plan_contract_version == STORY_PLAN_CONTRACT
        and cursor.last_delivery_event == "plan_approved"
        and cursor.active_checkpoint is None
        and cursor.pending_confirmation is None
    )


def _card_text(text: str) -> str:
    value = text[:54]
    return f"│ {value:<54} │"
