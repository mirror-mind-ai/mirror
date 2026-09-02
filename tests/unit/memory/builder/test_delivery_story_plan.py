import re

import pytest

from memory import MemoryClient
from memory.builder.ariad_method import get_ariad_method
from memory.builder.delivery_cursor import get_delivery_cursor, set_delivery_cursor
from memory.builder.delivery_story_plan import (
    PlanPreauthorizationMismatch,
    approve_delivery_story_plan,
    cancel_delivery_story_plan_preauthorization,
    plan_delivery_story_checkpoint,
    render_delivery_story_plan_report,
)
from memory.config import default_db_path_for_home


def _normalize(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower())


def _store(tmp_path):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    client = MemoryClient(env="test", db_path=db_path)
    return client, client.store


def test_plan_delivery_story_requires_delivery_story_flow(tmp_path):
    _client, store = _store(tmp_path)
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV20.DS5",
        active_item_level="delivery_story",
        navigator_flow_unit="story_by_story",
        child_work_items=("CV20.DS5.US1",),
    )

    with pytest.raises(ValueError, match="navigator_flow_unit=delivery_story"):
        plan_delivery_story_checkpoint(
            store,
            journey="sandbox-pet-store",
            method="ariad",
            objective="Approve aggregate DS plan.",
        )


def test_plan_delivery_story_materializes_plan_artifact(tmp_path):
    _client, store = _store(tmp_path)
    artifact = tmp_path / "story" / "plan.md"
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV20.DS5",
        active_item_title="Delivery Story Level Lifecycle",
        active_item_level="delivery_story",
        navigator_flow_unit="delivery_story",
        child_work_items=("CV20.DS5.US1",),
    )

    report = plan_delivery_story_checkpoint(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        objective="Approve aggregate DS plan.",
        plan_artifact_path=artifact,
    )

    assert report.plan_artifact_path == artifact
    assert artifact.exists()
    assert "# Delivery Story Plan — CV20.DS5" in artifact.read_text(encoding="utf-8")


def test_plan_delivery_story_records_pending_aggregate_plan(tmp_path):
    _client, store = _store(tmp_path)
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV20.DS5",
        active_item_title="Delivery Story Level Lifecycle",
        active_item_level="delivery_story",
        navigator_flow_unit="delivery_story",
    )

    report = plan_delivery_story_checkpoint(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        objective="Approve aggregate DS plan.",
        child_work_items=("CV20.DS5.US1", "CV20.DS5.TS1"),
    )

    cursor = get_delivery_cursor(store, "sandbox-pet-store")
    assert cursor is not None
    assert report.status == "pending_approval"
    assert cursor.active_checkpoint == "after_delivery_story_plan"
    assert cursor.pending_confirmation == "navigator_delivery_story_plan_approval"
    assert cursor.child_work_items == ("CV20.DS5.US1", "CV20.DS5.TS1")
    assert cursor.aggregate_checkpoint_status == ("plan:pending",)


def test_approve_delivery_story_plan_records_aggregate_approval(tmp_path):
    _client, store = _store(tmp_path)
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV20.DS5",
        active_item_level="delivery_story",
        navigator_flow_unit="delivery_story",
        child_work_items=("CV20.DS5.US1",),
        active_checkpoint="after_delivery_story_plan",
        pending_confirmation="navigator_delivery_story_plan_approval",
        aggregate_checkpoint_status=("plan:pending",),
    )

    report = approve_delivery_story_plan(store, journey="sandbox-pet-store", method="ariad")

    cursor = get_delivery_cursor(store, "sandbox-pet-store")
    assert cursor is not None
    assert report.status == "approved"
    assert cursor.active_checkpoint is None
    assert cursor.pending_confirmation is None
    assert cursor.last_delivery_event == "delivery_story_plan_approved"
    assert cursor.aggregate_checkpoint_status == ("plan:approved",)


def test_render_delivery_story_plan_report_lists_child_work_packages(tmp_path):
    _client, store = _store(tmp_path)
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV20.DS5",
        active_item_level="delivery_story",
        navigator_flow_unit="delivery_story",
    )
    report = plan_delivery_story_checkpoint(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        objective="Approve aggregate DS plan.",
        child_work_items=("CV20.DS5.US1",),
    )

    rendered = render_delivery_story_plan_report(report)

    assert "<<<ARIAD:DELIVERY_STORY_PLAN_CHECKPOINT>>>" in rendered
    assert "│        🧭  DELIVERY STORY PLAN                          │" in rendered
    assert "What is being planned?" in rendered
    assert "🟦[CV20.DS5]" in rendered
    assert "│ plan artifact                                          │" not in rendered
    assert "│ - CV20.DS5.US1                                         │" in rendered
    assert "Flow unit" not in rendered
    assert "Navigator gate" not in rendered
    assert "Review the plan artifact, then approve or revise." in rendered


def test_plan_delivery_story_materializes_full_package_when_absent(tmp_path):
    _client, store = _store(tmp_path)
    artifact = tmp_path / "cv20-ds5" / "plan.md"
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV20.DS5",
        active_item_title="Delivery Story Level Lifecycle",
        active_item_level="delivery_story",
        navigator_flow_unit="delivery_story",
    )

    report = plan_delivery_story_checkpoint(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        objective="Approve aggregate DS plan.",
        child_work_items=("CV20.DS5.US1", "CV20.DS5.TS1"),
        plan_artifact_path=artifact,
    )

    index_path = artifact.parent / "index.md"
    test_guide_path = artifact.parent / "test-guide.md"
    assert artifact.exists()
    assert index_path.exists()
    assert test_guide_path.exists()
    index_text = index_path.read_text(encoding="utf-8")
    assert "# CV20.DS5 \u2014 Delivery Story Level Lifecycle" in index_text
    assert "- CV20.DS5.US1" in index_text
    assert "- CV20.DS5.TS1" in index_text
    test_guide_text = test_guide_path.read_text(encoding="utf-8")
    assert "# Test Guide \u2014 CV20.DS5" in test_guide_text
    assert "Pending implementation and validation." in test_guide_text
    statuses = {(artifact.kind, artifact.status) for artifact in report.materialized_artifacts}
    assert ("story index", "created") in statuses
    assert ("plan", "created") in statuses
    assert ("test guide", "created") in statuses


def test_plan_delivery_story_preserves_existing_package_artifacts(tmp_path):
    _client, store = _store(tmp_path)
    artifact = tmp_path / "cv20-ds5" / "plan.md"
    artifact.parent.mkdir(parents=True)
    index_path = artifact.parent / "index.md"
    test_guide_path = artifact.parent / "test-guide.md"
    index_text = "# Hand-authored DS index\n\nConsolidated Team Position.\n"
    test_guide_text = "# Hand-authored test guide\n"
    index_path.write_text(index_text, encoding="utf-8")
    test_guide_path.write_text(test_guide_text, encoding="utf-8")
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV20.DS5",
        active_item_level="delivery_story",
        navigator_flow_unit="delivery_story",
    )

    report = plan_delivery_story_checkpoint(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        objective="Approve aggregate DS plan.",
        child_work_items=("CV20.DS5.US1",),
        plan_artifact_path=artifact,
    )

    assert index_path.read_text(encoding="utf-8") == index_text
    assert test_guide_path.read_text(encoding="utf-8") == test_guide_text
    assert artifact.exists()
    statuses = {(artifact.kind, artifact.status) for artifact in report.materialized_artifacts}
    assert ("story index", "existing") in statuses
    assert ("plan", "created") in statuses
    assert ("test guide", "existing") in statuses


def test_approve_delivery_story_plan_preserves_authored_plan(tmp_path):
    _client, store = _store(tmp_path)
    artifact = tmp_path / "cv20-ds5" / "plan.md"
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV20.DS5",
        active_item_title="Delivery Story Level Lifecycle",
        active_item_level="delivery_story",
        navigator_flow_unit="delivery_story",
    )
    plan_delivery_story_checkpoint(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        objective="Approve aggregate DS plan.",
        child_work_items=("CV20.DS5.US1",),
        plan_artifact_path=artifact,
    )
    # The driver authors real content into a scaffolded contract section.
    authored = artifact.read_text(encoding="utf-8").replace(
        "Pending \u2014 name what this Delivery Story delivers across its child work packages.",
        "Ship the aggregate checkout flow across CV20.DS5.US1.",
    )
    artifact.write_text(authored, encoding="utf-8")
    index_bytes = (artifact.parent / "index.md").read_bytes()
    test_guide_bytes = (artifact.parent / "test-guide.md").read_bytes()

    report = approve_delivery_story_plan(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        plan_artifact_path=artifact,
    )

    assert artifact.read_text(encoding="utf-8") == authored
    assert (artifact.parent / "index.md").read_bytes() == index_bytes
    assert (artifact.parent / "test-guide.md").read_bytes() == test_guide_bytes
    statuses = {(item.kind, item.status) for item in report.materialized_artifacts}
    assert ("story index", "existing") in statuses
    assert ("plan", "existing") in statuses
    assert ("test guide", "existing") in statuses


def test_delivery_story_plan_artifact_scaffolds_plan_contract_outputs(tmp_path):
    _client, store = _store(tmp_path)
    artifact = tmp_path / "cv20-ds5" / "plan.md"
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV20.DS5",
        active_item_title="Delivery Story Level Lifecycle",
        active_item_level="delivery_story",
        navigator_flow_unit="delivery_story",
    )
    plan_delivery_story_checkpoint(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        objective="Approve aggregate DS plan.",
        child_work_items=("CV20.DS5.US1", "CV20.DS5.TS1"),
        plan_artifact_path=artifact,
    )

    plan_text = artifact.read_text(encoding="utf-8")
    plan_contract = next(
        contract for contract in get_ariad_method().contracts if contract.id == "plan_contract"
    )
    headers = {_normalize(line[3:]) for line in plan_text.splitlines() if line.startswith("## ")}
    for required_output in plan_contract.required_outputs:
        assert _normalize(required_output) in headers, required_output
    assert "## Scope" in plan_text
    assert "## Non-Goals" in plan_text
    assert "## Acceptance Behavior" in plan_text
    assert "## Validation Route" in plan_text
    assert "## Implementation Contract" in plan_text


def test_delivery_story_plan_artifact_omits_mutable_status(tmp_path):
    _client, store = _store(tmp_path)
    artifact = tmp_path / "cv20-ds5" / "plan.md"
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV20.DS5",
        active_item_title="Delivery Story Level Lifecycle",
        active_item_level="delivery_story",
        navigator_flow_unit="delivery_story",
    )
    plan_delivery_story_checkpoint(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        objective="Approve aggregate DS plan.",
        child_work_items=("CV20.DS5.US1",),
        plan_artifact_path=artifact,
    )

    plan_text = artifact.read_text(encoding="utf-8")
    assert "**Status:**" not in plan_text
    assert "## Approval Gate" not in plan_text
    assert "## Boundary" not in plan_text


def test_approve_delivery_story_plan_creates_plan_when_absent(tmp_path):
    _client, store = _store(tmp_path)
    artifact = tmp_path / "cv20-ds5" / "plan.md"
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV20.DS5",
        active_item_level="delivery_story",
        navigator_flow_unit="delivery_story",
        child_work_items=("CV20.DS5.US1",),
        active_checkpoint="after_delivery_story_plan",
        pending_confirmation="navigator_delivery_story_plan_approval",
        aggregate_checkpoint_status=("plan:pending",),
    )

    report = approve_delivery_story_plan(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        plan_artifact_path=artifact,
    )

    assert artifact.exists()
    statuses = {(item.kind, item.status) for item in report.materialized_artifacts}
    assert ("plan", "created") in statuses


def test_approve_delivery_story_plan_flags_unfilled_sections(tmp_path):
    _client, store = _store(tmp_path)
    artifact = tmp_path / "cv20-ds5" / "plan.md"
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV20.DS5",
        active_item_title="Delivery Story Level Lifecycle",
        active_item_level="delivery_story",
        navigator_flow_unit="delivery_story",
    )
    plan_delivery_story_checkpoint(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        objective="Approve aggregate DS plan.",
        child_work_items=("CV20.DS5.US1",),
        plan_artifact_path=artifact,
    )

    report = approve_delivery_story_plan(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        plan_artifact_path=artifact,
    )

    assert set(report.unfilled_sections) == {
        "Scope",
        "Non-Goals",
        "Acceptance Behavior",
        "Validation Route",
        "Implementation Contract",
    }
    rendered = render_delivery_story_plan_report(report)
    assert "Sections still pending" in rendered
    assert "Scope" in rendered


def test_plan_delivery_story_preserves_existing_driver_authored_plan(tmp_path):
    _client, store = _store(tmp_path)
    artifact = tmp_path / "cv20-ds5" / "plan.md"
    artifact.parent.mkdir(parents=True)
    authored = "# Driver Plan\n\n## Scope\n\nPreserve this exact plan.\n"
    artifact.write_text(authored, encoding="utf-8")
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV20.DS5",
        active_item_level="delivery_story",
        navigator_flow_unit="delivery_story",
        child_work_items=("CV20.DS5.US1",),
    )

    report = plan_delivery_story_checkpoint(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        objective="Preserve the authored plan.",
        plan_artifact_path=artifact,
    )

    assert artifact.read_text(encoding="utf-8") == authored
    assert ("plan", "existing") in {
        (item.kind, item.status) for item in report.materialized_artifacts
    }


def test_plan_preauthorization_binds_exact_structural_scope_without_payload(tmp_path):
    _client, store = _store(tmp_path)
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV20.DS5",
        active_item_level="delivery_story",
        navigator_flow_unit="delivery_story",
        child_work_items=("CV20.DS5.TS1", "CV20.DS5.US1"),
        cursor_generation=7,
    )

    report = plan_delivery_story_checkpoint(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        objective="Do not persist this objective as authority.",
        child_work_items=("CV20.DS5.US1", "CV20.DS5.TS1"),
        preauthorize=True,
        stop_boundary="navigator_validation",
    )

    receipt = report.cursor.plan_preauthorization
    assert receipt is not None
    assert receipt.status == "pending"
    assert receipt.cursor_generation == 7
    assert receipt.child_work_items == ("CV20.DS5.TS1", "CV20.DS5.US1")
    assert receipt.stop_boundary == "navigator_validation"
    assert len(receipt.scope_fingerprint) == 64
    serialized = get_delivery_cursor(store, "sandbox-pet-store").plan_preauthorization
    assert serialized == receipt
    assert "objective" not in repr(receipt).lower()
    assert "Do not persist" not in repr(receipt)


def test_preauthorized_approval_blocks_incomplete_plan_and_invalidates_receipt(tmp_path):
    _client, store = _store(tmp_path)
    artifact = tmp_path / "cv20-ds5" / "plan.md"
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV20.DS5",
        active_item_level="delivery_story",
        navigator_flow_unit="delivery_story",
        cursor_generation=1,
    )
    plan_delivery_story_checkpoint(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        objective="Plan aggregate delivery.",
        child_work_items=("CV20.DS5.US1",),
        plan_artifact_path=artifact,
        preauthorize=True,
    )

    with pytest.raises(PlanPreauthorizationMismatch) as exc_info:
        approve_delivery_story_plan(
            store,
            journey="sandbox-pet-store",
            method="ariad",
            plan_artifact_path=artifact,
            use_preauthorization=True,
        )

    assert exc_info.value.reason == "plan_incomplete"
    cursor = get_delivery_cursor(store, "sandbox-pet-store")
    assert cursor.active_checkpoint == "after_delivery_story_plan"
    assert cursor.pending_confirmation == "navigator_delivery_story_plan_approval"
    assert cursor.plan_preauthorization.status == "invalidated"
    assert cursor.plan_preauthorization.reason == "plan_incomplete"


def test_preauthorized_approval_consumes_once_after_complete_exact_plan(tmp_path):
    _client, store = _store(tmp_path)
    artifact = tmp_path / "cv20-ds5" / "plan.md"
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV20.DS5",
        active_item_level="delivery_story",
        navigator_flow_unit="delivery_story",
        cursor_generation=2,
    )
    plan_delivery_story_checkpoint(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        objective="Plan aggregate delivery.",
        child_work_items=("CV20.DS5.US1", "CV20.DS5.TS1"),
        plan_artifact_path=artifact,
        preauthorize=True,
    )
    artifact.write_text(
        artifact.read_text(encoding="utf-8").replace("Pending — ", "Decided: "),
        encoding="utf-8",
    )

    approved = approve_delivery_story_plan(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        plan_artifact_path=artifact,
        use_preauthorization=True,
    )
    retried = approve_delivery_story_plan(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        plan_artifact_path=artifact,
        use_preauthorization=True,
    )

    assert approved.status == "approved"
    assert approved.implementation_started is True
    assert approved.cursor.plan_preauthorization.status == "consumed"
    assert retried.status == "already_approved"
    assert retried.implementation_started is False
    assert retried.materialized_artifacts == ()


def test_preauthorized_approval_treats_child_order_as_presentational(tmp_path):
    _client, store = _store(tmp_path)
    artifact = tmp_path / "cv20-ds5" / "plan.md"
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV20.DS5",
        active_item_level="delivery_story",
        navigator_flow_unit="delivery_story",
        cursor_generation=2,
    )
    planned = plan_delivery_story_checkpoint(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        objective="Plan aggregate delivery.",
        child_work_items=("CV20.DS5.US1", "CV20.DS5.TS1"),
        plan_artifact_path=artifact,
        preauthorize=True,
    )
    set_delivery_cursor(
        store,
        journey=planned.cursor.journey,
        method=planned.cursor.method,
        active_item=planned.cursor.active_item,
        active_item_level=planned.cursor.active_item_level,
        active_checkpoint=planned.cursor.active_checkpoint,
        pending_confirmation=planned.cursor.pending_confirmation,
        last_delivery_event=planned.cursor.last_delivery_event,
        navigator_flow_unit=planned.cursor.navigator_flow_unit,
        child_work_items=("CV20.DS5.TS1", "CV20.DS5.US1"),
        aggregate_checkpoint_status=planned.cursor.aggregate_checkpoint_status,
    )
    artifact.write_text(
        artifact.read_text(encoding="utf-8").replace("Pending — ", "Decided: "),
        encoding="utf-8",
    )

    report = approve_delivery_story_plan(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        plan_artifact_path=artifact,
        use_preauthorization=True,
    )

    assert report.status == "approved"


def test_preauthorized_approval_reports_child_scope_change_without_payload(tmp_path):
    _client, store = _store(tmp_path)
    artifact = tmp_path / "cv20-ds5" / "plan.md"
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV20.DS5",
        active_item_level="delivery_story",
        navigator_flow_unit="delivery_story",
    )
    planned = plan_delivery_story_checkpoint(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        objective="Private Plan objective.",
        child_work_items=("CV20.DS5.US1",),
        plan_artifact_path=artifact,
        preauthorize=True,
    )
    set_delivery_cursor(
        store,
        journey=planned.cursor.journey,
        method=planned.cursor.method,
        active_item=planned.cursor.active_item,
        active_item_level=planned.cursor.active_item_level,
        active_checkpoint=planned.cursor.active_checkpoint,
        pending_confirmation=planned.cursor.pending_confirmation,
        last_delivery_event=planned.cursor.last_delivery_event,
        navigator_flow_unit=planned.cursor.navigator_flow_unit,
        child_work_items=("CV20.DS5.US1", "CV20.DS5.TS1"),
        aggregate_checkpoint_status=planned.cursor.aggregate_checkpoint_status,
    )

    with pytest.raises(PlanPreauthorizationMismatch) as exc_info:
        approve_delivery_story_plan(
            store,
            journey="sandbox-pet-store",
            method="ariad",
            plan_artifact_path=artifact,
            use_preauthorization=True,
        )

    assert exc_info.value.reason == "child_scope_changed"
    assert "Private Plan objective" not in str(exc_info.value)


def test_navigator_can_cancel_pending_plan_preauthorization(tmp_path):
    _client, store = _store(tmp_path)
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV20.DS5",
        active_item_level="delivery_story",
        navigator_flow_unit="delivery_story",
    )
    plan_delivery_story_checkpoint(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        objective="Plan aggregate delivery.",
        child_work_items=("CV20.DS5.US1",),
        preauthorize=True,
    )

    cursor = cancel_delivery_story_plan_preauthorization(
        store, journey="sandbox-pet-store", method="ariad"
    )

    assert cursor.plan_preauthorization.status == "invalidated"
    assert cursor.plan_preauthorization.reason == "navigator_cancelled"
    assert cursor.pending_confirmation == "navigator_delivery_story_plan_approval"


def test_approve_delivery_story_plan_no_warning_when_sections_authored(tmp_path):
    _client, store = _store(tmp_path)
    artifact = tmp_path / "cv20-ds5" / "plan.md"
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV20.DS5",
        active_item_title="Delivery Story Level Lifecycle",
        active_item_level="delivery_story",
        navigator_flow_unit="delivery_story",
    )
    plan_delivery_story_checkpoint(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        objective="Approve aggregate DS plan.",
        child_work_items=("CV20.DS5.US1",),
        plan_artifact_path=artifact,
    )
    # The driver authors every section, breaking the scaffold placeholders.
    filled = artifact.read_text(encoding="utf-8").replace("Pending \u2014 ", "Decided: ")
    artifact.write_text(filled, encoding="utf-8")

    report = approve_delivery_story_plan(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        plan_artifact_path=artifact,
    )

    assert report.unfilled_sections == ()
    assert "Sections still pending" not in render_delivery_story_plan_report(report)
