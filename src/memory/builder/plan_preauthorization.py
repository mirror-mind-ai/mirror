"""Shared bounded authority primitives for conditional Ariad Plan approval."""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import replace
from pathlib import Path

from memory.builder.delivery_cursor import (
    BuilderDeliveryCursor,
    DeliveryCursorConflict,
    PlanPreauthorizationReceipt,
    set_delivery_cursor,
)
from memory.storage.store import Store

PREAUTHORIZATION_POLICY = "exact_scope"
PREAUTHORIZATION_STOP = "navigator_validation"
DELIVERY_STORY_PLAN_CONTRACT = "delivery_story_plan@1"
STORY_PLAN_CONTRACT = "story_plan@1"

STORY_PLAN_REQUIRED_SECTIONS = (
    "Scope",
    "Non-Goals",
    "Acceptance Behavior",
    "Validation Route",
    "Implementation Contract",
)
_PLACEHOLDER_LINE_RE = re.compile(
    r"^(?:[-*]\s+)?(?:this (?:section )?is (?:a )?)?placeholder(?:\b|$)",
    re.IGNORECASE,
)


class PlanPreauthorizationMismatch(ValueError):
    """A bounded structural mismatch prevented conditional Plan approval."""

    def __init__(self, reason: str) -> None:
        self.reason = reason
        super().__init__(reason)


def create_plan_preauthorization_receipt(
    cursor: BuilderDeliveryCursor,
    *,
    method: str,
    plan_contract_version: str,
    child_work_items: tuple[str, ...] = (),
    stop_boundary: str = PREAUTHORIZATION_STOP,
) -> PlanPreauthorizationReceipt:
    """Create payload-free authority for the cursor's exact structural scope."""
    if not cursor.active_item or not cursor.active_item_level or not cursor.navigator_flow_unit:
        raise ValueError("complete active Plan coordinates are required")
    if stop_boundary != PREAUTHORIZATION_STOP:
        raise ValueError("unsupported Plan preauthorization stop boundary")
    children = canonical_child_scope(child_work_items)
    fingerprint = scope_fingerprint(
        journey=cursor.journey,
        method=method,
        cursor_generation=cursor.cursor_generation,
        active_item=cursor.active_item,
        active_item_level=cursor.active_item_level,
        flow_unit=cursor.navigator_flow_unit,
        child_work_items=children,
        plan_contract_version=plan_contract_version,
        stop_boundary=stop_boundary,
    )
    return PlanPreauthorizationReceipt(
        journey=cursor.journey,
        method=method,
        cursor_generation=cursor.cursor_generation,
        active_item=cursor.active_item,
        active_item_level=cursor.active_item_level,
        flow_unit=cursor.navigator_flow_unit,
        child_work_items=children,
        plan_contract_version=plan_contract_version,
        policy=PREAUTHORIZATION_POLICY,
        stop_boundary=stop_boundary,
        scope_fingerprint=fingerprint,
    )


def plan_preauthorization_mismatch_reason(
    cursor: BuilderDeliveryCursor,
    *,
    journey: str,
    method: str,
    flow_unit: str,
    child_work_items: tuple[str, ...],
    plan_contract_version: str,
    unfilled_sections: tuple[str, ...] = (),
) -> str | None:
    """Return one bounded reason when pending authority no longer matches."""
    receipt = cursor.plan_preauthorization
    if receipt is None:
        return "authorization_missing"
    if receipt.status != "pending":
        return receipt.reason or "authorization_not_pending"
    expected_children = canonical_child_scope(child_work_items)
    checks = (
        (receipt.journey == journey, "journey_changed"),
        (receipt.method == method, "method_changed"),
        (receipt.cursor_generation == cursor.cursor_generation, "cursor_generation_changed"),
        (receipt.active_item == cursor.active_item, "active_item_changed"),
        (receipt.active_item_level == cursor.active_item_level, "active_item_level_changed"),
        (receipt.flow_unit == cursor.navigator_flow_unit == flow_unit, "flow_unit_changed"),
        (receipt.child_work_items == expected_children, "child_scope_changed"),
        (receipt.plan_contract_version == plan_contract_version, "plan_contract_changed"),
        (receipt.policy == PREAUTHORIZATION_POLICY, "policy_changed"),
        (receipt.stop_boundary == PREAUTHORIZATION_STOP, "stop_boundary_changed"),
    )
    for matches, reason in checks:
        if not matches:
            return reason
    expected_fingerprint = scope_fingerprint(
        journey=receipt.journey,
        method=receipt.method,
        cursor_generation=receipt.cursor_generation,
        active_item=receipt.active_item,
        active_item_level=receipt.active_item_level,
        flow_unit=receipt.flow_unit,
        child_work_items=receipt.child_work_items,
        plan_contract_version=receipt.plan_contract_version,
        stop_boundary=receipt.stop_boundary,
    )
    if receipt.scope_fingerprint != expected_fingerprint:
        return "scope_fingerprint_changed"
    if unfilled_sections:
        return "plan_incomplete"
    return None


def invalidate_plan_preauthorization(
    store: Store,
    cursor: BuilderDeliveryCursor,
    *,
    reason: str,
) -> BuilderDeliveryCursor:
    """Invalidate the observed pending receipt without crossing its Plan gate."""
    receipt = cursor.plan_preauthorization
    if receipt is None or receipt.status != "pending":
        return cursor
    try:
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
            plan_preauthorization=replace(receipt, status="invalidated", reason=reason),
            expected_cursor=cursor,
            refresh_projection=False,
        )
    except DeliveryCursorConflict:
        return cursor


def unfilled_plan_sections_for(
    plan_path: Path | None,
    *,
    required_sections: tuple[str, ...],
) -> tuple[str, ...]:
    """Inspect required level-two sections without interpreting Plan prose."""
    if plan_path is None or not plan_path.exists():
        return required_sections
    sections = _level_two_sections(plan_path.read_text(encoding="utf-8"))
    unfilled: list[str] = []
    for header in required_sections:
        body = sections.get(header, "").strip()
        lines = tuple(line.strip().casefold() for line in body.splitlines() if line.strip())
        if (
            not body
            or any(line.startswith("pending") for line in lines)
            or any(line in {"todo", "tbd", "...", "n/a", "none"} for line in lines)
            or any(_PLACEHOLDER_LINE_RE.match(line) for line in lines)
        ):
            unfilled.append(header)
    return tuple(unfilled)


def scope_fingerprint(
    *,
    journey: str,
    method: str,
    cursor_generation: int,
    active_item: str,
    active_item_level: str,
    flow_unit: str,
    child_work_items: tuple[str, ...],
    plan_contract_version: str,
    stop_boundary: str,
) -> str:
    """Hash canonical bounded coordinates; never include prompt or Plan payloads."""
    payload = {
        "journey": journey,
        "method": method,
        "cursor_generation": cursor_generation,
        "active_item": active_item,
        "active_item_level": active_item_level,
        "flow_unit": flow_unit,
        "child_work_items": list(child_work_items),
        "plan_contract_version": plan_contract_version,
        "policy": PREAUTHORIZATION_POLICY,
        "stop_boundary": stop_boundary,
    }
    canonical = json.dumps(payload, ensure_ascii=True, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def canonical_child_scope(items: tuple[str, ...]) -> tuple[str, ...]:
    """Compare child scope as a set while retaining deterministic storage."""
    return tuple(sorted({item.strip() for item in items if item.strip()}))


def _level_two_sections(plan_text: str) -> dict[str, str]:
    sections: dict[str, list[str]] = {}
    current: str | None = None
    for line in plan_text.splitlines():
        if line.startswith("## "):
            current = line[3:].strip()
            sections.setdefault(current, [])
        elif current is not None:
            sections[current].append(line)
    return {header: "\n".join(lines) for header, lines in sections.items()}
