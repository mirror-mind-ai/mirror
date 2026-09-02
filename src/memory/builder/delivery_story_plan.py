"""Delivery Story-level Plan checkpoint helpers for Ariad Builder."""

from __future__ import annotations

from dataclasses import dataclass, replace
from pathlib import Path

from memory.builder.artifact_surfaces import (
    MaterializedArtifact,
    existing_artifact,
)
from memory.builder.delivery_cursor import (
    BuilderDeliveryCursor,
    DeliveryCursorConflict,
    PlanPreauthorizationReceipt,
    get_delivery_cursor,
    set_delivery_cursor,
)
from memory.builder.flow_unit import FLOW_UNIT_DELIVERY_STORY
from memory.builder.plan_preauthorization import (
    DELIVERY_STORY_PLAN_CONTRACT,
    PREAUTHORIZATION_POLICY,
    PREAUTHORIZATION_STOP,
    PlanPreauthorizationMismatch,
    canonical_child_scope,
    create_plan_preauthorization_receipt,
    invalidate_plan_preauthorization,
    plan_preauthorization_mismatch_reason,
)
from memory.builder.surface_protocol import wrap_ariad_surface
from memory.storage.store import Store

_PLAN_CONTRACT_VERSION = DELIVERY_STORY_PLAN_CONTRACT
_PREAUTHORIZATION_POLICY = PREAUTHORIZATION_POLICY
_PREAUTHORIZATION_STOP = PREAUTHORIZATION_STOP


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
    unfilled_sections: tuple[str, ...] = ()
    implementation_started: bool = False


def plan_delivery_story_checkpoint(
    store: Store,
    *,
    journey: str,
    method: str,
    objective: str,
    child_work_items: tuple[str, ...] = (),
    plan_artifact_path: Path | None = None,
    preauthorize: bool = False,
    stop_boundary: str = _PREAUTHORIZATION_STOP,
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
    receipt = None
    if preauthorize:
        if stop_boundary != _PREAUTHORIZATION_STOP:
            raise ValueError("unsupported Plan preauthorization stop boundary")
        receipt = _create_preauthorization_receipt(
            cursor,
            method=method,
            child_work_items=children,
            stop_boundary=stop_boundary,
        )
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
        cursor_generation=cursor.cursor_generation,
        plan_preauthorization=receipt,
        refresh_projection=False,
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
    store.request_projection_refresh(journey)
    return replace(report, materialized_artifacts=materialized)


def approve_delivery_story_plan(
    store: Store,
    *,
    journey: str,
    method: str,
    plan_artifact_path: Path | None = None,
    use_preauthorization: bool = False,
) -> DeliveryStoryPlanReport:
    """Approve the active Delivery Story-level Plan checkpoint."""
    cursor = get_delivery_cursor(store, journey)
    if cursor is None:
        raise ValueError("delivery cursor is required before Delivery Story Plan approval")
    if use_preauthorization and _is_consumed_approval(cursor):
        return DeliveryStoryPlanReport(
            journey=journey,
            method=method,
            delivery_story=cursor.active_item or "",
            delivery_story_title=cursor.active_item_title,
            child_work_items=cursor.child_work_items,
            objective="Delivery Story Plan was already approved.",
            status="already_approved",
            cursor=cursor,
            plan_artifact_path=plan_artifact_path,
            implementation_started=False,
        )
    if cursor.active_checkpoint != "after_delivery_story_plan":
        raise ValueError(
            "Delivery Story Plan approval requires an after_delivery_story_plan checkpoint"
        )
    if cursor.pending_confirmation != "navigator_delivery_story_plan_approval":
        raise ValueError("Delivery Story Plan approval requires navigator approval")
    if not cursor.active_item:
        raise ValueError("active Delivery Story is required before Delivery Story Plan approval")
    unfilled = _unfilled_plan_sections_for(plan_artifact_path)
    if use_preauthorization:
        mismatch = _preauthorization_mismatch_reason(
            cursor,
            journey=journey,
            method=method,
            unfilled_sections=unfilled,
        )
        if mismatch is not None:
            _invalidate_preauthorization(store, cursor, reason=mismatch)
            raise PlanPreauthorizationMismatch(mismatch)
    receipt = cursor.plan_preauthorization
    if receipt is not None and receipt.status == "pending":
        receipt = replace(
            receipt,
            status="consumed" if use_preauthorization else "invalidated",
            reason=None if use_preauthorization else "ordinary_approval_used",
        )
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
            last_delivery_event="delivery_story_plan_approved",
            cadence_profile=cursor.cadence_profile,
            cadence_limits=cursor.cadence_limits,
            granularity_decision=cursor.granularity_decision,
            navigator_flow_unit=cursor.navigator_flow_unit,
            child_work_items=cursor.child_work_items,
            aggregate_checkpoint_status=_replace_status(
                cursor.aggregate_checkpoint_status, "plan", "approved"
            ),
            cursor_generation=cursor.cursor_generation,
            plan_preauthorization=receipt,
            expected_cursor=cursor if use_preauthorization else None,
            refresh_projection=False,
        )
    except DeliveryCursorConflict:
        current = get_delivery_cursor(store, journey)
        if use_preauthorization and current is not None and _is_consumed_approval(current):
            return DeliveryStoryPlanReport(
                journey=journey,
                method=method,
                delivery_story=current.active_item or "",
                delivery_story_title=current.active_item_title,
                child_work_items=current.child_work_items,
                objective="Delivery Story Plan was already approved.",
                status="already_approved",
                cursor=current,
                plan_artifact_path=plan_artifact_path,
                implementation_started=False,
            )
        if use_preauthorization:
            raise PlanPreauthorizationMismatch("cursor_changed") from None
        raise ValueError("delivery cursor changed before Plan approval") from None
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
        implementation_started=True,
    )
    materialized = _write_delivery_story_package(report)
    store.request_projection_refresh(journey)
    return replace(report, materialized_artifacts=materialized, unfilled_sections=unfilled)


def cancel_delivery_story_plan_preauthorization(
    store: Store,
    *,
    journey: str,
    method: str,
) -> BuilderDeliveryCursor:
    """Cancel pending conditional authority without changing the Plan gate."""
    cursor = get_delivery_cursor(store, journey)
    if cursor is None:
        raise ValueError("delivery cursor is required before Plan preauthorization cancellation")
    if cursor.method != method:
        raise ValueError("active Builder method does not match cancellation method")
    receipt = cursor.plan_preauthorization
    if receipt is None or receipt.status != "pending":
        raise ValueError("pending Plan preauthorization is required before cancellation")
    _invalidate_preauthorization(store, cursor, reason="navigator_cancelled")
    cancelled = get_delivery_cursor(store, journey)
    if cancelled is None:  # pragma: no cover - persistence invariant
        raise RuntimeError("delivery cursor disappeared during cancellation")
    return cancelled


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


def render_plan_preauthorization_recorded(report: DeliveryStoryPlanReport) -> str:
    """Render bounded structural authority without prompt or Plan payloads."""
    receipt = report.cursor.plan_preauthorization
    if receipt is None:
        raise ValueError("Plan preauthorization receipt is required")
    body = "\n".join(
        [
            "Delivery",
            "",
            "╭────────────────────────────────────────────────────────╮",
            "│        🧭  PLAN PREAUTHORIZATION RECORDED              │",
            "│                                                        │",
            _card_text("Authorized delivery"),
            *_card_wrapped(receipt.active_item),
            "│                                                        │",
            _card_text("Policy"),
            *_card_wrapped(receipt.policy),
            "│                                                        │",
            _card_text("Exact child set"),
            *_card_prefixed(receipt.child_work_items, "-"),
            "│                                                        │",
            _card_text("Fixed stop"),
            *_card_wrapped(receipt.stop_boundary),
            "│                                                        │",
            _card_text("Boundary"),
            *_card_wrapped(
                "Single-use authority remains pending until the Driver completes the Plan and every structural coordinate matches."
            ),
            "╰────────────────────────────────────────────────────────╯",
        ]
    )
    return wrap_ariad_surface("plan_preauthorization_recorded", body + "\n")


def render_plan_preauthorization_mismatch(*, active_item: str | None, reason: str) -> str:
    """Render a payload-free fallback to ordinary Plan approval."""
    body = "\n".join(
        [
            "Delivery",
            "",
            "╭────────────────────────────────────────────────────────╮",
            "│        ⛔  PLAN PREAUTHORIZATION NOT CONSUMED          │",
            "│                                                        │",
            _card_text("Active delivery"),
            *_card_wrapped(active_item or "none"),
            "│                                                        │",
            _card_text("Bounded reason"),
            *_card_wrapped(reason),
            "│                                                        │",
            _card_text("Result"),
            *_card_wrapped(
                "Plan approval remains blocked; ordinary Navigator approval is available."
            ),
            "╰────────────────────────────────────────────────────────╯",
        ]
    )
    return wrap_ariad_surface("plan_preauthorization_mismatch", body + "\n")


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
    if report.status in {"approved", "already_approved"}:
        return "       🧭  DELIVERY STORY PLAN APPROVED"
    return "       🧭  DELIVERY STORY PLAN"


def _plan_body(report: DeliveryStoryPlanReport) -> list[str]:
    if report.status in {"approved", "already_approved"}:
        approved = [
            _card_text("What was approved?"),
            *_card_wrapped(_active_delivery(report)),
            "│                                                        │",
            _card_text("Approved work packages"),
            *_card_prefixed(report.child_work_items, "-"),
        ]
        if report.unfilled_sections:
            approved.extend(
                [
                    "│                                                        │",
                    _card_text("Sections still pending"),
                    *_card_prefixed(report.unfilled_sections, "-"),
                ]
            )
        return approved
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
    if report.status in {"approved", "already_approved"}:
        return []
    return [
        "│                                                        │",
        *_card_wrapped("Choose the next move when ready."),
    ]


def _active_delivery(report: DeliveryStoryPlanReport) -> str:
    title = f" — {report.delivery_story_title}" if report.delivery_story_title else ""
    return f"🟦[{report.delivery_story}]{title}"


def _next_movement(report: DeliveryStoryPlanReport) -> str:
    if report.status == "already_approved":
        return "No transition was repeated; continue from the existing approved state."
    if report.status == "approved":
        return "Begin implementation under the approved plan."
    return "Review the plan artifact, then approve or revise."


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

    if report.status == "approved":
        # Approval blesses the authored plan without rewriting it; the Builder
        # delivery cursor owns approval state, so plan.md is preserved when it
        # already exists (created only as a fallback when absent).
        if not plan_existed:
            plan_path.write_text(_render_plan_artifact(report), encoding="utf-8")
        plan_artifact = _package_artifact("plan", plan_path, existed_before=plan_existed)
    else:
        if not plan_existed:
            plan_path.write_text(_render_plan_artifact(report), encoding="utf-8")
        plan_artifact = _package_artifact("plan", plan_path, existed_before=plan_existed)

    if not index_existed:
        index_path.write_text(_render_index_artifact(report), encoding="utf-8")
    if not test_guide_existed:
        test_guide_path.write_text(_render_test_guide_artifact(report), encoding="utf-8")

    return (
        _package_artifact("story index", index_path, existed_before=index_existed),
        plan_artifact,
        _package_artifact("test guide", test_guide_path, existed_before=test_guide_existed),
    )


def _package_artifact(kind: str, path: Path, *, existed_before: bool) -> MaterializedArtifact:
    """Report an insert-if-absent artifact as preserved (existing) or created."""
    if existed_before:
        return existing_artifact(kind, path)
    return MaterializedArtifact(kind, path, "created")


_PLAN_CONTRACT_SECTIONS: tuple[tuple[str, str], ...] = (
    ("Scope", "name what this Delivery Story delivers across its child work packages."),
    ("Non-Goals", "name what is explicitly out of scope for this Delivery Story."),
    (
        "Acceptance Behavior",
        "describe the aggregate observable outcome, using Given/When/Then when practical.",
    ),
    (
        "Validation Route",
        "describe how the aggregate delivery is validated, including whether E2E is required.",
    ),
    (
        "Implementation Contract",
        "record the constraints for child work: TDD for behavior changes, changes scoped to "
        "this Delivery Story's children, and no silent scope absorption.",
    ),
)


def _placeholder_line(guidance: str) -> str:
    return f"Pending — {guidance}"


def _plan_contract_section(header: str, guidance: str) -> str:
    return f"## {header}\n\n{_placeholder_line(guidance)}"


def _unfilled_plan_sections(plan_text: str) -> tuple[str, ...]:
    sections = _level_two_sections(plan_text)
    unfilled: list[str] = []
    for header, guidance in _PLAN_CONTRACT_SECTIONS:
        body = sections.get(header, "").strip()
        normalized = body.casefold()
        lines = tuple(line.strip().casefold() for line in body.splitlines() if line.strip())
        if (
            not body
            or _placeholder_line(guidance) in body
            or any(line.startswith("pending") for line in lines)
            or any(line in {"todo", "tbd", "...", "n/a", "none"} for line in lines)
            or "placeholder" in normalized
        ):
            unfilled.append(header)
    return tuple(unfilled)


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


def _unfilled_plan_sections_for(plan_path: Path | None) -> tuple[str, ...]:
    if plan_path is None or not plan_path.exists():
        return tuple(header for header, _guidance in _PLAN_CONTRACT_SECTIONS)
    return _unfilled_plan_sections(plan_path.read_text(encoding="utf-8"))


def _render_plan_artifact(report: DeliveryStoryPlanReport) -> str:
    child_items = "\n".join(f"- {item}" for item in report.child_work_items) or "- none"
    contract_sections = "\n\n".join(
        _plan_contract_section(header, guidance) for header, guidance in _PLAN_CONTRACT_SECTIONS
    )
    return f"""# Delivery Story Plan — {report.delivery_story}

**Journey:** {report.journey}
**Method:** {report.method}
**Navigator Flow Unit:** {FLOW_UNIT_DELIVERY_STORY}

## Delivery Story

{report.delivery_story_title or "Untitled Delivery Story"}

## Objective

{report.objective}

## Child Work Packages

{child_items}

{contract_sections}

---

_Approval and lifecycle state are tracked by the Builder runtime, not duplicated in this plan._
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


def _create_preauthorization_receipt(
    cursor: BuilderDeliveryCursor,
    *,
    method: str,
    child_work_items: tuple[str, ...],
    stop_boundary: str,
) -> PlanPreauthorizationReceipt:
    return create_plan_preauthorization_receipt(
        cursor,
        method=method,
        child_work_items=child_work_items,
        plan_contract_version=_PLAN_CONTRACT_VERSION,
        stop_boundary=stop_boundary,
    )


def _preauthorization_mismatch_reason(
    cursor: BuilderDeliveryCursor,
    *,
    journey: str,
    method: str,
    unfilled_sections: tuple[str, ...],
) -> str | None:
    return plan_preauthorization_mismatch_reason(
        cursor,
        journey=journey,
        method=method,
        flow_unit=FLOW_UNIT_DELIVERY_STORY,
        child_work_items=cursor.child_work_items,
        plan_contract_version=_PLAN_CONTRACT_VERSION,
        unfilled_sections=unfilled_sections,
    )


def _invalidate_preauthorization(
    store: Store,
    cursor: BuilderDeliveryCursor,
    *,
    reason: str,
) -> None:
    invalidate_plan_preauthorization(store, cursor, reason=reason)


def _is_consumed_approval(cursor: BuilderDeliveryCursor) -> bool:
    receipt = cursor.plan_preauthorization
    return bool(
        receipt is not None
        and receipt.status == "consumed"
        and cursor.last_delivery_event == "delivery_story_plan_approved"
        and "plan:approved" in cursor.aggregate_checkpoint_status
    )


def _canonical_children(items: tuple[str, ...]) -> tuple[str, ...]:
    return canonical_child_scope(items)


def _normalize_items(items: tuple[str, ...]) -> tuple[str, ...]:
    return tuple(item.strip() for item in items if item.strip())


def _replace_status(existing: tuple[str, ...], checkpoint: str, status: str) -> tuple[str, ...]:
    prefix = f"{checkpoint}:"
    kept = tuple(item for item in existing if not item.startswith(prefix))
    return (*kept, f"{checkpoint}:{status}")
