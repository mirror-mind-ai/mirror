import pytest

from memory import MemoryClient
from memory.builder.ariad_method import get_ariad_method
from memory.builder.delivery_cursor import get_delivery_cursor, set_delivery_cursor
from memory.builder.lifecycle import (
    BuilderLifecycleItem,
    assert_implementation_allowed,
    plan_lifecycle_item,
    prepare_lifecycle_item,
    pull_lifecycle_item,
    render_plan_checkpoint,
    render_prepare_report,
    render_pull_report,
    validate_lifecycle_item,
)
from memory.config import default_db_path_for_home


def _store(tmp_path):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    client = MemoryClient(env="test", db_path=db_path)
    return client, client.store


def test_pull_lifecycle_item_updates_cursor_and_renders_report(tmp_path):
    _client, store = _store(tmp_path)
    set_delivery_cursor(store, journey="sandbox-pet-store", method="ariad")

    report = pull_lifecycle_item(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        item=BuilderLifecycleItem(
            code="CHECKOUT-FLOW",
            title="Checkout Flow",
            level="user_story",
            why_now="next candidate capability",
        ),
    )

    cursor = get_delivery_cursor(store, "sandbox-pet-store")
    assert cursor is not None
    assert cursor.active_item == "CHECKOUT-FLOW"
    assert cursor.last_delivery_event == "pull"
    rendered = render_pull_report(report)
    assert "<<<ARIAD:DELIVERY_STORY_IDENTIFIED>>>" in rendered
    assert "<<<END:DELIVERY_STORY_IDENTIFIED>>>" in rendered
    assert "Ariad: ◉ Pull | ○ Prepare | ○ Expand | ○ Plan" in rendered
    assert "DELIVERY STORY IDENTIFIED" in rendered
    assert "roadmap candidate" in rendered
    assert "roadmap placement" in rendered
    assert "🟪[CHECKOUT-FLOW] Checkout Flow" in rendered
    assert "pulled into active Delivery Work" in rendered
    assert "active item: CHECKOUT-FLOW" in rendered
    assert "Prepare" in rendered
    assert "Plan and later lifecycle work were not executed" in rendered


def test_lifecycle_updates_preserve_delivery_story_state(tmp_path):
    _client, store = _store(tmp_path)
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        child_work_items=("CV20.DS5.US1",),
        aggregate_checkpoint_status=("plan:pending",),
    )

    pull_lifecycle_item(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        item=BuilderLifecycleItem(
            code="CV20.DS5.US1",
            title="Choose Navigator Flow Unit",
            level="user_story",
            why_now="next slice",
        ),
    )
    prepare_lifecycle_item(store, journey="sandbox-pet-store", method="ariad")

    cursor = get_delivery_cursor(store, "sandbox-pet-store")
    assert cursor is not None
    assert cursor.child_work_items == ("CV20.DS5.US1",)
    assert cursor.aggregate_checkpoint_status == ("plan:pending",)


def test_pull_lifecycle_item_requires_existing_cursor(tmp_path):
    _client, store = _store(tmp_path)

    with pytest.raises(ValueError, match="delivery cursor"):
        pull_lifecycle_item(
            store,
            journey="sandbox-pet-store",
            method="ariad",
            item=BuilderLifecycleItem(
                code="CHECKOUT-FLOW",
                title="Checkout Flow",
                level="user_story",
                why_now="next candidate capability",
            ),
        )


def test_pull_lifecycle_item_rejects_unknown_level(tmp_path):
    _client, store = _store(tmp_path)
    set_delivery_cursor(store, journey="sandbox-pet-store", method="ariad")

    with pytest.raises(ValueError, match="item level"):
        pull_lifecycle_item(
            store,
            journey="sandbox-pet-store",
            method="ariad",
            item=BuilderLifecycleItem(
                code="CHECKOUT-FLOW",
                title="Checkout Flow",
                level="epic",
                why_now="next candidate capability",
            ),
        )


def test_prepare_lifecycle_item_updates_cursor_and_renders_report(tmp_path):
    project = tmp_path / "project"
    (project / "docs/project/roadmap").mkdir(parents=True)
    (project / "docs/process").mkdir(parents=True)
    (project / "README.md").write_text("# Project\n", encoding="utf-8")
    (project / "docs/project/roadmap/index.md").write_text("# Roadmap\n", encoding="utf-8")
    _client, store = _store(tmp_path)
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CHECKOUT-FLOW",
        last_delivery_event="pull",
    )

    report = prepare_lifecycle_item(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        project_path=project,
    )

    cursor = get_delivery_cursor(store, "sandbox-pet-store")
    assert cursor is not None
    assert cursor.active_item == "CHECKOUT-FLOW"
    assert cursor.last_delivery_event == "prepare"
    rendered = render_prepare_report(report)
    assert "<<<ARIAD:PREPARE_FIELD_READING>>>" in rendered
    assert "<<<END:PREPARE_FIELD_READING>>>" in rendered
    assert "Ariad: ✓ Pull | ◉ Prepare | ○ Expand | ○ Plan" in rendered
    assert "PREPARE FIELD READING" in rendered
    assert "🟦[CHECKOUT-FLOW]" in rendered
    assert "✓ README.md: present" in rendered
    assert "○ docs/process/development-guide.md: missing" in rendered
    assert "story shape" in rendered
    assert "risks" in rendered
    assert "applicable rules" in rendered
    assert "Plan" in rendered
    assert "Plan was not created" in rendered


def test_prepare_lifecycle_item_requires_active_item(tmp_path):
    _client, store = _store(tmp_path)
    set_delivery_cursor(store, journey="sandbox-pet-store", method="ariad")

    with pytest.raises(ValueError, match="active item"):
        prepare_lifecycle_item(store, journey="sandbox-pet-store", method="ariad")


def test_plan_lifecycle_item_updates_cursor_and_renders_checkpoint(tmp_path):
    _client, store = _store(tmp_path)
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV2.DS1",
        active_item_title="Checkout entry and address capture",
        active_item_level="user_story",
        last_delivery_event="prepare",
    )

    plan_path = tmp_path / "project" / "docs/project/roadmap/cv2/cv2-ds1/plan.md"
    report = plan_lifecycle_item(
        store,
        journey="sandbox-pet-store",
        method=get_ariad_method(),
        objective="Plan checkout entry implementation.",
        local_rules=("Use uv run for Python commands and tests.", "Do not use git add ."),
        plan_artifact_path=plan_path,
    )

    cursor = get_delivery_cursor(store, "sandbox-pet-store")
    assert cursor is not None
    assert cursor.active_item == "CV2.DS1"
    assert cursor.active_checkpoint == "after_plan"
    assert cursor.pending_confirmation == "navigator_approval"
    assert cursor.last_delivery_event == "plan"
    rendered = render_plan_checkpoint(report)
    assert "<<<ARIAD:PLAN_CHECKPOINT>>>" in rendered
    assert "<<<END:PLAN_CHECKPOINT>>>" in rendered
    assert "Ariad: ✓ Pull | ✓ Prepare | ✓ Expand | ◉ Plan" in rendered
    assert "PLAN CHECKPOINT" in rendered
    assert "🟦[CV2.DS1]" in rendered
    assert "Given the relevant starting state" in rendered
    assert "E2E" in rendered
    assert "TDD" in rendered
    assert "Use uv run" in rendered
    assert f"story_package_path={plan_path.parent}" in rendered
    assert f"index_artifact_path={plan_path.parent / 'index.md'}" in rendered
    assert f"plan_artifact_path={plan_path}" in rendered
    assert f"test_guide_artifact_path={plan_path.parent / 'test-guide.md'}" in rendered
    assert "pending: navigator_approval" in rendered
    assert "next action" in rendered
    assert "approves the Plan or requests changes" in rendered
    assert "Implementation remains blocked" in rendered
    assert (plan_path.parent / "index.md").exists()
    assert plan_path.exists()
    assert (plan_path.parent / "test-guide.md").exists()
    assert "# Plan — CV2.DS1" in plan_path.read_text(encoding="utf-8")


def test_plan_lifecycle_item_requires_prepare(tmp_path):
    _client, store = _store(tmp_path)
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV2.DS1",
        last_delivery_event="pull",
    )

    with pytest.raises(ValueError, match="Prepare"):
        plan_lifecycle_item(store, journey="sandbox-pet-store", method=get_ariad_method())


def test_plan_lifecycle_item_requires_active_item(tmp_path):
    _client, store = _store(tmp_path)
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        last_delivery_event="prepare",
    )

    with pytest.raises(ValueError, match="active item"):
        plan_lifecycle_item(store, journey="sandbox-pet-store", method=get_ariad_method())


def test_validation_accepts_approved_delivery_story_plan_with_implementation_evidence(tmp_path):
    _client, store = _store(tmp_path)
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV2.DS1",
        active_item_level="delivery_story",
        last_delivery_event="delivery_story_plan_approved",
        navigator_flow_unit="delivery_story",
        child_work_items=("CV2.DS1.US1",),
        aggregate_checkpoint_status=("plan:approved",),
    )

    report = validate_lifecycle_item(
        store,
        journey="sandbox-pet-store",
        method=get_ariad_method(),
        automated_checks=("npm test",),
        checks_status="passed",
        navigator_validation_route="Validate checkout DS.",
        navigator_accepted=True,
        implementation_complete=True,
    )

    assert report.missing_evidence == ()
    assert report.cursor.last_delivery_event == "validation_passed"


def test_implementation_guard_allows_approved_delivery_story_plan(tmp_path):
    _client, store = _store(tmp_path)
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV2.DS1",
        active_item_level="delivery_story",
        last_delivery_event="delivery_story_plan_approved",
        navigator_flow_unit="delivery_story",
        child_work_items=("CV2.DS1.US1",),
        aggregate_checkpoint_status=("plan:approved",),
    )

    cursor = assert_implementation_allowed(store, journey="sandbox-pet-store")

    assert cursor.active_item == "CV2.DS1"


def test_implementation_guard_blocks_pending_confirmation(tmp_path):
    _client, store = _store(tmp_path)
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV2.DS1",
        active_checkpoint="after_plan",
        pending_confirmation="navigator_approval",
        last_delivery_event="plan",
    )

    with pytest.raises(PermissionError, match="navigator_approval"):
        assert_implementation_allowed(store, journey="sandbox-pet-store")
