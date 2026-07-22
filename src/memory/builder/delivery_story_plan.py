"""Delivery Story-level Plan checkpoint helpers for Ariad Builder."""

from __future__ import annotations

from dataclasses import dataclass, replace
from pathlib import Path

from memory.builder.artifact_surfaces import (
    MaterializedArtifact,
    existing_artifact,
    materialized_artifact,
)
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
    materialized_artifacts: tuple[MaterializedArtifact, ...] = ()


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
    materialized = _write_delivery_story_package(report)
    return replace(report, materialized_artifacts=materialized)


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
    materialized = _write_delivery_story_package(report)
    return replace(report, materialized_artifacts=materialized)


def render_delivery_story_plan_report(report: DeliveryStoryPlanReport) -> str:
    """Render a deterministic Ariad surface for a DS-level Plan checkpoint."""
    body = "\n".join(
        [
            "Delivery",
            _plan_ribbon(report),
            "",
            "╭────────────────────────────────────────────────────────╮",
            _card_text(_plan_title(report)),
            "│                                                        │",
            *_plan_body(report),
            "│                                                        │",
            _card_text("Next movement"),
            *_card_wrapped(_next_movement(report)),
            *_plan_closing_lines(report),
            "╰────────────────────────────────────────────────────────╯",
        ]
    )
    return wrap_ariad_surface("delivery_story_plan_checkpoint", body + "\n")


def render_delivery_story_implementation_started(report: DeliveryStoryPlanReport) -> str:
    """Render the handoff from Plan approval into implementation cadence."""
    body = "\n".join(
        [
            "Delivery",
            "Delivery Flow: ✓ Pull → ✓ Prepare → ✓ Expand → ✓ DS Plan → ◉ Implement → ○ Validate → ○ Debt Review → ○ Done",
            "",
            "╭────────────────────────────────────────────────────────╮",
            "│        🟧  IMPLEMENTATION STARTED                     │",
            "│                                                        │",
            _card_text("What changed?"),
            *_card_wrapped("The approved Delivery Story Plan now authorizes implementation work."),
            "│                                                        │",
            _card_text("Active delivery"),
            *_card_wrapped(_active_delivery(report)),
            "│                                                        │",
            _card_text("Work packages"),
            *_card_prefixed(report.child_work_items, "-"),
            "│                                                        │",
            _card_text("Boundary"),
            *_card_wrapped(
                "Implementation may mutate local project files under the approved plan. Push, release, deploy, purchase, or externally irreversible actions still require explicit Navigator authorization."
            ),
            "│                                                        │",
            _card_text("Driver action"),
            *_card_wrapped("Begin implementing the approved plan now."),
            "╰────────────────────────────────────────────────────────╯",
        ]
    )
    return wrap_ariad_surface("implementation_started", body + "\n")


def _plan_ribbon(report: DeliveryStoryPlanReport) -> str:
    if report.status == "approved":
        return "Delivery Flow: ✓ Pull → ✓ Prepare → ✓ Expand → ✓ DS Plan → ◉ Implement → ○ Validate → ○ Debt Review → ○ Done"
    return "Delivery Flow: ✓ Pull → ✓ Prepare → ✓ Expand → ◉ DS Plan → ○ Implement → ○ Validate → ○ Debt Review → ○ Done"


def _plan_title(report: DeliveryStoryPlanReport) -> str:
    if report.status == "approved":
        return "       🧭  DELIVERY STORY PLAN APPROVED"
    return "       🧭  DELIVERY STORY PLAN"


def _plan_body(report: DeliveryStoryPlanReport) -> list[str]:
    if report.status == "approved":
        return [
            _card_text("What was approved?"),
            *_card_wrapped(_active_delivery(report)),
            "│                                                        │",
            _card_text("Approved work packages"),
            *_card_prefixed(report.child_work_items, "-"),
        ]
    return [
        _card_text("What is being planned?"),
        *_card_wrapped(_active_delivery(report)),
        "│                                                        │",
        _card_text("Plan objective"),
        *_card_wrapped(report.objective),
        "│                                                        │",
        _card_text("Work packages"),
        *_card_prefixed(report.child_work_items, "-"),
    ]


def _plan_closing_lines(report: DeliveryStoryPlanReport) -> list[str]:
    if report.status == "approved":
        return []
    return [
        "│                                                        │",
        *_card_wrapped("Choose the next move when ready."),
    ]


def _active_delivery(report: DeliveryStoryPlanReport) -> str:
    title = f" — {report.delivery_story_title}" if report.delivery_story_title else ""
    return f"🟦[{report.delivery_story}]{title}"


def _next_movement(report: DeliveryStoryPlanReport) -> str:
    if report.status == "approved":
        return "Begin implementation under the approved plan."
    return "Review the plan artifact, then approve or revise."


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


def _write_delivery_story_package(
    report: DeliveryStoryPlanReport,
) -> tuple[MaterializedArtifact, ...]:
    """Materialize the Delivery Story package and report the real disk action.

    ``plan.md`` is upserted on every call. ``index.md`` and ``test-guide.md`` are
    scaffolded only when absent, so hand-authored or Expand-generated content is
    never overwritten. The returned manifest reflects the actual action taken for
    each artifact so the ARTIFACTS_MATERIALIZED surface always matches disk.
    """
    plan_path = report.plan_artifact_path
    if plan_path is None:
        return ()
    parent = plan_path.parent
    parent.mkdir(parents=True, exist_ok=True)
    index_path = parent / "index.md"
    test_guide_path = parent / "test-guide.md"

    plan_existed = plan_path.exists()
    index_existed = index_path.exists()
    test_guide_existed = test_guide_path.exists()

    plan_path.write_text(_render_plan_artifact(report), encoding="utf-8")
    if not index_existed:
        index_path.write_text(_render_index_artifact(report), encoding="utf-8")
    if not test_guide_existed:
        test_guide_path.write_text(_render_test_guide_artifact(report), encoding="utf-8")

    return (
        _package_artifact("story index", index_path, existed_before=index_existed),
        materialized_artifact("plan", plan_path, existed_before=plan_existed),
        _package_artifact("test guide", test_guide_path, existed_before=test_guide_existed),
    )


def _package_artifact(kind: str, path: Path, *, existed_before: bool) -> MaterializedArtifact:
    """Report an insert-if-absent artifact as preserved (existing) or created."""
    if existed_before:
        return existing_artifact(kind, path)
    return MaterializedArtifact(kind, path, "created")


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


def _render_index_artifact(report: DeliveryStoryPlanReport) -> str:
    title = report.delivery_story_title or report.delivery_story
    children = "\n".join(f"- {item}" for item in report.child_work_items) or "- none"
    return f"""[< Parent](../index.md)

# {report.delivery_story} \u2014 {title}

**Status:** \U0001f7e1 Planned
**Type:** Delivery Story

---

## Outcome

{report.objective}

## Child Work Packages

{children}

## Done Condition

The Delivery Story is done when its child work packages produce a coherent delivery outcome.

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
"""


def _render_test_guide_artifact(report: DeliveryStoryPlanReport) -> str:
    children = "\n".join(f"- {item}" for item in report.child_work_items) or "- none"
    return f"""[< Story](index.md)

# Test Guide \u2014 {report.delivery_story}

## Aggregate Validation

Pending aggregate Delivery Story validation across child work packages.

## Child Work Packages

{children}

## Navigator Validation

Provide the Navigator-visible route with expected observation, pass condition, and fail condition before the Delivery Story can pass aggregate Validation.

## Validation Evidence

Pending implementation and validation.
"""


def _normalize_items(items: tuple[str, ...]) -> tuple[str, ...]:
    return tuple(item.strip() for item in items if item.strip())


def _replace_status(existing: tuple[str, ...], checkpoint: str, status: str) -> tuple[str, ...]:
    prefix = f"{checkpoint}:"
    kept = tuple(item for item in existing if not item.startswith(prefix))
    return (*kept, f"{checkpoint}:{status}")
