"""Delivery Story-level Plan checkpoint helpers for Ariad Builder."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from memory.builder.delivery_cursor import (
    BuilderDeliveryCursor,
    get_delivery_cursor,
    set_delivery_cursor,
)
from memory.builder.flow_unit import FLOW_UNIT_DELIVERY_STORY
from memory.builder.surface_protocol import wrap_ariad_surface
from memory.storage.store import Store


@dataclass(frozen=True)
class DeliveryStoryPlanReport:
    journey: str
    method: str
    delivery_story: str
    delivery_story_title: str | None
    child_work_items: tuple[str, ...]
    objective: str
    status: str
    cursor: BuilderDeliveryCursor
    plan_artifact_path: Path | None = None


def plan_delivery_story_checkpoint(
    store: Store,
    *,
    journey: str,
    method: str,
    objective: str,
    child_work_items: tuple[str, ...] = (),
    plan_artifact_path: Path | None = None,
) -> DeliveryStoryPlanReport:
    """Create a Delivery Story-level Plan checkpoint for aggregate flow."""
    cursor = get_delivery_cursor(store, journey)
    if cursor is None:
        raise ValueError("delivery cursor is required before Delivery Story Plan")
    if cursor.active_item_level != "delivery_story":
        raise ValueError("Delivery Story Plan requires an active Delivery Story")
    if cursor.navigator_flow_unit != FLOW_UNIT_DELIVERY_STORY:
        raise ValueError("Delivery Story Plan requires navigator_flow_unit=delivery_story")
    if not cursor.active_item:
        raise ValueError("active Delivery Story is required before Delivery Story Plan")
    children = _normalize_items(child_work_items) or cursor.child_work_items
    if not children:
        raise ValueError("Delivery Story Plan requires at least one child work item")
    normalized_objective = objective.strip()
    if not normalized_objective:
        raise ValueError("Delivery Story Plan objective must not be empty")
    updated = set_delivery_cursor(
        store,
        journey=journey,
        method=method,
        active_item=cursor.active_item,
        active_item_title=cursor.active_item_title,
        active_item_level=cursor.active_item_level,
        active_checkpoint="after_delivery_story_plan",
        pending_confirmation="navigator_delivery_story_plan_approval",
        last_delivery_event="delivery_story_plan",
        cadence_profile=cursor.cadence_profile,
        cadence_limits=cursor.cadence_limits,
        granularity_decision=cursor.granularity_decision,
        navigator_flow_unit=cursor.navigator_flow_unit,
        child_work_items=children,
        aggregate_checkpoint_status=_replace_status(
            cursor.aggregate_checkpoint_status, "plan", "pending"
        ),
    )
    report = DeliveryStoryPlanReport(
        journey=journey,
        method=method,
        delivery_story=cursor.active_item,
        delivery_story_title=cursor.active_item_title,
        child_work_items=children,
        objective=normalized_objective,
        status="pending_approval",
        cursor=updated,
        plan_artifact_path=plan_artifact_path,
    )
    _write_plan_artifact(report)
    return report


def approve_delivery_story_plan(
    store: Store,
    *,
    journey: str,
    method: str,
    plan_artifact_path: Path | None = None,
) -> DeliveryStoryPlanReport:
    """Approve the active Delivery Story-level Plan checkpoint."""
    cursor = get_delivery_cursor(store, journey)
    if cursor is None:
        raise ValueError("delivery cursor is required before Delivery Story Plan approval")
    if cursor.active_checkpoint != "after_delivery_story_plan":
        raise ValueError(
            "Delivery Story Plan approval requires an after_delivery_story_plan checkpoint"
        )
    if cursor.pending_confirmation != "navigator_delivery_story_plan_approval":
        raise ValueError("Delivery Story Plan approval requires navigator approval")
    if not cursor.active_item:
        raise ValueError("active Delivery Story is required before Delivery Story Plan approval")
    updated = set_delivery_cursor(
        store,
        journey=journey,
        method=method,
        active_item=cursor.active_item,
        active_item_title=cursor.active_item_title,
        active_item_level=cursor.active_item_level,
        active_checkpoint=None,
        pending_confirmation=None,
        last_delivery_event="delivery_story_plan_approved",
        cadence_profile=cursor.cadence_profile,
        cadence_limits=cursor.cadence_limits,
        granularity_decision=cursor.granularity_decision,
        navigator_flow_unit=cursor.navigator_flow_unit,
        child_work_items=cursor.child_work_items,
        aggregate_checkpoint_status=_replace_status(
            cursor.aggregate_checkpoint_status, "plan", "approved"
        ),
    )
    report = DeliveryStoryPlanReport(
        journey=journey,
        method=method,
        delivery_story=cursor.active_item,
        delivery_story_title=cursor.active_item_title,
        child_work_items=cursor.child_work_items,
        objective="Delivery Story Plan approved.",
        status="approved",
        cursor=updated,
        plan_artifact_path=plan_artifact_path,
    )
    _write_plan_artifact(report)
    return report


def render_delivery_story_plan_report(report: DeliveryStoryPlanReport) -> str:
    """Render a deterministic Ariad surface for a DS-level Plan checkpoint."""
    body = "\n".join(
        [
            "Delivery",
            "Ariad: ✓ Pull | ✓ Prepare | ✓ Expand | ◉ DS Plan | ○ Implement | ○ Validate | ○ Debt Review | ○ Coherence | ○ Done",
            "",
            "╭────────────────────────────────────────────────────────╮",
            "│        🧭■  DELIVERY STORY PLAN CHECKPOINT             │",
            "│                                                        │",
            _card_text("journey"),
            _card_text(report.journey),
            "│                                                        │",
            _card_text("delivery story"),
            _card_text(report.delivery_story),
            "│                                                        │",
            _card_text("delivery story title"),
            *_card_wrapped(report.delivery_story_title or "none"),
            "│                                                        │",
            _card_text("navigator flow unit"),
            _card_text(FLOW_UNIT_DELIVERY_STORY),
            "│                                                        │",
            _card_text("child work packages"),
            *_card_prefixed(report.child_work_items, "-"),
            "│                                                        │",
            _card_text("objective"),
            *_card_wrapped(report.objective),
            "│                                                        │",
            _card_text("status"),
            _card_text(report.status),
            "│                                                        │",
            _card_text("plan artifact"),
            *_card_wrapped(
                str(report.plan_artifact_path) if report.plan_artifact_path else "not materialized"
            ),
            "│                                                        │",
            _card_text("approval gate"),
            *_card_wrapped(
                "checkpoint: after_delivery_story_plan" if report.status != "approved" else "none"
            ),
            *_card_wrapped(
                "pending: navigator_delivery_story_plan_approval"
                if report.status != "approved"
                else "none"
            ),
            "│                                                        │",
            _card_text("boundary"),
            *_card_wrapped(_boundary(report)),
            "╰────────────────────────────────────────────────────────╯",
        ]
    )
    return wrap_ariad_surface("delivery_story_plan_checkpoint", body + "\n")


def _boundary(report: DeliveryStoryPlanReport) -> str:
    if report.status == "approved":
        return "DS-level Plan is approved; child work may proceed under the aggregate contract."
    return "Implementation remains blocked until the DS-level Plan is approved."


def _card_text(text: str) -> str:
    width = 54
    return f"│ {text[:width]:<{width}} │"


def _card_prefixed(items: tuple[str, ...], prefix: str) -> list[str]:
    if not items:
        return [_card_text("none")]
    lines: list[str] = []
    for item in items:
        wrapped = _wrap_plain_text(item, width=52)
        for index, line in enumerate(wrapped):
            marker = prefix if index == 0 else " "
            lines.append(_card_text(f"{marker} {line}"))
    return lines


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


def _write_plan_artifact(report: DeliveryStoryPlanReport) -> None:
    if report.plan_artifact_path is None:
        return
    report.plan_artifact_path.parent.mkdir(parents=True, exist_ok=True)
    report.plan_artifact_path.write_text(_render_plan_artifact(report), encoding="utf-8")


def _render_plan_artifact(report: DeliveryStoryPlanReport) -> str:
    child_items = "\n".join(f"- {item}" for item in report.child_work_items) or "- none"
    approval_gate = (
        "none"
        if report.status == "approved"
        else "checkpoint: after_delivery_story_plan; pending: navigator_delivery_story_plan_approval"
    )
    return f"""# Delivery Story Plan — {report.delivery_story}

**Status:** {report.status}
**Journey:** {report.journey}
**Method:** {report.method}
**Navigator Flow Unit:** {FLOW_UNIT_DELIVERY_STORY}

## Delivery Story

{report.delivery_story_title or "Untitled Delivery Story"}

## Objective

{report.objective}

## Child Work Packages

{child_items}

## Approval Gate

{approval_gate}

## Boundary

{_boundary(report)}
"""


def _normalize_items(items: tuple[str, ...]) -> tuple[str, ...]:
    return tuple(item.strip() for item in items if item.strip())


def _replace_status(existing: tuple[str, ...], checkpoint: str, status: str) -> tuple[str, ...]:
    prefix = f"{checkpoint}:"
    kept = tuple(item for item in existing if not item.startswith(prefix))
    return (*kept, f"{checkpoint}:{status}")
