"""Delivery Story-level validation and closure helpers for Ariad Builder."""

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

_CHECKPOINT_ARTIFACTS: tuple[tuple[str, str], ...] = (
    ("validation", "validation.md"),
    ("review", "review.md"),
    ("coherence", "coherence.md"),
    ("done", "done.md"),
)


@dataclass(frozen=True)
class DeliveryStoryClosureReport:
    journey: str
    method: str
    delivery_story: str
    delivery_story_title: str | None
    child_work_items: tuple[str, ...]
    checkpoint: str
    status: str
    summary: str
    cursor: BuilderDeliveryCursor
    artifact_path: Path | None = None


def validate_delivery_story(
    store: Store,
    *,
    journey: str,
    method: str,
    summary: str,
    navigator_accepted: bool = False,
    artifact_path: Path | None = None,
) -> DeliveryStoryClosureReport:
    cursor = _require_delivery_story_cursor(store, journey)
    _require_plan_approved(cursor)
    status = "passed" if navigator_accepted else "pending_navigator_validation"
    updated = _update_cursor(
        store,
        journey=journey,
        method=method,
        cursor=cursor,
        event="delivery_story_validation_complete"
        if navigator_accepted
        else "delivery_story_validation",
        active_checkpoint=None if navigator_accepted else "delivery_story_validation",
        pending_confirmation=None if navigator_accepted else "navigator_delivery_story_validation",
        checkpoint="validation",
        status=status,
    )
    report = _report(journey, method, cursor, "validation", status, summary, updated, artifact_path)
    _write_artifact(report)
    return report


def review_delivery_story(
    store: Store,
    *,
    journey: str,
    method: str,
    decision: str,
    summary: str,
    artifact_path: Path | None = None,
) -> DeliveryStoryClosureReport:
    cursor = _require_delivery_story_cursor(store, journey)
    _require_status(cursor, "validation", "passed")
    if decision not in {"no_action", "defer", "pay_now"}:
        raise ValueError("Delivery Story debt decision must be no_action, defer, or pay_now")
    status = f"review:{decision}"
    updated = _update_cursor(
        store,
        journey=journey,
        method=method,
        cursor=cursor,
        event="delivery_story_review_complete",
        active_checkpoint=None,
        pending_confirmation=None,
        checkpoint="debt_review",
        status=status,
    )
    report = _report(
        journey, method, cursor, "debt_review", status, summary, updated, artifact_path
    )
    _write_artifact(report)
    return report


def coherence_delivery_story(
    store: Store,
    *,
    journey: str,
    method: str,
    summary: str,
    artifact_path: Path | None = None,
) -> DeliveryStoryClosureReport:
    cursor = _require_delivery_story_cursor(store, journey)
    _require_prefix(cursor, "debt_review", "review:")
    updated = _update_cursor(
        store,
        journey=journey,
        method=method,
        cursor=cursor,
        event="delivery_story_coherence_complete",
        active_checkpoint=None,
        pending_confirmation=None,
        checkpoint="coherence",
        status="coherent",
    )
    report = _report(
        journey, method, cursor, "coherence", "coherent", summary, updated, artifact_path
    )
    _write_artifact(report)
    return report


def done_delivery_story(
    store: Store,
    *,
    journey: str,
    method: str,
    summary: str,
    artifact_path: Path | None = None,
) -> DeliveryStoryClosureReport:
    cursor = _require_delivery_story_cursor(store, journey)
    _require_prefix(cursor, "debt_review", "review:")
    statuses = _replace_status(cursor.aggregate_checkpoint_status, "coherence", "coherent")
    statuses = _replace_status(statuses, "done", "done")
    updated = set_delivery_cursor(
        store,
        journey=journey,
        method=method,
        active_item=cursor.active_item,
        active_item_title=cursor.active_item_title,
        active_item_level=cursor.active_item_level,
        active_checkpoint=None,
        pending_confirmation=None,
        last_delivery_event="delivery_story_done_complete",
        cadence_profile=cursor.cadence_profile,
        cadence_limits=cursor.cadence_limits,
        granularity_decision=cursor.granularity_decision,
        navigator_flow_unit=cursor.navigator_flow_unit,
        child_work_items=cursor.child_work_items,
        aggregate_checkpoint_status=statuses,
    )
    report = _report(journey, method, cursor, "done", "done", summary, updated, artifact_path)
    _write_artifact(report)
    return report


def render_delivery_story_closure_report(report: DeliveryStoryClosureReport) -> str:
    body = "\n".join(
        [
            "Delivery",
            _ribbon(report.checkpoint),
            "",
            "╭────────────────────────────────────────────────────────╮",
            _card_text(f"       🧪  DELIVERY STORY {_checkpoint_title(report.checkpoint)}"),
            "│                                                        │",
            _card_text(_what_happened_heading(report.checkpoint)),
            *_card_wrapped(_active_delivery(report)),
            "│                                                        │",
            _card_text("Evidence summary"),
            *_card_wrapped(report.summary),
            "│                                                        │",
            _card_text(_state_heading(report.checkpoint)),
            *_card_wrapped(_state_summary(report)),
            "│                                                        │",
            *_done_coherence_lines(report),
            _card_text("Next movement"),
            *_card_wrapped(_next_movement(report)),
            "╰────────────────────────────────────────────────────────╯",
        ]
    )
    return wrap_ariad_surface("delivery_story_closure_checkpoint", body + "\n")


def _checkpoint_title(checkpoint: str) -> str:
    return checkpoint.replace("_", " ").upper()


def _what_happened_heading(checkpoint: str) -> str:
    return {
        "validation": "What was validated?",
        "debt_review": "What was reviewed?",
        "coherence": "What was checked?",
        "done": "What was completed?",
    }.get(checkpoint, "What happened?")


def _done_coherence_lines(report: DeliveryStoryClosureReport) -> list[str]:
    if report.checkpoint != "done":
        return []
    return [
        "│                                                        │",
        _card_text("Coherence check"),
        *_card_wrapped(
            "Closure coherence passed: Done materialization, roadmap state, artifacts, and next-pull readiness were checked as part of Done."
        ),
        "│                                                        │",
    ]


def _active_delivery(report: DeliveryStoryClosureReport) -> str:
    title = f" — {report.delivery_story_title}" if report.delivery_story_title else ""
    return f"🟦[{report.delivery_story}]{title}"


def _state_heading(checkpoint: str) -> str:
    return {
        "validation": "Navigator validation",
        "debt_review": "Debt decision",
        "coherence": "Coherence state",
        "done": "Done state",
    }.get(checkpoint, "State")


def _state_summary(report: DeliveryStoryClosureReport) -> str:
    if report.checkpoint == "validation":
        if report.status == "passed":
            return "Navigator accepted validation."
        return "Awaiting Navigator validation acceptance."
    if report.checkpoint == "debt_review":
        return report.status.replace("review:", "")
    return report.status.replace("_", " ")


def _next_movement(report: DeliveryStoryClosureReport) -> str:
    if report.checkpoint == "validation":
        if report.status == "passed":
            return "Proceed to DS-level Debt Review."
        return "Accept validation before DS-level Debt Review."
    if report.checkpoint == "debt_review":
        return "Proceed to DS-level Done."
    if report.checkpoint == "coherence":
        return "Coherence is now checked inside Done for DS-level flow."
    if report.checkpoint == "done":
        return "Delivery Story closure is complete."
    return _boundary(report)


def _card_text(text: str) -> str:
    width = 54
    return f"│ {text[:width]:<{width}} │"


def _card_prefixed(items: tuple[str, ...], prefix: str) -> list[str]:
    if not items:
        return [_card_text("none")]
    lines: list[str] = []
    for item in items:
        normalized = item[2:] if item.startswith("- ") else item
        wrapped = _wrap_plain_text(normalized, width=52)
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


def _require_delivery_story_cursor(store: Store, journey: str) -> BuilderDeliveryCursor:
    cursor = get_delivery_cursor(store, journey)
    if cursor is None:
        raise ValueError("delivery cursor is required before Delivery Story closure")
    if cursor.active_item_level != "delivery_story":
        raise ValueError("Delivery Story closure requires an active Delivery Story")
    if cursor.navigator_flow_unit != FLOW_UNIT_DELIVERY_STORY:
        raise ValueError("Delivery Story closure requires navigator_flow_unit=delivery_story")
    if not cursor.active_item:
        raise ValueError("active Delivery Story is required before Delivery Story closure")
    if not cursor.child_work_items:
        raise ValueError("Delivery Story closure requires child work packages")
    return cursor


def _require_plan_approved(cursor: BuilderDeliveryCursor) -> None:
    _require_status(cursor, "plan", "approved")


def _require_status(cursor: BuilderDeliveryCursor, checkpoint: str, status: str) -> None:
    expected = f"{checkpoint}:{status}"
    if expected not in cursor.aggregate_checkpoint_status:
        raise ValueError(f"Delivery Story {checkpoint} requires aggregate status {expected}")


def _require_prefix(cursor: BuilderDeliveryCursor, checkpoint: str, prefix_status: str) -> None:
    prefix = f"{checkpoint}:{prefix_status}"
    if not any(item.startswith(prefix) for item in cursor.aggregate_checkpoint_status):
        raise ValueError(f"Delivery Story {checkpoint} requires aggregate status starting {prefix}")


def _update_cursor(
    store: Store,
    *,
    journey: str,
    method: str,
    cursor: BuilderDeliveryCursor,
    event: str,
    active_checkpoint: str | None,
    pending_confirmation: str | None,
    checkpoint: str,
    status: str,
) -> BuilderDeliveryCursor:
    return set_delivery_cursor(
        store,
        journey=journey,
        method=method,
        active_item=cursor.active_item,
        active_item_title=cursor.active_item_title,
        active_item_level=cursor.active_item_level,
        active_checkpoint=active_checkpoint,
        pending_confirmation=pending_confirmation,
        last_delivery_event=event,
        cadence_profile=cursor.cadence_profile,
        cadence_limits=cursor.cadence_limits,
        granularity_decision=cursor.granularity_decision,
        navigator_flow_unit=cursor.navigator_flow_unit,
        child_work_items=cursor.child_work_items,
        aggregate_checkpoint_status=_replace_status(
            cursor.aggregate_checkpoint_status, checkpoint, status
        ),
    )


def _replace_status(existing: tuple[str, ...], checkpoint: str, status: str) -> tuple[str, ...]:
    prefix = f"{checkpoint}:"
    kept = tuple(item for item in existing if not item.startswith(prefix))
    return (*kept, f"{checkpoint}:{status}")


def _report(
    journey: str,
    method: str,
    cursor: BuilderDeliveryCursor,
    checkpoint: str,
    status: str,
    summary: str,
    updated: BuilderDeliveryCursor,
    artifact_path: Path | None = None,
) -> DeliveryStoryClosureReport:
    return DeliveryStoryClosureReport(
        journey=journey,
        method=method,
        delivery_story=cursor.active_item or "none",
        delivery_story_title=cursor.active_item_title,
        child_work_items=cursor.child_work_items,
        checkpoint=checkpoint,
        status=status,
        summary=summary.strip() or "none",
        cursor=updated,
        artifact_path=artifact_path,
    )


def _write_artifact(report: DeliveryStoryClosureReport) -> None:
    if report.artifact_path is None:
        return
    report.artifact_path.parent.mkdir(parents=True, exist_ok=True)
    report.artifact_path.write_text(_render_artifact(report), encoding="utf-8")


def _render_artifact(report: DeliveryStoryClosureReport) -> str:
    title = report.checkpoint.replace("_", " ").title()
    child_items = "\n".join(f"- {item}" for item in report.child_work_items)
    return f"""# {title} — {report.delivery_story}

## Status

{report.status}

## Summary

{report.summary}

## Child Work Packages

{child_items or "- none"}

## Boundary

{_boundary(report)}
"""


def _ribbon(checkpoint: str) -> str:
    if checkpoint == "validation":
        return "Delivery Flow: ✓ Pull → ✓ Prepare → ✓ Expand → ✓ DS Plan → ✓ Implement → ◉ Validate → ○ Debt Review → ○ Done"
    if checkpoint == "debt_review":
        return "Delivery Flow: ✓ Pull → ✓ Prepare → ✓ Expand → ✓ DS Plan → ✓ Implement → ✓ Validate → ◉ Debt Review → ○ Done"
    if checkpoint == "done":
        return "Delivery Flow: ✓ Pull → ✓ Prepare → ✓ Expand → ✓ DS Plan → ✓ Implement → ✓ Validate → ✓ Debt Review → ◉ Done"
    return "Delivery Flow: ✓ Pull → ✓ Prepare → ✓ Expand → ✓ DS Plan → ✓ Implement → ✓ Validate → ✓ Debt Review → ◉ Done"


def _boundary(report: DeliveryStoryClosureReport) -> str:
    if report.checkpoint == "validation" and report.status != "passed":
        return "Do not proceed to DS-level Debt Review until Navigator validation is accepted."
    if report.checkpoint == "done":
        return "Delivery Story closure is complete; push and release remain separate hard gates."
    return "No push or release action is authorized by this checkpoint."
