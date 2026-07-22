import re

import pytest

from memory import MemoryClient
from memory.builder.ariad_method import get_ariad_method
from memory.builder.delivery_cursor import get_delivery_cursor, set_delivery_cursor
from memory.builder.delivery_story_plan import (
    approve_delivery_story_plan,
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
