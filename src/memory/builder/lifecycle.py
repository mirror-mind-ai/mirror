"""Contained Ariad lifecycle operations for Builder Mode."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from memory.builder.artifact_surfaces import MaterializedArtifact, existing_artifact
from memory.builder.delivery_cursor import (
    BuilderDeliveryCursor,
    get_delivery_cursor,
    set_delivery_cursor,
)
from memory.builder.lifecycle_ribbon import render_lifecycle_ribbon
from memory.builder.method_definition import ContractDefinition, MethodDefinition
from memory.builder.roadmap_grammar import strip_markdown_link as _strip_markdown_link
from memory.builder.surface_protocol import wrap_ariad_surface
from memory.storage.store import Store

_ALLOWED_PULL_LEVELS = ("delivery_story", "user_story", "technical_story")


@dataclass(frozen=True)
class BuilderLifecycleItem:
    code: str
    title: str
    level: str
    why_now: str


@dataclass(frozen=True)
class BuilderPullReport:
    journey: str
    method: str
    item: BuilderLifecycleItem
    cursor: BuilderDeliveryCursor
    next_event: str = "prepare"


@dataclass(frozen=True)
class BuilderPrepareReport:
    journey: str
    method: str
    active_item: str
    active_item_title: str | None
    active_item_level: str | None
    implementable_by_default: bool
    granularity_decision_required: bool
    context_summary: tuple[str, ...]
    story_shape_assessment: str
    risks: tuple[str, ...]
    applicable_rules: tuple[str, ...]
    cursor: BuilderDeliveryCursor
    next_event: str = "plan"


@dataclass(frozen=True)
class BuilderExpandReport:
    journey: str
    method: str
    delivery_story: str
    delivery_story_title: str
    materialized_paths: tuple[Path, ...]
    materialized_artifacts: tuple[MaterializedArtifact, ...]
    recommended_story: str
    recommended_story_title: str
    cursor: BuilderDeliveryCursor
    next_event: str = "plan"


@dataclass(frozen=True)
class BuilderPlanReport:
    journey: str
    method: str
    active_item: str
    active_item_title: str | None
    active_item_level: str | None
    implementable_by_default: bool
    objective: str
    scope: tuple[str, ...]
    non_goals: tuple[str, ...]
    acceptance_behavior: tuple[str, ...]
    validation_route: tuple[str, ...]
    e2e_decision: str
    plan_contract: ContractDefinition
    implement_contract: ContractDefinition
    validation_contract: ContractDefinition
    local_rules: tuple[str, ...]
    cursor: BuilderDeliveryCursor
    plan_artifact_path: Path | None = None
    next_event: str = "implement"


@dataclass(frozen=True)
class BuilderValidationReport:
    journey: str
    method: str
    active_item: str
    active_item_title: str | None
    automated_checks: tuple[str, ...]
    checks_status: str
    e2e_decision: str
    e2e_evidence: str | None
    navigator_validation_route: str
    navigator_accepted: bool
    expected_observation: str
    pass_condition: str
    fail_condition: str
    missing_evidence: tuple[str, ...]
    validation_contract: ContractDefinition
    cursor: BuilderDeliveryCursor
    validation_artifact_path: Path | None = None
    next_event: str = "debt_review"


@dataclass(frozen=True)
class BuilderReviewReport:
    journey: str
    method: str
    active_item: str
    active_item_title: str | None
    debt_findings: tuple[str, ...]
    debt_decision: str
    defer_reason: str | None
    revisit_trigger: str | None
    missing_decision: tuple[str, ...]
    debt_review_contract: ContractDefinition
    cursor: BuilderDeliveryCursor
    review_artifact_path: Path | None = None
    next_event: str = "coherence"


@dataclass(frozen=True)
class BuilderCoherenceReport:
    journey: str
    method: str
    active_item: str
    active_item_title: str | None
    process_alignment: str
    project_alignment: str
    product_alignment: str
    local_differences: tuple[str, ...]
    missing_coherence: tuple[str, ...]
    coherence_contract: ContractDefinition
    cursor: BuilderDeliveryCursor
    coherence_artifact_path: Path | None = None
    next_event: str = "done"


@dataclass(frozen=True)
class BuilderDoneReport:
    journey: str
    method: str
    active_item: str
    active_item_title: str | None
    history_action: str
    roadmap_update: str
    next_recommendation: str
    missing_done: tuple[str, ...]
    done_contract: ContractDefinition
    cursor: BuilderDeliveryCursor
    done_artifact_path: Path | None = None


def pull_lifecycle_item(
    store: Store,
    *,
    journey: str,
    method: str,
    item: BuilderLifecycleItem,
) -> BuilderPullReport:
    """Pull an item into active runtime cursor state without executing Prepare."""
    normalized_journey = _normalize_required(journey, "journey")
    normalized_method = _normalize_required(method, "method")
    normalized_item = _normalize_item(item)
    existing = get_delivery_cursor(store, normalized_journey)
    if existing is None:
        raise ValueError("delivery cursor is required before pull")
    # Replacing a different, previously-active item must not inherit that item's
    # child work packages or aggregate checkpoint status. A first pull (no prior
    # active item) or a re-pull of the same item keeps existing state.
    item_changed = existing.active_item is not None and existing.active_item != normalized_item.code
    child_work_items = () if item_changed else existing.child_work_items
    aggregate_checkpoint_status = () if item_changed else existing.aggregate_checkpoint_status
    cursor = set_delivery_cursor(
        store,
        journey=normalized_journey,
        method=normalized_method,
        active_item=normalized_item.code,
        active_item_title=normalized_item.title,
        active_item_level=normalized_item.level,
        active_checkpoint=None,
        pending_confirmation=None,
        last_delivery_event="pull",
        cadence_profile=existing.cadence_profile,
        cadence_limits=existing.cadence_limits,
        navigator_flow_unit=existing.navigator_flow_unit,
        child_work_items=child_work_items,
        aggregate_checkpoint_status=aggregate_checkpoint_status,
    )
    return BuilderPullReport(
        journey=normalized_journey,
        method=normalized_method,
        item=normalized_item,
        cursor=cursor,
    )


def prepare_lifecycle_item(
    store: Store,
    *,
    journey: str,
    method: str,
    project_path: Path | None = None,
) -> BuilderPrepareReport:
    """Prepare the pulled item and stop before Plan."""
    normalized_journey = _normalize_required(journey, "journey")
    normalized_method = _normalize_required(method, "method")
    existing = get_delivery_cursor(store, normalized_journey)
    if existing is None:
        raise ValueError("delivery cursor is required before prepare")
    if not existing.active_item:
        raise ValueError("active item is required before prepare")

    cursor = set_delivery_cursor(
        store,
        journey=normalized_journey,
        method=normalized_method,
        active_item=existing.active_item,
        active_item_title=existing.active_item_title,
        active_item_level=existing.active_item_level,
        active_checkpoint=None,
        pending_confirmation=None,
        last_delivery_event="prepare",
        cadence_profile=existing.cadence_profile,
        cadence_limits=existing.cadence_limits,
        navigator_flow_unit=existing.navigator_flow_unit,
        child_work_items=existing.child_work_items,
        aggregate_checkpoint_status=existing.aggregate_checkpoint_status,
    )
    return BuilderPrepareReport(
        journey=normalized_journey,
        method=normalized_method,
        active_item=existing.active_item,
        active_item_title=existing.active_item_title,
        active_item_level=existing.active_item_level,
        implementable_by_default=_is_implementable_by_default(existing.active_item_level),
        granularity_decision_required=not _is_implementable_by_default(existing.active_item_level),
        context_summary=_context_summary(project_path),
        story_shape_assessment=_story_shape_assessment(existing.active_item_level),
        risks=(
            "Scope may expand during Plan if the item mixes product and technical work.",
            "Implementation remains blocked until the Plan checkpoint is approved.",
        ),
        applicable_rules=(
            "Pull selects active work; Prepare reads terrain.",
            _next_event_rule(existing.active_item_level),
            "No Plan, Implement, Validation, Review, Coherence, or Done work is executed here.",
        ),
        cursor=cursor,
    )


def plan_lifecycle_item(
    store: Store,
    *,
    journey: str,
    method: MethodDefinition,
    objective: str | None = None,
    scope: tuple[str, ...] = (),
    non_goals: tuple[str, ...] = (),
    acceptance_behavior: tuple[str, ...] = (),
    validation_route: tuple[str, ...] = (),
    e2e_decision: str | None = None,
    local_rules: tuple[str, ...] = (),
    plan_artifact_path: Path | None = None,
) -> BuilderPlanReport:
    """Create the Plan checkpoint and block implementation pending approval."""
    normalized_journey = _normalize_required(journey, "journey")
    existing = get_delivery_cursor(store, normalized_journey)
    if existing is None:
        raise ValueError("delivery cursor is required before plan")
    if not existing.active_item:
        raise ValueError("active item is required before plan")
    if existing.last_delivery_event != "prepare":
        raise ValueError("Prepare must be completed before Plan")

    implementable = _is_implementable_by_default(existing.active_item_level)
    if not implementable:
        raise ValueError(
            "Plan requires a User Story or Technical Story; expand the Delivery Story first"
        )
    active_checkpoint = "after_plan"
    pending_confirmation = "navigator_approval"
    artifact_path = plan_artifact_path
    cursor = set_delivery_cursor(
        store,
        journey=normalized_journey,
        method=method.id,
        active_item=existing.active_item,
        active_item_title=existing.active_item_title,
        active_item_level=existing.active_item_level,
        active_checkpoint=active_checkpoint,
        pending_confirmation=pending_confirmation,
        last_delivery_event="plan",
        cadence_profile=existing.cadence_profile,
        cadence_limits=existing.cadence_limits,
        granularity_decision=None,
        navigator_flow_unit=existing.navigator_flow_unit,
        child_work_items=existing.child_work_items,
        aggregate_checkpoint_status=existing.aggregate_checkpoint_status,
    )
    report = BuilderPlanReport(
        journey=normalized_journey,
        method=method.id,
        active_item=existing.active_item,
        active_item_title=existing.active_item_title,
        active_item_level=existing.active_item_level,
        implementable_by_default=implementable,
        objective=(objective or "Confirm scope, validation route, and implementation contract."),
        scope=scope or ("Implement the smallest coherent slice for the active item.",),
        non_goals=non_goals or ("Do not silently absorb adjacent roadmap work.",),
        acceptance_behavior=acceptance_behavior
        or (
            "Given the relevant starting state",
            "When the Navigator exercises the planned behavior",
            "Then the expected observable outcome appears",
            "And important constraints still hold",
        ),
        validation_route=validation_route
        or (
            "Run automated checks required by the local guide.",
            "Provide a Navigator-visible validation route with expected observation and pass/fail condition.",
        ),
        e2e_decision=e2e_decision
        or "Decide explicitly before implementation whether E2E is required.",
        plan_contract=_contract_for(method, "plan_contract"),
        implement_contract=_contract_for(method, "implement_contract"),
        validation_contract=_contract_for(method, "validation_contract"),
        local_rules=local_rules,
        cursor=cursor,
        plan_artifact_path=artifact_path,
    )
    if artifact_path is not None:
        _write_story_package(artifact_path.parent, report)
    return report


def approve_plan_checkpoint(store: Store, *, journey: str, method: str) -> BuilderDeliveryCursor:
    """Approve a pending Plan checkpoint and allow implementation to begin."""
    normalized_journey = _normalize_required(journey, "journey")
    normalized_method = _normalize_required(method, "method")
    existing = get_delivery_cursor(store, normalized_journey)
    if existing is None:
        raise ValueError("delivery cursor is required before plan approval")
    if (
        existing.active_checkpoint != "after_plan"
        or existing.pending_confirmation != "navigator_approval"
    ):
        raise ValueError(
            "Plan approval requires a pending after_plan navigator_approval checkpoint"
        )
    return set_delivery_cursor(
        store,
        journey=normalized_journey,
        method=normalized_method,
        active_item=existing.active_item,
        active_item_title=existing.active_item_title,
        active_item_level=existing.active_item_level,
        active_checkpoint=None,
        pending_confirmation=None,
        last_delivery_event="plan_approved",
        cadence_profile=existing.cadence_profile,
        cadence_limits=existing.cadence_limits,
        granularity_decision=existing.granularity_decision,
        navigator_flow_unit=existing.navigator_flow_unit,
        child_work_items=existing.child_work_items,
        aggregate_checkpoint_status=existing.aggregate_checkpoint_status,
    )


def render_plan_approval(cursor: BuilderDeliveryCursor) -> str:
    body = "\n".join(
        [
            "Delivery",
            render_lifecycle_ribbon("implement"),
            "",
            "╭────────────────────────────────────────────────────────╮",
            "│        🟩■  PLAN APPROVED                              │",
            "│                                                        │",
            _card_text("active item"),
            _card_text(cursor.active_item or "none"),
            "│                                                        │",
            _card_text("last delivery event"),
            _card_text(cursor.last_delivery_event or "none"),
            "│                                                        │",
            _card_text("boundary"),
            *_card_wrapped("Implementation may begin under the approved Plan contract."),
            "╰────────────────────────────────────────────────────────╯",
        ]
    )
    return wrap_ariad_surface("plan_approved", body + "\n")


def expand_delivery_story(
    store: Store,
    *,
    journey: str,
    method: str,
    project_path: Path,
) -> BuilderExpandReport:
    """Expand an active Delivery Story into an implementable User Story recommendation."""
    normalized_journey = _normalize_required(journey, "journey")
    normalized_method = _normalize_required(method, "method")
    existing = get_delivery_cursor(store, normalized_journey)
    if existing is None:
        raise ValueError("delivery cursor is required before expand")
    if existing.active_item_level != "delivery_story":
        raise ValueError("expand requires an active Delivery Story")
    if not existing.active_item:
        raise ValueError("active item is required before expand")
    title = existing.active_item_title or existing.active_item
    ds_dir = _artifact_directory(project_path, existing.active_item, title)
    ds_index = ds_dir / "index.md"
    ds_exists = ds_index.exists()
    children = _parse_candidate_stories(ds_index.read_text(encoding="utf-8")) if ds_exists else []

    materialized_paths: list[Path] = [ds_index]
    materialized_artifacts: list[MaterializedArtifact] = []

    if children:
        recommended = _first_pending_child(children)
        recommended_code = recommended.code
        recommended_title = recommended.title
        ds_dir.mkdir(parents=True, exist_ok=True)
        if not ds_exists:
            ds_index.write_text(
                _render_delivery_story_index(
                    existing.active_item, title, recommended_code, recommended_title
                ),
                encoding="utf-8",
            )
        materialized_artifacts.append(
            existing_artifact("DS package", ds_index)
            if ds_exists
            else MaterializedArtifact("DS package", ds_index, "created")
        )
        for child in children:
            child_index = _materialize_child_package(ds_dir, child)
            materialized_paths.append(child_index.path)
            materialized_artifacts.append(child_index.artifact)
        child_work_items = tuple(child.code for child in children)
    else:
        recommended_code = f"{existing.active_item}.US1"
        recommended_title = _title_leaf(title)
        us_dir = ds_dir / _story_folder_name(recommended_code, recommended_title)
        us_index = us_dir / "index.md"
        ds_dir.mkdir(parents=True, exist_ok=True)
        us_dir.mkdir(parents=True, exist_ok=True)
        us_exists = us_index.exists()
        if not ds_exists:
            ds_index.write_text(
                _render_delivery_story_index(
                    existing.active_item, title, recommended_code, recommended_title
                ),
                encoding="utf-8",
            )
        if not us_exists:
            us_index.write_text(
                _render_user_story_index(recommended_code, recommended_title), encoding="utf-8"
            )
        materialized_artifacts.append(
            existing_artifact("DS package", ds_index)
            if ds_exists
            else MaterializedArtifact("DS package", ds_index, "created")
        )
        materialized_artifacts.append(
            existing_artifact(f"{recommended_code.split('.')[-1]} package", us_index)
            if us_exists
            else MaterializedArtifact(
                f"{recommended_code.split('.')[-1]} package", us_index, "created"
            )
        )
        materialized_paths.append(us_index)
        child_work_items = (recommended_code,)

    cursor = set_delivery_cursor(
        store,
        journey=normalized_journey,
        method=normalized_method,
        active_item=existing.active_item,
        active_item_title=existing.active_item_title,
        active_item_level=existing.active_item_level,
        active_checkpoint="next_story_confirmation",
        pending_confirmation="navigator_story_confirmation",
        last_delivery_event="expand",
        cadence_profile=existing.cadence_profile,
        cadence_limits=existing.cadence_limits,
        granularity_decision="expanded_to_implementable_stories",
        navigator_flow_unit=existing.navigator_flow_unit,
        child_work_items=child_work_items,
        aggregate_checkpoint_status=existing.aggregate_checkpoint_status,
    )
    return BuilderExpandReport(
        journey=normalized_journey,
        method=normalized_method,
        delivery_story=existing.active_item,
        delivery_story_title=title,
        materialized_paths=tuple(materialized_paths),
        materialized_artifacts=tuple(materialized_artifacts),
        recommended_story=recommended_code,
        recommended_story_title=recommended_title,
        cursor=cursor,
    )


@dataclass(frozen=True)
class _CandidateChild:
    code: str
    title: str
    level: str
    status: str


@dataclass(frozen=True)
class _MaterializedChild:
    path: Path
    artifact: MaterializedArtifact


def _materialize_child_package(ds_dir: Path, child: _CandidateChild) -> _MaterializedChild:
    child_dir = ds_dir / _story_folder_name(child.code, child.title)
    child_index = child_dir / "index.md"
    child_exists = child_index.exists()
    if not child_exists:
        child_dir.mkdir(parents=True, exist_ok=True)
        child_index.write_text(
            _render_story_index(child.code, child.title, child.level), encoding="utf-8"
        )
    label = f"{child.code.split('.')[-1]} package"
    artifact = (
        existing_artifact(label, child_index)
        if child_exists
        else MaterializedArtifact(label, child_index, "created")
    )
    return _MaterializedChild(path=child_index, artifact=artifact)


def _parse_candidate_stories(content: str) -> list[_CandidateChild]:
    """Parse a Delivery Story candidate-stories table (header-driven, 4- or 5-column)."""
    children: list[_CandidateChild] = []
    columns: dict[str, int] | None = None
    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line.startswith("|"):
            if columns is not None:
                break
            continue
        cells = [cell.strip() for cell in line.strip("|").split("|")]
        if columns is None:
            lowered = [cell.lower() for cell in cells]
            if {"code", "story", "type", "status"}.issubset(lowered):
                columns = {name: index for index, name in enumerate(lowered)}
            continue
        if line.startswith("|---") or set(cells) <= {""} or all(set(c) <= {"-"} for c in cells):
            continue
        if len(cells) <= max(columns.values()):
            continue
        code = _strip_markdown_link(cells[columns["code"]])
        if not code:
            continue
        type_text = cells[columns["type"]].lower()
        level = "technical_story" if "technical" in type_text else "user_story"
        children.append(
            _CandidateChild(
                code=code,
                title=_strip_markdown_link(cells[columns["story"]]),
                level=level,
                status=cells[columns["status"]],
            )
        )
    return children


def _first_pending_child(children: list[_CandidateChild]) -> _CandidateChild:
    for child in children:
        if "Done" not in child.status and "done" not in child.status:
            return child
    return children[0]


def render_expand_report(report: BuilderExpandReport) -> str:
    body = "\n".join(
        [
            "Delivery",
            render_lifecycle_ribbon("expand"),
            "",
            "╭────────────────────────────────────────────────────────╮",
            "│        🧭◆  EXPAND DECISION                            │",
            "│                                                        │",
            _card_text("delivery story"),
            _card_text(f"🟦[{report.delivery_story}]"),
            *_card_wrapped(report.delivery_story_title),
            "│                                                        │",
            _card_text("materialized"),
            *_card_prefixed(tuple(str(path) for path in report.materialized_paths), "✓"),
            "│                                                        │",
            _card_text("recommended next story"),
            _card_text(f"🟩[{report.recommended_story}]"),
            *_card_wrapped(report.recommended_story_title),
            "│                                                        │",
            _card_text("navigator flow unit"),
            _card_text("story_by_story: child stories keep Navigator checkpoints"),
            _card_text("delivery_story: DS becomes the Navigator-facing lifecycle"),
            _card_text("default: story_by_story"),
            "│                                                        │",
            _card_text("next action"),
            _card_text("Navigator chooses flow unit or confirms a child story."),
            "│                                                        │",
            _card_text("boundary"),
            _card_text("No Plan or implementation was executed."),
            "╰────────────────────────────────────────────────────────╯",
        ]
    )
    return wrap_ariad_surface("expand_decision", body + "\n")


def coherence_lifecycle_item(
    store: Store,
    *,
    journey: str,
    method: MethodDefinition,
    process_alignment: str | None = None,
    project_alignment: str | None = None,
    product_alignment: str | None = None,
    local_differences: tuple[str, ...] = (),
    coherence_artifact_path: Path | None = None,
) -> BuilderCoherenceReport:
    """Render and persist the Ariad Coherence checkpoint after Debt Review."""
    normalized_journey = _normalize_required(journey, "journey")
    existing = get_delivery_cursor(store, normalized_journey)
    if existing is None:
        raise ValueError("delivery cursor is required before coherence")
    if not existing.active_item:
        raise ValueError("active item is required before coherence")
    if existing.pending_confirmation:
        raise ValueError(
            f"Coherence is blocked: pending confirmation {existing.pending_confirmation}."
        )
    if existing.last_delivery_event != "review_complete":
        raise ValueError("Coherence requires completed Debt Review")
    process = (process_alignment or "Process evidence is aligned with the Ariad lifecycle.").strip()
    project = (
        project_alignment or "Project docs and artifacts reflect the validated change."
    ).strip()
    product = (
        product_alignment or "Product behavior matches the accepted validation evidence."
    ).strip()
    differences = tuple(diff.strip() for diff in local_differences if diff.strip())
    missing = _coherence_missing(process, project, product)
    cursor = set_delivery_cursor(
        store,
        journey=normalized_journey,
        method=method.id,
        active_item=existing.active_item,
        active_item_title=existing.active_item_title,
        active_item_level=existing.active_item_level,
        active_checkpoint="coherence" if missing else None,
        pending_confirmation="navigator_coherence" if missing else None,
        last_delivery_event="coherence" if missing else "coherence_complete",
        cadence_profile=existing.cadence_profile,
        cadence_limits=existing.cadence_limits,
        granularity_decision=existing.granularity_decision,
        navigator_flow_unit=existing.navigator_flow_unit,
        child_work_items=existing.child_work_items,
        aggregate_checkpoint_status=existing.aggregate_checkpoint_status,
    )
    report = BuilderCoherenceReport(
        journey=normalized_journey,
        method=method.id,
        active_item=existing.active_item,
        active_item_title=existing.active_item_title,
        process_alignment=process,
        project_alignment=project,
        product_alignment=product,
        local_differences=differences,
        missing_coherence=missing,
        coherence_contract=_contract_for(method, "coherence_contract"),
        cursor=cursor,
        coherence_artifact_path=coherence_artifact_path,
    )
    if coherence_artifact_path is not None:
        coherence_artifact_path.parent.mkdir(parents=True, exist_ok=True)
        coherence_artifact_path.write_text(_render_coherence_artifact(report), encoding="utf-8")
    return report


def render_coherence_checkpoint(report: BuilderCoherenceReport) -> str:
    status = "pending_coherence" if report.missing_coherence else "coherent"
    missing_prefix = "✕" if report.missing_coherence else "✓"
    boundary = (
        "Do not move to Done until coherence gaps are resolved."
        if report.missing_coherence
        else "Coherence is complete; Builder may proceed to Done."
    )
    body = "\n".join(
        [
            "Delivery",
            render_lifecycle_ribbon("done"),
            "",
            "╭────────────────────────────────────────────────────────╮",
            "│        ◉■  COHERENCE CHECKPOINT                        │",
            "│                                                        │",
            _card_text("active item"),
            _card_text(report.active_item),
            "│                                                        │",
            _card_text("status"),
            _card_text(status),
            "│                                                        │",
            _card_text("process alignment"),
            *_card_wrapped(report.process_alignment),
            "│                                                        │",
            _card_text("project alignment"),
            *_card_wrapped(report.project_alignment),
            "│                                                        │",
            _card_text("product alignment"),
            *_card_wrapped(report.product_alignment),
            "│                                                        │",
            _card_text("local guide differences"),
            *_card_prefixed(report.local_differences or ("none",), "△"),
            "│                                                        │",
            _card_text("missing coherence"),
            *_card_prefixed(report.missing_coherence or ("none",), missing_prefix),
            "│                                                        │",
            _card_text("coherence contract"),
            *_card_prefixed(report.coherence_contract.rules, "✓"),
            "│                                                        │",
            _card_text("coherence artifact"),
            *_card_wrapped(
                str(report.coherence_artifact_path)
                if report.coherence_artifact_path
                else "not materialized"
            ),
            "│                                                        │",
            _card_text("boundary"),
            *_card_wrapped(boundary),
            "╰────────────────────────────────────────────────────────╯",
        ]
    )
    return wrap_ariad_surface("coherence_checkpoint", body + "\n")


def done_lifecycle_item(
    store: Store,
    *,
    journey: str,
    method: MethodDefinition,
    history_action: str | None = None,
    roadmap_update: str | None = None,
    next_recommendation: str | None = None,
    done_artifact_path: Path | None = None,
) -> BuilderDoneReport:
    """Render and persist the Ariad Done checkpoint after Debt Review."""
    normalized_journey = _normalize_required(journey, "journey")
    existing = get_delivery_cursor(store, normalized_journey)
    if existing is None:
        raise ValueError("delivery cursor is required before done")
    if not existing.active_item:
        raise ValueError("active item is required before done")
    if existing.pending_confirmation:
        raise ValueError(f"Done is blocked: pending confirmation {existing.pending_confirmation}.")
    if existing.last_delivery_event not in {"review_complete", "coherence_complete"}:
        raise ValueError("Done requires completed Debt Review")
    history = (history_action or "History action recorded according to project policy.").strip()
    roadmap = (roadmap_update or "Roadmap/story package reflects the closed story.").strip()
    next_step = (
        next_recommendation or "Inspect pull candidates for the next Ariad movement."
    ).strip()
    missing = _done_missing(history, roadmap, next_step)
    cursor = set_delivery_cursor(
        store,
        journey=normalized_journey,
        method=method.id,
        active_item=existing.active_item,
        active_item_title=existing.active_item_title,
        active_item_level=existing.active_item_level,
        active_checkpoint="done" if missing else None,
        pending_confirmation="navigator_done" if missing else None,
        last_delivery_event="done" if missing else "done_complete",
        cadence_profile=existing.cadence_profile,
        cadence_limits=existing.cadence_limits,
        granularity_decision=existing.granularity_decision,
        navigator_flow_unit=existing.navigator_flow_unit,
        child_work_items=existing.child_work_items,
        aggregate_checkpoint_status=existing.aggregate_checkpoint_status,
    )
    report = BuilderDoneReport(
        journey=normalized_journey,
        method=method.id,
        active_item=existing.active_item,
        active_item_title=existing.active_item_title,
        history_action=history,
        roadmap_update=roadmap,
        next_recommendation=next_step,
        missing_done=missing,
        done_contract=_contract_for(method, "done_contract"),
        cursor=cursor,
        done_artifact_path=done_artifact_path,
    )
    if done_artifact_path is not None:
        done_artifact_path.parent.mkdir(parents=True, exist_ok=True)
        done_artifact_path.write_text(_render_done_artifact(report), encoding="utf-8")
    return report


def render_done_checkpoint(report: BuilderDoneReport) -> str:
    status = "pending_done" if report.missing_done else "done"
    missing_prefix = "✕" if report.missing_done else "✓"
    boundary = (
        "Do not close the story until Done gaps are resolved."
        if report.missing_done
        else "Story closure is complete; Builder may recommend the next Pull."
    )
    body = "\n".join(
        [
            "Delivery",
            render_lifecycle_ribbon("done"),
            "",
            "╭────────────────────────────────────────────────────────╮",
            "│        🟩■  DONE CHECKPOINT                             │",
            "│                                                        │",
            _card_text("active item"),
            _card_text(report.active_item),
            "│                                                        │",
            _card_text("status"),
            _card_text(status),
            "│                                                        │",
            _card_text("history action"),
            *_card_wrapped(report.history_action),
            "│                                                        │",
            _card_text("roadmap update"),
            *_card_wrapped(report.roadmap_update),
            "│                                                        │",
            _card_text("next recommendation"),
            *_card_wrapped(report.next_recommendation),
            "│                                                        │",
            _card_text("missing done"),
            *_card_prefixed(report.missing_done or ("none",), missing_prefix),
            "│                                                        │",
            _card_text("done contract"),
            *_card_prefixed(report.done_contract.rules, "✓"),
            "│                                                        │",
            _card_text("done artifact"),
            *_card_wrapped(
                str(report.done_artifact_path) if report.done_artifact_path else "not materialized"
            ),
            "│                                                        │",
            _card_text("boundary"),
            *_card_wrapped(boundary),
            "╰────────────────────────────────────────────────────────╯",
        ]
    )
    return wrap_ariad_surface("done_checkpoint", body + "\n")


def review_lifecycle_item(
    store: Store,
    *,
    journey: str,
    method: MethodDefinition,
    debt_findings: tuple[str, ...] = (),
    debt_decision: str = "pending",
    defer_reason: str | None = None,
    revisit_trigger: str | None = None,
    review_artifact_path: Path | None = None,
) -> BuilderReviewReport:
    """Render and persist the Ariad Debt Review checkpoint after Validation."""
    normalized_journey = _normalize_required(journey, "journey")
    existing = get_delivery_cursor(store, normalized_journey)
    if existing is None:
        raise ValueError("delivery cursor is required before review")
    if not existing.active_item:
        raise ValueError("active item is required before review")
    if existing.pending_confirmation:
        raise ValueError(
            f"Review is blocked: pending confirmation {existing.pending_confirmation}."
        )
    if existing.last_delivery_event != "validation_passed":
        raise ValueError("Debt Review requires passed Validation")
    normalized_decision = _normalize_validation_choice(
        debt_decision,
        "debt_decision",
        {"pending", "no_action", "defer", "pay_now"},
    )
    normalized_findings = tuple(finding.strip() for finding in debt_findings if finding.strip())
    missing = _review_missing_decision(
        debt_decision=normalized_decision,
        defer_reason=defer_reason,
        revisit_trigger=revisit_trigger,
    )
    pending_confirmation = "navigator_debt_decision" if missing else None
    active_checkpoint = "review_decision" if missing else None
    last_event = "review" if missing else "review_complete"
    cursor = set_delivery_cursor(
        store,
        journey=normalized_journey,
        method=method.id,
        active_item=existing.active_item,
        active_item_title=existing.active_item_title,
        active_item_level=existing.active_item_level,
        active_checkpoint=active_checkpoint,
        pending_confirmation=pending_confirmation,
        last_delivery_event=last_event,
        cadence_profile=existing.cadence_profile,
        cadence_limits=existing.cadence_limits,
        granularity_decision=existing.granularity_decision,
        navigator_flow_unit=existing.navigator_flow_unit,
        child_work_items=existing.child_work_items,
        aggregate_checkpoint_status=existing.aggregate_checkpoint_status,
    )
    report = BuilderReviewReport(
        journey=normalized_journey,
        method=method.id,
        active_item=existing.active_item,
        active_item_title=existing.active_item_title,
        debt_findings=normalized_findings,
        debt_decision=normalized_decision,
        defer_reason=(defer_reason.strip() if defer_reason and defer_reason.strip() else None),
        revisit_trigger=(
            revisit_trigger.strip() if revisit_trigger and revisit_trigger.strip() else None
        ),
        missing_decision=missing,
        debt_review_contract=_contract_for(method, "debt_review_contract"),
        cursor=cursor,
        review_artifact_path=review_artifact_path,
    )
    if review_artifact_path is not None:
        review_artifact_path.parent.mkdir(parents=True, exist_ok=True)
        review_artifact_path.write_text(_render_review_artifact(report), encoding="utf-8")
    return report


def render_review_checkpoint(report: BuilderReviewReport) -> str:
    status = "pending_debt_decision" if report.missing_decision else "reviewed"
    missing_prefix = "✕" if report.missing_decision else "✓"
    boundary = (
        "Do not move past Debt Review until the Navigator debt decision is resolved."
        if report.missing_decision
        else "Debt Review is complete; Builder may proceed to Done."
    )
    body = "\n".join(
        [
            "Delivery",
            render_lifecycle_ribbon("debt_review"),
            "",
            "╭────────────────────────────────────────────────────────╮",
            "│        🔎■  DEBT REVIEW CHECKPOINT                     │",
            "│                                                        │",
            _card_text("active item"),
            _card_text(report.active_item),
            "│                                                        │",
            _card_text("status"),
            _card_text(status),
            "│                                                        │",
            _card_text("debt findings"),
            *_card_prefixed(report.debt_findings or ("No debt findings declared.",), "△"),
            "│                                                        │",
            _card_text("debt decision"),
            _card_text(report.debt_decision),
            "│                                                        │",
            _card_text("defer reason"),
            *_card_wrapped(report.defer_reason or "none"),
            "│                                                        │",
            _card_text("revisit trigger"),
            *_card_wrapped(report.revisit_trigger or "none"),
            "│                                                        │",
            _card_text("missing decision"),
            *_card_prefixed(report.missing_decision or ("none",), missing_prefix),
            "│                                                        │",
            _card_text("debt review contract"),
            *_card_prefixed(report.debt_review_contract.rules, "✓"),
            "│                                                        │",
            _card_text("review artifact"),
            *_card_wrapped(
                str(report.review_artifact_path)
                if report.review_artifact_path
                else "not materialized"
            ),
            "│                                                        │",
            _card_text("boundary"),
            *_card_wrapped(boundary),
            "╰────────────────────────────────────────────────────────╯",
        ]
    )
    return wrap_ariad_surface("debt_review_checkpoint", body + "\n")


def validate_lifecycle_item(
    store: Store,
    *,
    journey: str,
    method: MethodDefinition,
    automated_checks: tuple[str, ...] = (),
    checks_status: str = "not_run",
    e2e_decision: str = "not_required",
    e2e_evidence: str | None = None,
    navigator_validation_route: str | None = None,
    navigator_accepted: bool = False,
    expected_observation: str | None = None,
    pass_condition: str | None = None,
    fail_condition: str | None = None,
    implementation_complete: bool = False,
    validation_artifact_path: Path | None = None,
) -> BuilderValidationReport:
    """Render and persist the Ariad Validation checkpoint after implementation."""
    normalized_journey = _normalize_required(journey, "journey")
    existing = get_delivery_cursor(store, normalized_journey)
    if existing is None:
        raise ValueError("delivery cursor is required before validation")
    if not existing.active_item:
        raise ValueError("active item is required before validation")
    if existing.pending_confirmation and existing.pending_confirmation != "navigator_validation":
        raise ValueError(
            f"Validation is blocked: pending confirmation {existing.pending_confirmation}."
        )
    if existing.pending_confirmation == "navigator_validation" and not navigator_accepted:
        raise ValueError("Validation is blocked: pending Navigator validation acceptance.")
    plan_events = {"plan_approved", "delivery_story_plan_approved"}
    if existing.last_delivery_event not in (*plan_events, "implementation_complete", "validate"):
        raise ValueError("Validation requires an approved Plan and completed implementation")
    if existing.last_delivery_event in plan_events and not implementation_complete:
        raise ValueError("Validation requires implementation completion evidence")
    normalized_checks = tuple(check.strip() for check in automated_checks if check.strip())
    normalized_checks_status = _normalize_validation_choice(
        checks_status, "checks_status", {"passed", "failed", "not_run"}
    )
    normalized_e2e_decision = _normalize_validation_choice(
        e2e_decision,
        "e2e_decision",
        {"required", "not_required", "waived", "skipped"},
    )
    route = (
        navigator_validation_route or "Navigator validates the behavior described by the Plan."
    ).strip()
    observation = (expected_observation or "Expected behavior from the Plan is observable.").strip()
    pass_text = (pass_condition or "Navigator accepts the observed behavior.").strip()
    fail_text = (fail_condition or "Navigator cannot observe the planned behavior.").strip()
    missing = _validation_missing_evidence(
        checks=normalized_checks,
        checks_status=normalized_checks_status,
        e2e_decision=normalized_e2e_decision,
        e2e_evidence=e2e_evidence,
        navigator_validation_route=route,
        navigator_accepted=navigator_accepted,
    )
    pending_confirmation = "navigator_validation" if missing else None
    active_checkpoint = "after_validation" if missing else None
    last_event = "validate" if missing else "validation_passed"
    cursor = set_delivery_cursor(
        store,
        journey=normalized_journey,
        method=method.id,
        active_item=existing.active_item,
        active_item_title=existing.active_item_title,
        active_item_level=existing.active_item_level,
        active_checkpoint=active_checkpoint,
        pending_confirmation=pending_confirmation,
        last_delivery_event=last_event,
        cadence_profile=existing.cadence_profile,
        cadence_limits=existing.cadence_limits,
        granularity_decision=existing.granularity_decision,
        navigator_flow_unit=existing.navigator_flow_unit,
        child_work_items=existing.child_work_items,
        aggregate_checkpoint_status=existing.aggregate_checkpoint_status,
    )
    report = BuilderValidationReport(
        journey=normalized_journey,
        method=method.id,
        active_item=existing.active_item,
        active_item_title=existing.active_item_title,
        automated_checks=normalized_checks,
        checks_status=normalized_checks_status,
        e2e_decision=normalized_e2e_decision,
        e2e_evidence=(e2e_evidence.strip() if e2e_evidence and e2e_evidence.strip() else None),
        navigator_validation_route=route,
        navigator_accepted=navigator_accepted,
        expected_observation=observation,
        pass_condition=pass_text,
        fail_condition=fail_text,
        missing_evidence=missing,
        validation_contract=_contract_for(method, "validation_contract"),
        cursor=cursor,
        validation_artifact_path=validation_artifact_path,
    )
    if validation_artifact_path is not None:
        validation_artifact_path.parent.mkdir(parents=True, exist_ok=True)
        validation_artifact_path.write_text(_render_validation_artifact(report), encoding="utf-8")
    return report


def render_validation_checkpoint(report: BuilderValidationReport) -> str:
    status = "pending_navigator_validation" if report.missing_evidence else "passed"
    missing_prefix = "✕" if report.missing_evidence else "✓"
    boundary = (
        "Do not move past Validation until missing evidence is resolved."
        if report.missing_evidence
        else "Validation is complete; Builder may proceed to Debt Review."
    )
    body = "\n".join(
        [
            "Delivery",
            render_lifecycle_ribbon("validate"),
            "",
            "╭────────────────────────────────────────────────────────╮",
            "│        🧪■  VALIDATION CHECKPOINT                      │",
            "│                                                        │",
            _card_text("active item"),
            _card_text(report.active_item),
            "│                                                        │",
            _card_text("status"),
            _card_text(status),
            "│                                                        │",
            _card_text("automated checks"),
            *_card_prefixed(report.automated_checks or ("No automated checks declared.",), "✓"),
            "│                                                        │",
            _card_text("checks status"),
            _card_text(report.checks_status),
            "│                                                        │",
            _card_text("e2e decision"),
            _card_text(report.e2e_decision),
            "│                                                        │",
            _card_text("e2e evidence"),
            *_card_wrapped(report.e2e_evidence or "none"),
            "│                                                        │",
            _card_text("navigator validation route"),
            *_card_wrapped(report.navigator_validation_route),
            "│                                                        │",
            _card_text("navigator accepted"),
            _card_text("yes" if report.navigator_accepted else "no"),
            "│                                                        │",
            _card_text("expected observation"),
            *_card_wrapped(report.expected_observation),
            "│                                                        │",
            _card_text("pass condition"),
            *_card_wrapped(report.pass_condition),
            "│                                                        │",
            _card_text("fail condition"),
            *_card_wrapped(report.fail_condition),
            "│                                                        │",
            _card_text("missing evidence"),
            *_card_prefixed(report.missing_evidence or ("none",), missing_prefix),
            "│                                                        │",
            _card_text("validation contract"),
            *_card_prefixed(report.validation_contract.rules, "✓"),
            "│                                                        │",
            _card_text("validation artifact"),
            *_card_wrapped(
                str(report.validation_artifact_path)
                if report.validation_artifact_path
                else "not materialized"
            ),
            "│                                                        │",
            _card_text("boundary"),
            *_card_wrapped(boundary),
            "╰────────────────────────────────────────────────────────╯",
        ]
    )
    return wrap_ariad_surface("validation_checkpoint", body + "\n")


def render_implementation_guard_allowed(cursor: BuilderDeliveryCursor) -> str:
    body = "\n".join(
        [
            "Delivery",
            render_lifecycle_ribbon("implement"),
            "",
            "╭────────────────────────────────────────────────────────╮",
            "│        🟧■  IMPLEMENTATION GUARD                       │",
            "│                                                        │",
            _card_text("status"),
            _card_text("allowed"),
            "│                                                        │",
            _card_text("active item"),
            _card_text(cursor.active_item or "none"),
            "│                                                        │",
            _card_text("last delivery event"),
            _card_text(cursor.last_delivery_event or "none"),
            "│                                                        │",
            _card_text("boundary"),
            *_card_wrapped("Implementation may begin under the approved Plan contract."),
            "╰────────────────────────────────────────────────────────╯",
        ]
    )
    return wrap_ariad_surface("implementation_guard", body + "\n")


def render_implementation_guard_blocked(reason: str) -> str:
    body = "\n".join(
        [
            "Delivery",
            render_lifecycle_ribbon("implement"),
            "",
            "╭────────────────────────────────────────────────────────╮",
            "│        🟧■  IMPLEMENTATION GUARD                       │",
            "│                                                        │",
            _card_text("status"),
            _card_text("blocked"),
            "│                                                        │",
            _card_text("missing checkpoint"),
            *_card_wrapped(reason),
            "│                                                        │",
            _card_text("boundary"),
            *_card_wrapped(
                "No implementation files may be mutated until the guard allows Implement."
            ),
            "╰────────────────────────────────────────────────────────╯",
        ]
    )
    return wrap_ariad_surface("implementation_guard", body + "\n")


def assert_implementation_allowed(store: Store, *, journey: str) -> BuilderDeliveryCursor:
    """Raise when runtime cursor blocks implementation."""
    normalized_journey = _normalize_required(journey, "journey")
    cursor = get_delivery_cursor(store, normalized_journey)
    if cursor is None:
        raise PermissionError("Implementation requires a Builder delivery cursor")
    if cursor.pending_confirmation:
        raise PermissionError(
            f"Implementation is blocked: pending confirmation {cursor.pending_confirmation}."
        )
    if cursor.last_delivery_event == "plan_approved":
        return cursor
    if _has_approved_delivery_story_plan(cursor):
        return cursor
    raise PermissionError("Implementation is blocked: approved Plan is required before Implement.")


def _has_approved_delivery_story_plan(cursor: BuilderDeliveryCursor) -> bool:
    return (
        cursor.last_delivery_event == "delivery_story_plan_approved"
        and cursor.active_item_level == "delivery_story"
        and cursor.navigator_flow_unit == "delivery_story"
        and "plan:approved" in cursor.aggregate_checkpoint_status
    )


def _delivery_story_flow_ribbon(current: str) -> str:
    stages = (
        ("pull", "Pull"),
        ("prepare", "Prepare"),
        ("expand", "Expand"),
        ("plan", "DS Plan"),
        ("implement", "Implement"),
        ("validate", "Validate"),
        ("debt_review", "Debt Review"),
        ("done", "Done"),
    )
    stage_ids = tuple(stage for stage, _label in stages)
    if current not in stage_ids:
        raise ValueError(f"unknown Delivery Story lifecycle stage: {current}")
    current_index = stage_ids.index(current)
    parts = []
    for index, (_stage, label) in enumerate(stages):
        marker = "✓" if index < current_index else "◉" if index == current_index else "○"
        parts.append(f"{marker} {label}")
    return "Delivery Flow: " + " → ".join(parts)


def render_delivery_story_ready_report(
    *,
    pull: BuilderPullReport,
    prepare: BuilderPrepareReport,
    expand: BuilderExpandReport,
) -> str:
    """Render the compact post-pull orientation for a Delivery Story."""
    code_parts = pull.item.code.split(".")
    cv_code = code_parts[0] if code_parts else pull.item.code
    ds_code = code_parts[-1] if len(code_parts) > 1 else pull.item.code
    title = _title_leaf(pull.item.title)
    body = "\n".join(
        [
            "Delivery",
            _delivery_story_flow_ribbon("expand"),
            "",
            "╭────────────────────────────────────────────────────────╮",
            _card_text(f"🧭 {pull.item.code} READY"),
            "│                                                        │",
            _card_text("What was pulled?"),
            *_card_wrapped(title),
            "│                                                        │",
            _card_text("Where are we in the roadmap?"),
            _card_text(f"🟪[{cv_code}] {_cv_title(pull.item.title)}"),
            _card_text(f"  └─ 🟦[{ds_code}] {title}"),
            "│                                                        │",
            _card_text("What did Prepare find?"),
            *_card_wrapped(_prepare_finding(prepare)),
            "│                                                        │",
            _card_text("What was materialized?"),
            *_card_prefixed(_materialized_summary(expand), "✓"),
            "│                                                        │",
            _card_text("What is recommended next?"),
            _card_text(
                f"🟩[{expand.recommended_story.split('.')[-1]}] {expand.recommended_story_title}"
            ),
            "│                                                        │",
            _card_text("Recommended flow unit"),
            *_card_wrapped(_flow_unit_recommendation(expand)),
            "│                                                        │",
            _card_text("Why this recommendation?"),
            *_card_wrapped(_flow_unit_recommendation_rationale(expand)),
            "│                                                        │",
            _card_text("What can we do now?"),
            *_card_prefixed(
                (
                    f"confirm {expand.recommended_story.split('.')[-1]} and continue story_by_story",
                    "choose delivery_story as the flow unit",
                    "inspect generated story packages",
                ),
                "-",
            ),
            "│                                                        │",
            *_card_wrapped("Choose the next flow unit when ready."),
            "╰────────────────────────────────────────────────────────╯",
        ]
    )
    return wrap_ariad_surface("delivery_story_ready", body + "\n")


def _flow_unit_recommendation(expand: BuilderExpandReport) -> str:
    child_count = max(1, len(expand.materialized_artifacts) - 1)
    if child_count <= 1:
        return "delivery_story — recommended"
    return "delivery_story — recommended unless you want separate Navigator validation for each child story"


def _flow_unit_recommendation_rationale(expand: BuilderExpandReport) -> str:
    child_count = max(1, len(expand.materialized_artifacts) - 1)
    if child_count <= 1:
        return "The Delivery Story appears coherent enough to plan, implement, and validate as one Navigator-facing unit while keeping the child story as a traceable work package."
    return "The child work packages appear to support one Delivery Story outcome. Use story_by_story only if each child needs separate Navigator checkpoints."


def render_pull_report(report: BuilderPullReport) -> str:
    """Render an Ariad Pull report using Delivery Story activation grammar."""
    code_parts = report.item.code.split(".")
    cv_code = code_parts[0] if code_parts else report.item.code
    ds_code = code_parts[-1] if len(code_parts) > 1 else report.item.code
    title = _title_leaf(report.item.title)
    body = (
        "\n".join(
            [
                "Delivery",
                render_lifecycle_ribbon("pull"),
                "",
                "╭────────────────────────────────────────────────────────╮",
                "│        🟪■  DELIVERY STORY ACTIVATED                   │",
                "│                                                        │",
                _card_text(title),
                "│                                                        │",
                _card_text("source"),
                _card_text("roadmap candidate"),
                "│                                                        │",
                _card_text("roadmap placement"),
                _card_text(f"🟪[{cv_code}] {_cv_title(report.item.title)}"),
                _card_text(f"  └─ 🟦[{ds_code}] {title}"),
                "│                                                        │",
                _card_text("intent"),
                *_card_wrapped(report.item.why_now),
                "│                                                        │",
                _card_text("commitment"),
                _card_text("pulled into active Delivery Work"),
                _card_text(f"active item: {report.cursor.active_item or 'none'}"),
                "│                                                        │",
                _card_text("next event"),
                _card_text(report.next_event.title()),
                "│                                                        │",
                _card_text("boundary"),
                _card_text("Prepare was not executed automatically."),
                _card_text("Plan and later lifecycle work were not executed."),
                "╰────────────────────────────────────────────────────────╯",
            ]
        )
        + "\n"
    )
    return wrap_ariad_surface("delivery_story_identified", body)


def _prepare_finding(report: BuilderPrepareReport) -> str:
    if report.granularity_decision_required:
        return "Delivery Story requires a granularity decision before implementation."
    return "Pulled story is implementable after Plan approval."


def _materialized_summary(report: BuilderExpandReport) -> tuple[str, ...]:
    if not report.materialized_paths:
        return ("none",)
    summaries: list[str] = []
    for path in report.materialized_paths:
        if path.parent.name == _slugify(report.delivery_story.lower()):
            summaries.append("DS package")
        elif path.parent.name.endswith(_slugify(report.recommended_story.split(".")[-1].lower())):
            summaries.append(f"{report.recommended_story.split('.')[-1]} package")
        elif report.delivery_story.lower().replace(".", "-") in str(path):
            summaries.append("DS package")
        else:
            summaries.append(path.parent.name)
    deduped: list[str] = []
    for summary in summaries:
        if summary not in deduped:
            deduped.append(summary)
    return tuple(deduped)


def render_plan_checkpoint(report: BuilderPlanReport) -> str:
    """Render an Ariad Plan checkpoint surface."""
    package_path = (
        str(report.plan_artifact_path.parent) if report.plan_artifact_path else "not written"
    )
    index_path = (
        str(report.plan_artifact_path.parent / "index.md")
        if report.plan_artifact_path
        else "not written"
    )
    plan_path = str(report.plan_artifact_path) if report.plan_artifact_path else "not written"
    test_guide_path = (
        str(report.plan_artifact_path.parent / "test-guide.md")
        if report.plan_artifact_path
        else "not written"
    )
    body = (
        "\n".join(
            [
                "Delivery",
                render_lifecycle_ribbon("plan"),
                "",
                "╭────────────────────────────────────────────────────────╮",
                "│        🧭■  PLAN CHECKPOINT                            │",
                "│                                                        │",
                _card_text("item"),
                _card_text(f"🟦[{report.active_item}]"),
                _card_text(f"level: {report.active_item_level or 'unknown'}"),
                "│                                                        │",
                _card_text("story package"),
                *_card_wrapped(
                    package_path if report.plan_artifact_path else "not materialized yet"
                ),
                "│                                                        │",
                _card_text("artifacts"),
                *_card_wrapped(
                    f"index: {index_path}" if report.plan_artifact_path else "index: not written"
                ),
                *_card_wrapped(
                    f"plan: {plan_path}" if report.plan_artifact_path else "plan: not written"
                ),
                *_card_wrapped(
                    f"test guide: {test_guide_path}"
                    if report.plan_artifact_path
                    else "test guide: not written"
                ),
                "│                                                        │",
                _card_text("granularity"),
                *_card_wrapped(_granularity_message(report)),
                "│                                                        │",
                _card_text("plan"),
                *_card_wrapped(report.objective),
                "│                                                        │",
                _card_text("scope"),
                *_card_prefixed(report.scope, "✓"),
                "│                                                        │",
                _card_text("non-goals"),
                *_card_prefixed(report.non_goals, "○"),
                "│                                                        │",
                _card_text("acceptance"),
                *_card_prefixed(report.acceptance_behavior, "✓"),
                "│                                                        │",
                _card_text("validation"),
                *_card_prefixed(report.validation_route, "✓"),
                *_card_wrapped(f"E2E: {report.e2e_decision}"),
                "│                                                        │",
                _card_text("implementation contract"),
                *_card_wrapped("TDD/characterization tests when behavior is testable."),
                *_card_wrapped("Keep changes scoped to the active story."),
                *_card_prefixed(report.local_rules, "✓"),
                "│                                                        │",
                _card_text("approval gate"),
                _card_text(f"checkpoint: {report.cursor.active_checkpoint}"),
                _card_text(f"pending: {report.cursor.pending_confirmation}"),
                "│                                                        │",
                _card_text("next action"),
                *_card_wrapped(_plan_next_action(report)),
                "│                                                        │",
                _card_text("boundary"),
                _card_text("Implementation remains blocked until approval."),
                "╰────────────────────────────────────────────────────────╯",
            ]
        )
        + "\n"
        + (
            "".join(
                (
                    f"story_package_path={package_path}\n",
                    f"index_artifact_path={index_path}\n",
                    f"plan_artifact_path={plan_path}\n",
                    f"test_guide_artifact_path={test_guide_path}\n",
                )
            )
            if report.plan_artifact_path
            else ""
        )
    )
    return wrap_ariad_surface("plan_checkpoint", body)


def render_prepare_report(report: BuilderPrepareReport) -> str:
    """Render an Ariad Prepare report using field-reading grammar."""
    body = (
        "\n".join(
            [
                "Delivery",
                render_lifecycle_ribbon("prepare"),
                "",
                "╭────────────────────────────────────────────────────────╮",
                "│        🧭  PREPARE FIELD READING                       │",
                "│                                                        │",
                _card_text("active item"),
                _card_text(f"🟦[{report.active_item}]"),
                _card_text(f"level: {report.active_item_level or 'unknown'}"),
                _card_text(
                    "implementable: yes"
                    if report.implementable_by_default
                    else "implementable: requires granularity decision"
                ),
                "│                                                        │",
                _card_text("terrain read"),
                *_card_context_items(report.context_summary),
                "│                                                        │",
                _card_text("story shape"),
                *_card_wrapped(report.story_shape_assessment),
                "│                                                        │",
                _card_text("risks"),
                *_card_prefixed(report.risks, "✕"),
                "│                                                        │",
                _card_text("applicable rules"),
                *_card_prefixed(report.applicable_rules, "✓"),
                "│                                                        │",
                _card_text("next event"),
                _card_text(
                    "Expand or Plan"
                    if report.granularity_decision_required
                    else report.next_event.title()
                ),
                "│                                                        │",
                _card_text("boundary"),
                _card_text("Plan was not created."),
                _card_text("Implementation remains blocked."),
                "╰────────────────────────────────────────────────────────╯",
            ]
        )
        + "\n"
    )
    return wrap_ariad_surface("prepare_field_reading", body)


def _write_story_package(directory: Path, report: BuilderPlanReport) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "index.md").write_text(_render_story_index_artifact(report), encoding="utf-8")
    (directory / "plan.md").write_text(_render_plan_artifact(report), encoding="utf-8")
    (directory / "test-guide.md").write_text(_render_test_guide_artifact(report), encoding="utf-8")


def _render_story_index_artifact(report: BuilderPlanReport) -> str:
    story_type = (report.active_item_level or "story").replace("_", " ").title()
    story_statement = (
        _technical_story_statement(report.active_item_title or report.active_item)
        if report.active_item_level == "technical_story"
        else _user_story_statement(report.active_item_title or report.active_item)
    )
    return f"""[< Parent](../index.md)

# {report.active_item} — {report.active_item_title or report.active_item}

**Status:** 🟡 Planned
**Type:** {story_type}

---

## Outcome

{report.objective}

## Story Statement

{story_statement}

## Acceptance Behavior

```text
{chr(10).join(report.acceptance_behavior)}
```

## Scope

{_markdown_list(report.scope)}

## Out Of Scope

{_markdown_list(report.non_goals)}

## Validation

{_markdown_list(report.validation_route)}

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
"""


def _render_delivery_story_index(
    code: str, title: str, recommended_code: str, recommended_title: str
) -> str:
    return f"""[< Parent](../index.md)

# {code} — {title}

**Status:** 🟡 Planned
**Type:** Delivery Story

---

## Outcome

{title}

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| [{recommended_code}]({_story_folder_name(recommended_code, recommended_title)}/index.md) | {recommended_title} | User Story | {_user_story_outcome(recommended_title)} | 🟡 Planned |

## Done Condition

The Delivery Story is done when child User/Technical Stories produce a coherent delivery outcome.
"""


def _render_story_index(code: str, title: str, level: str) -> str:
    if level == "technical_story":
        return _render_technical_story_index(code, title)
    return _render_user_story_index(code, title)


def _render_technical_story_index(code: str, title: str) -> str:
    return f"""[< Parent](../index.md)

# {code} — {title}

**Status:** 🟡 Planned
**Type:** Technical Story

---

## Technical Story

{_technical_story_statement(title)}

## Outcome

{_user_story_outcome(title)}

## Acceptance Behavior

```text
Given the system is ready for {title}
When the planned technical change is applied
Then the expected technical outcome is observable
And unrelated Delivery Story scope remains untouched
```

## Scope

- {title}

## Out Of Scope

- Sibling Delivery Story scope.

## Validation

Navigator-visible validation route plus automated checks.
"""


def _render_user_story_index(code: str, title: str) -> str:
    return f"""[< Parent](../index.md)

# {code} — {title}

**Status:** 🟡 Planned
**Type:** User Story

---

## User Story

{_user_story_statement(title)}

## Outcome

{_user_story_outcome(title)}

## Acceptance Behavior

```text
Given the user is ready for {title}
When the user performs the planned action
Then the expected observable behavior is visible
And unrelated Delivery Story scope remains untouched
```

## Scope

- {title}

## Out Of Scope

- Sibling Delivery Story scope.

## Validation

Navigator-visible validation route plus automated checks.
"""


def _render_plan_artifact(report: BuilderPlanReport) -> str:
    local_rules = "\n".join(f"- {rule}" for rule in report.local_rules) or "- None declared."
    stop_conditions = "\n".join(
        f"- {condition}" for condition in report.implement_contract.stop_conditions
    )
    return f"""# Plan — {report.active_item}

## Objective

{report.objective}

## Scope

{_markdown_list(report.scope)}

## Non-Goals

{_markdown_list(report.non_goals)}

## Acceptance Behavior

```text
{chr(10).join(report.acceptance_behavior)}
```

## Validation Route

{_markdown_list(report.validation_route)}

E2E decision: {report.e2e_decision}

## Implementation Contract

- Use TDD or characterization tests for behavior changes when testable.
- Keep changes scoped to `{report.active_item}`.
{local_rules}

## Stop Conditions

{stop_conditions}

## Approval Gate

- active checkpoint: `{report.cursor.active_checkpoint}`
- pending confirmation: `{report.cursor.pending_confirmation}`
- implementation remains blocked until Navigator approval.
"""


def _render_test_guide_artifact(report: BuilderPlanReport) -> str:
    return f"""[< Story](index.md)

# Test Guide — {report.active_item}

## Automated Validation

{_markdown_list(report.validation_route)}

## E2E Decision

{report.e2e_decision}

## Navigator Validation

Provide the Navigator-visible route with expected observation, pass condition, and fail condition before the story can pass Validation.

## Validation Evidence

Pending implementation and validation.
"""


def _granularity_message(report: BuilderPlanReport) -> str:
    if report.implementable_by_default:
        return f"{report.active_item_level or 'item'} is implementable by default."
    return "Delivery Story must expand into User Stories and/or Technical Stories before Plan."


def _plan_next_action(report: BuilderPlanReport) -> str:
    return "Navigator approves the Plan or requests changes."


def _artifact_directory(project_path: Path, code: str, title: str) -> Path:
    parts = code.lower().replace("_", "-").split(".")
    titles = tuple(part.strip() for part in title.split("/") if part.strip())
    path = project_path / "docs" / "project" / "roadmap"
    accumulated: list[str] = []
    for index, part in enumerate(parts):
        accumulated.append(part)
        prefix = "-".join(accumulated)
        title_slug = _slugify(titles[index]) if index < len(titles) else ""
        path = path / (f"{prefix}-{title_slug}" if title_slug else prefix)
    return path


def _story_folder_name(code: str, title: str) -> str:
    return f"{code.lower().replace('.', '-')}-{_slugify(title)}"


def _slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return re.sub(r"-+", "-", slug)


def _user_story_statement(title: str) -> str:
    return f"As a user,\nI want to {title},\nSo that I can receive the value of this story."


def _technical_story_statement(title: str) -> str:
    return (
        "In order to support the delivery capability,\n"
        "As an engineering team/system component,\n"
        f"I want to {title},\n"
        "So that the expected technical outcome is available."
    )


def _user_story_outcome(title: str) -> str:
    return f"Navigator can validate {title} as an observable behavior."


def _render_coherence_artifact(report: BuilderCoherenceReport) -> str:
    return f"""# Coherence — {report.active_item}

## Status

{"Pending coherence" if report.missing_coherence else "Coherent"}

## Process Alignment

{report.process_alignment}

## Project Alignment

{report.project_alignment}

## Product Alignment

{report.product_alignment}

## Local Guide Differences

{_markdown_list(report.local_differences or ("none",))}

## Missing Coherence

{_markdown_list(report.missing_coherence or ("none",))}
"""


def _render_done_artifact(report: BuilderDoneReport) -> str:
    return f"""# Done — {report.active_item}

## Status

{"Pending Done" if report.missing_done else "Done"}

## History Action

{report.history_action}

## Roadmap Update

{report.roadmap_update}

## Next Recommendation

{report.next_recommendation}

## Missing Done

{_markdown_list(report.missing_done or ("none",))}
"""


def _render_review_artifact(report: BuilderReviewReport) -> str:
    return f"""# Review — {report.active_item}

## Status

{"Pending debt decision" if report.missing_decision else "Reviewed"}

## Debt Findings

{_markdown_list(report.debt_findings or ("No debt findings declared.",))}

## Debt Decision

{report.debt_decision}

## Defer Reason

{report.defer_reason or "none"}

## Revisit Trigger

{report.revisit_trigger or "none"}

## Missing Decision

{_markdown_list(report.missing_decision or ("none",))}
"""


def _render_validation_artifact(report: BuilderValidationReport) -> str:
    return f"""# Validation — {report.active_item}

## Status

{"Blocked" if report.missing_evidence else "Passed"}

## Automated Checks

{_markdown_list(report.automated_checks or ("No automated checks declared.",))}

Checks status: {report.checks_status}

## E2E

Decision: {report.e2e_decision}

Evidence: {report.e2e_evidence or "none"}

## Navigator Validation

Route: {report.navigator_validation_route}

Navigator accepted: {"yes" if report.navigator_accepted else "no"}

Expected observation: {report.expected_observation}

Pass condition: {report.pass_condition}

Fail condition: {report.fail_condition}

## Missing Evidence

{_markdown_list(report.missing_evidence or ("none",))}
"""


def _normalize_validation_choice(value: str, field: str, allowed: set[str]) -> str:
    normalized = value.strip().lower().replace("-", "_") if isinstance(value, str) else ""
    if normalized not in allowed:
        allowed_values = ", ".join(sorted(allowed))
        raise ValueError(f"{field} must be one of {allowed_values}")
    return normalized


def _coherence_missing(process: str, project: str, product: str) -> tuple[str, ...]:
    missing: list[str] = []
    if not process.strip():
        missing.append("process alignment is missing")
    if not project.strip():
        missing.append("project alignment is missing")
    if not product.strip():
        missing.append("product alignment is missing")
    return tuple(missing)


def _done_missing(history: str, roadmap: str, next_step: str) -> tuple[str, ...]:
    missing: list[str] = []
    if not history.strip():
        missing.append("history action is missing")
    if not roadmap.strip():
        missing.append("roadmap update is missing")
    if not next_step.strip():
        missing.append("next recommendation is missing")
    return tuple(missing)


def _review_missing_decision(
    *,
    debt_decision: str,
    defer_reason: str | None,
    revisit_trigger: str | None,
) -> tuple[str, ...]:
    missing: list[str] = []
    if debt_decision == "pending":
        missing.append("Navigator debt decision is required")
    if debt_decision == "defer":
        if not (defer_reason and defer_reason.strip()):
            missing.append("deferred debt requires a reason")
        if not (revisit_trigger and revisit_trigger.strip()):
            missing.append("deferred debt requires a revisit trigger")
    if debt_decision == "pay_now":
        missing.append("pay-now debt must route through Refactor before Done")
    return tuple(missing)


def _validation_missing_evidence(
    *,
    checks: tuple[str, ...],
    checks_status: str,
    e2e_decision: str,
    e2e_evidence: str | None,
    navigator_validation_route: str,
    navigator_accepted: bool,
) -> tuple[str, ...]:
    missing: list[str] = []
    if not checks:
        missing.append("automated checks are not declared")
    if checks_status != "passed":
        missing.append(f"automated checks status is {checks_status}")
    if e2e_decision == "required" and not (e2e_evidence and e2e_evidence.strip()):
        missing.append("required E2E evidence is missing")
    if e2e_decision == "skipped" and not (e2e_evidence and e2e_evidence.strip()):
        missing.append("skipped E2E requires an explicit reason")
    if not navigator_validation_route.strip():
        missing.append("Navigator validation route is missing")
    elif not navigator_accepted:
        missing.append("Navigator validation has not been accepted")
    return tuple(missing)


def _prefixed_lines(items: tuple[str, ...], prefix: str) -> tuple[str, ...]:
    return tuple(f"{prefix} {item}" for item in items)


def _markdown_list(items: tuple[str, ...]) -> str:
    return "\n".join(f"- {item}" for item in items) if items else "- None declared."


def _contract_for(method: MethodDefinition, contract_id: str) -> ContractDefinition:
    for contract in method.contracts:
        if contract.id == contract_id:
            return contract
    raise ValueError(f"method {method.id} is missing contract {contract_id}")


def _normalize_item(item: BuilderLifecycleItem) -> BuilderLifecycleItem:
    code = _normalize_required(item.code, "item code")
    title = _normalize_required(item.title, "item title")
    level = _normalize_required(item.level, "item level")
    why_now = _normalize_required(item.why_now, "why now")
    if level not in _ALLOWED_PULL_LEVELS:
        raise ValueError(f"item level must be one of {', '.join(_ALLOWED_PULL_LEVELS)}")
    return BuilderLifecycleItem(code=code, title=title, level=level, why_now=why_now)


def _is_implementable_by_default(level: str | None) -> bool:
    return level in {"user_story", "technical_story"}


def _story_shape_assessment(level: str | None) -> str:
    if _is_implementable_by_default(level):
        return "Pulled item is implementable by default. Plan may define the execution contract."
    if level == "delivery_story":
        return (
            "Pulled item is a Delivery Story. Ariad requires a granularity decision before "
            "implementation: expand into User/Technical Stories or approve this Delivery Story "
            "as one coherent implementable story."
        )
    return "Pulled item level is unknown. Treat granularity as requiring Navigator decision."


def _next_event_rule(level: str | None) -> str:
    if _is_implementable_by_default(level):
        return "Plan is the next event and requires Navigator approval before implementation."
    return "Expand or explicit single-story approval is required before implementation."


def _context_summary(project_path: Path | None) -> tuple[str, ...]:
    if project_path is None:
        return ("No project path is configured; Prepare used runtime journey state only.",)
    root = project_path.expanduser().resolve()
    checks = (
        "README.md",
        "docs/project/roadmap/index.md",
        "docs/process/development-guide.md",
    )
    return tuple(f"{path}: {'present' if (root / path).exists() else 'missing'}" for path in checks)


def _format_list(items: tuple[str, ...]) -> list[str]:
    return [f"- {item}" for item in items] if items else ["none"]


def _card_text(text: str) -> str:
    width = 54
    return f"│ {text[:width]:<{width}} │"


def _card_context_items(items: tuple[str, ...]) -> list[str]:
    if not items:
        return [_card_text("none")]
    lines: list[str] = []
    for item in items:
        marker = "✓" if "present" in item else "○"
        lines.append(_card_text(f"{marker} {item}"))
    return lines


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


def _title_leaf(title: str) -> str:
    return title.split("/")[-1].strip()


def _cv_title(title: str) -> str:
    return title.split("/")[0].strip()


def _normalize_required(value: str, field_name: str) -> str:
    normalized = value.strip() if isinstance(value, str) else ""
    if not normalized:
        raise ValueError(f"{field_name} must not be empty")
    return normalized
