"""Contained Ariad lifecycle operations for Builder Mode."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from memory.builder.delivery_cursor import (
    BuilderDeliveryCursor,
    get_delivery_cursor,
    set_delivery_cursor,
)
from memory.builder.lifecycle_ribbon import render_lifecycle_ribbon
from memory.builder.method_definition import ContractDefinition, MethodDefinition
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
        granularity_decision=None,
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
        granularity_decision=existing.granularity_decision,
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
    recommended_code = f"{existing.active_item}.US1"
    recommended_title = _title_leaf(title)
    ds_dir = _artifact_directory(project_path, existing.active_item, title)
    us_dir = ds_dir / _story_folder_name(recommended_code, recommended_title)
    ds_dir.mkdir(parents=True, exist_ok=True)
    us_dir.mkdir(parents=True, exist_ok=True)
    ds_index = ds_dir / "index.md"
    us_index = us_dir / "index.md"
    if not ds_index.exists():
        ds_index.write_text(
            _render_delivery_story_index(
                existing.active_item, title, recommended_code, recommended_title
            ),
            encoding="utf-8",
        )
    if not us_index.exists():
        us_index.write_text(
            _render_user_story_index(recommended_code, recommended_title), encoding="utf-8"
        )
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
        granularity_decision="expanded_to_implementable_stories",
    )
    return BuilderExpandReport(
        journey=normalized_journey,
        method=normalized_method,
        delivery_story=existing.active_item,
        delivery_story_title=title,
        materialized_paths=(ds_index, us_index),
        recommended_story=recommended_code,
        recommended_story_title=recommended_title,
        cursor=cursor,
    )


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
            _card_text("next action"),
            _card_text("Navigator confirms the recommended story or chooses another child story."),
            "│                                                        │",
            _card_text("boundary"),
            _card_text("No Plan or implementation was executed."),
            "╰────────────────────────────────────────────────────────╯",
        ]
    )
    return wrap_ariad_surface("expand_decision", body + "\n")


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
    if existing.pending_confirmation:
        raise ValueError(
            f"Validation is blocked: pending confirmation {existing.pending_confirmation}."
        )
    if existing.last_delivery_event not in {"plan_approved", "implementation_complete"}:
        raise ValueError("Validation requires an approved Plan and completed implementation")
    if existing.last_delivery_event == "plan_approved" and not implementation_complete:
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
        granularity_decision=existing.granularity_decision,
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
    if cursor.last_delivery_event != "plan_approved":
        raise PermissionError(
            "Implementation is blocked: approved Plan is required before Implement."
        )
    return cursor


def render_pull_report(report: BuilderPullReport) -> str:
    """Render an Ariad Pull report using Delivery Story Identified grammar."""
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
                "│        🟪■  DELIVERY STORY IDENTIFIED                  │",
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
    import re

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
