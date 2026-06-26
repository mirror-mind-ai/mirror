import pytest

from memory import MemoryClient
from memory.builder.delivery_cursor import get_delivery_cursor, set_delivery_cursor
from memory.builder.delivery_story_plan import (
    approve_delivery_story_plan,
    plan_delivery_story_checkpoint,
    render_delivery_story_plan_report,
)
from memory.config import default_db_path_for_home


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
    assert "│        🧭■  DELIVERY STORY PLAN CHECKPOINT             │" in rendered
    assert "│ delivery story                                         │" in rendered
    assert "│ CV20.DS5                                               │" in rendered
    assert "│ plan artifact                                          │" in rendered
    assert "│ - CV20.DS5.US1                                         │" in rendered
    assert "Implementation remains blocked until the DS-level" in rendered
