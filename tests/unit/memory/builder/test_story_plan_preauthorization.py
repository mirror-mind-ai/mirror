import json
from dataclasses import replace

import pytest

from memory import MemoryClient
from memory.builder.ariad_method import get_ariad_method
from memory.builder.delivery_cursor import get_delivery_cursor, set_delivery_cursor
from memory.builder.lifecycle import approve_plan_checkpoint, plan_lifecycle_item
from memory.builder.plan_preauthorization import PlanPreauthorizationMismatch
from memory.builder.story_plan_preauthorization import (
    approve_story_plan_with_preauthorization,
    cancel_story_plan_preauthorization,
)
from memory.config import default_db_path_for_home


def _store(tmp_path):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    client = MemoryClient(env="test", db_path=db_path)
    return client.store


def _complete_plan(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        """# Plan — CV20.DS16.US1

## Objective

Deliver exact story authority.

## Scope

- Bind one active story structurally.

## Non-Goals

- No sibling scope.

## Acceptance Behavior

Given exact authority\nWhen approval is consumed\nThen implementation starts once.

## Validation Route

- Run focused tests and Navigator validation.

## Implementation Contract

- Use TDD and stop at Navigator Validation.
""",
        encoding="utf-8",
    )


def _planned_story(tmp_path, *, level="user_story"):
    store = _store(tmp_path)
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV20.DS16.US1" if level == "user_story" else "CV20.DS16.TS1",
        active_item_title="Conditional story orchestration",
        active_item_level=level,
        last_delivery_event="prepare",
        navigator_flow_unit="story_by_story",
        cursor_generation=7,
    )
    plan_path = tmp_path / "project" / "docs" / "project" / "roadmap" / "story" / "plan.md"
    _complete_plan(plan_path)
    report = plan_lifecycle_item(
        store,
        journey="sandbox-pet-store",
        method=get_ariad_method(),
        plan_artifact_path=plan_path,
        preauthorize=True,
        stop_boundary="navigator_validation",
    )
    return store, plan_path, report


@pytest.mark.parametrize("level", ["user_story", "technical_story"])
def test_story_plan_records_payload_free_exact_scope_receipt(tmp_path, level):
    store, _plan_path, report = _planned_story(tmp_path, level=level)

    receipt = report.cursor.plan_preauthorization
    assert receipt is not None
    assert receipt.active_item_level == level
    assert receipt.flow_unit == "story_by_story"
    assert receipt.child_work_items == ()
    assert receipt.plan_contract_version == "story_plan@1"
    assert receipt.policy == "exact_scope"
    assert receipt.stop_boundary == "navigator_validation"
    metadata = store.get_runtime_session("__builder_delivery_cursor__:sandbox-pet-store").metadata
    persisted_receipt = json.loads(metadata)["plan_preauthorization"]
    serialized_receipt = json.dumps(persisted_receipt)
    assert "Conditional story orchestration" not in serialized_receipt
    assert "Deliver exact story authority" not in serialized_receipt


def test_accelerated_cadence_records_story_authority_without_explicit_flag(tmp_path):
    store = _store(tmp_path)
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV20.DS16.US1",
        active_item_title="Conditional story orchestration",
        active_item_level="user_story",
        last_delivery_event="prepare",
        cadence_profile="accelerated",
        navigator_flow_unit="story_by_story",
        cursor_generation=7,
    )
    plan_path = tmp_path / "project" / "story" / "plan.md"
    _complete_plan(plan_path)

    report = plan_lifecycle_item(
        store,
        journey="sandbox-pet-store",
        method=get_ariad_method(),
        plan_artifact_path=plan_path,
    )

    assert report.preauthorization_recorded is True
    assert report.cursor.plan_preauthorization is not None
    assert report.cursor.plan_preauthorization.status == "pending"
    assert report.cursor.plan_preauthorization.stop_boundary == "navigator_validation"


def test_story_authority_follows_method_policy_instead_of_accelerated_profile_name(tmp_path):
    store = _store(tmp_path)
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV20.DS16.US1",
        active_item_title="Conditional story orchestration",
        active_item_level="user_story",
        last_delivery_event="prepare",
        cadence_profile="accelerated",
        navigator_flow_unit="story_by_story",
        cursor_generation=7,
    )
    plan_path = tmp_path / "project" / "story" / "plan.md"
    _complete_plan(plan_path)
    method = get_ariad_method().replace(
        cadence_profiles=tuple(
            profile.replace(plan_approval_policy="navigator_approval")
            for profile in get_ariad_method().cadence_profiles
        )
    )

    report = plan_lifecycle_item(
        store,
        journey="sandbox-pet-store",
        method=method,
        plan_artifact_path=plan_path,
    )

    assert report.preauthorization_recorded is False
    assert report.cursor.plan_preauthorization is None


@pytest.mark.parametrize("cadence", [None, "stepwise", "checkpoint"])
def test_non_accelerated_cadence_keeps_plan_gate_without_explicit_authority(tmp_path, cadence):
    store = _store(tmp_path)
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV20.DS16.US1",
        active_item_title="Conditional story orchestration",
        active_item_level="user_story",
        last_delivery_event="prepare",
        cadence_profile=cadence,
        navigator_flow_unit="story_by_story",
        cursor_generation=7,
    )
    plan_path = tmp_path / "project" / "story" / "plan.md"
    _complete_plan(plan_path)

    report = plan_lifecycle_item(
        store,
        journey="sandbox-pet-store",
        method=get_ariad_method(),
        plan_artifact_path=plan_path,
    )

    assert report.preauthorization_recorded is False
    assert report.cursor.plan_preauthorization is None
    assert report.cursor.pending_confirmation == "navigator_approval"


def test_story_plan_preauthorization_consumes_once_atomically(tmp_path):
    store, plan_path, _report = _planned_story(tmp_path)

    approved = approve_story_plan_with_preauthorization(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        plan_artifact_path=plan_path,
    )
    retried = approve_story_plan_with_preauthorization(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        plan_artifact_path=plan_path,
    )

    assert approved.status == "approved"
    assert approved.implementation_started is True
    assert retried.status == "already_approved"
    assert retried.implementation_started is False
    cursor = get_delivery_cursor(store, "sandbox-pet-store")
    assert cursor.last_delivery_event == "plan_approved"
    assert cursor.plan_preauthorization.status == "consumed"


def test_story_plan_preauthorization_accepts_placeholder_as_product_vocabulary(tmp_path):
    store, plan_path, _report = _planned_story(tmp_path)
    plan_path.write_text(
        plan_path.read_text(encoding="utf-8").replace(
            "- No sibling scope.",
            "- Do not implement the sibling Payment placeholder story.",
        ),
        encoding="utf-8",
    )

    approved = approve_story_plan_with_preauthorization(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        plan_artifact_path=plan_path,
    )

    assert approved.status == "approved"
    assert approved.implementation_started is True


@pytest.mark.parametrize(
    "incomplete_body",
    ["Pending — decide scope.", "Placeholder — define the real scope."],
)
def test_story_plan_preauthorization_blocks_incomplete_plan(tmp_path, incomplete_body):
    store, plan_path, _report = _planned_story(tmp_path)
    plan_path.write_text(
        f"# Plan\n\n## Scope\n\n{incomplete_body}\n",
        encoding="utf-8",
    )

    with pytest.raises(PlanPreauthorizationMismatch) as exc:
        approve_story_plan_with_preauthorization(
            store,
            journey="sandbox-pet-store",
            method="ariad",
            plan_artifact_path=plan_path,
        )

    assert exc.value.reason == "plan_incomplete"
    cursor = get_delivery_cursor(store, "sandbox-pet-store")
    assert cursor.active_checkpoint == "after_plan"
    assert cursor.pending_confirmation == "navigator_approval"
    assert cursor.plan_preauthorization.status == "invalidated"


def test_story_plan_preauthorization_rejects_cross_level_or_tampered_fingerprint(tmp_path):
    store, plan_path, report = _planned_story(tmp_path)
    receipt = report.cursor.plan_preauthorization
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item=report.cursor.active_item,
        active_item_title=report.cursor.active_item_title,
        active_item_level="technical_story",
        active_checkpoint="after_plan",
        pending_confirmation="navigator_approval",
        last_delivery_event="plan",
        navigator_flow_unit="story_by_story",
        cursor_generation=report.cursor.cursor_generation,
        plan_preauthorization=replace(receipt, active_item_level="technical_story"),
    )

    with pytest.raises(PlanPreauthorizationMismatch) as exc:
        approve_story_plan_with_preauthorization(
            store,
            journey="sandbox-pet-store",
            method="ariad",
            plan_artifact_path=plan_path,
        )

    assert exc.value.reason == "scope_fingerprint_changed"


def test_story_preauthorization_requires_story_by_story_flow(tmp_path):
    store = _store(tmp_path)
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV20.DS16.US1",
        active_item_level="user_story",
        last_delivery_event="prepare",
        navigator_flow_unit="delivery_story",
    )

    with pytest.raises(ValueError, match="story_by_story"):
        plan_lifecycle_item(
            store,
            journey="sandbox-pet-store",
            method=get_ariad_method(),
            preauthorize=True,
        )


def test_ordinary_story_approval_invalidates_pending_authority(tmp_path):
    store, _plan_path, _report = _planned_story(tmp_path)

    cursor = approve_plan_checkpoint(store, journey="sandbox-pet-store", method="ariad")

    assert cursor.last_delivery_event == "plan_approved"
    assert cursor.plan_preauthorization.status == "invalidated"
    assert cursor.plan_preauthorization.reason == "ordinary_approval_used"


def test_navigator_can_cancel_story_plan_preauthorization(tmp_path):
    store, _plan_path, _report = _planned_story(tmp_path)

    cursor = cancel_story_plan_preauthorization(store, journey="sandbox-pet-store", method="ariad")

    assert cursor.plan_preauthorization.status == "invalidated"
    assert cursor.plan_preauthorization.reason == "navigator_cancelled"
    assert cursor.active_checkpoint == "after_plan"
    assert cursor.pending_confirmation == "navigator_approval"
