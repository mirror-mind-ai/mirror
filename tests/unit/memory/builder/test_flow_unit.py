from memory import MemoryClient
from memory.builder.delivery_cursor import set_delivery_cursor
from memory.builder.flow_unit import (
    FLOW_UNIT_DELIVERY_STORY,
    FLOW_UNIT_STORY_BY_STORY,
    inspect_navigator_flow_unit,
    render_flow_unit_scope_confirmation_report,
    render_navigator_flow_unit_report,
    set_navigator_flow_unit,
)
from memory.builder.lifecycle import (
    BuilderLifecycleItem,
    expand_delivery_story,
    pull_lifecycle_item,
)
from memory.config import default_db_path_for_home


def _store(tmp_path):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    client = MemoryClient(env="test", db_path=db_path)
    return client, client.store


def test_navigator_flow_unit_defaults_to_story_by_story(tmp_path):
    _client, store = _store(tmp_path)
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV20.DS5",
        active_item_title="Delivery Story Level Lifecycle",
        active_item_level="delivery_story",
    )

    report = inspect_navigator_flow_unit(store, journey="sandbox-pet-store", method="ariad")

    assert report.flow_unit == FLOW_UNIT_STORY_BY_STORY
    assert report.source == "default"


def test_set_navigator_flow_unit_persists_delivery_story_choice(tmp_path):
    _client, store = _store(tmp_path)
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV20.DS5",
        active_item_title="Delivery Story Level Lifecycle",
        active_item_level="delivery_story",
        child_work_items=("CV20.DS5.US1",),
        aggregate_checkpoint_status=("plan:pending",),
    )

    report = set_navigator_flow_unit(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        flow_unit=FLOW_UNIT_DELIVERY_STORY,
    )
    inspected = inspect_navigator_flow_unit(store, journey="sandbox-pet-store", method="ariad")

    assert report.flow_unit == FLOW_UNIT_DELIVERY_STORY
    assert inspected.flow_unit == FLOW_UNIT_DELIVERY_STORY
    assert inspected.source == "cursor"
    assert inspected.cursor.last_delivery_event == "navigator_flow_unit_selected"
    assert inspected.cursor.child_work_items == ("CV20.DS5.US1",)
    assert inspected.cursor.aggregate_checkpoint_status == ("plan:pending",)


def test_render_navigator_flow_unit_report_records_selected_flow_unit(tmp_path):
    _client, store = _store(tmp_path)
    set_delivery_cursor(store, journey="sandbox-pet-store", method="ariad")
    report = inspect_navigator_flow_unit(store, journey="sandbox-pet-store", method="ariad")

    rendered = render_navigator_flow_unit_report(report)

    assert "<<<ARIAD:NAVIGATOR_FLOW_UNIT>>>" in rendered
    assert "╭────────────────────────────────────────────────────────╮" in rendered
    assert "│        🧭  FLOW UNIT SELECTED                         │" in rendered
    assert "Delivery Flow:" not in rendered
    assert "What changed?" in rendered
    assert "Navigator-facing lifecycle will continue story by" in rendered
    assert "Selected flow unit" in rendered
    assert "story_by_story" in rendered
    assert "child stories get their own Navigator checkpoints" in rendered
    assert "Choose the next move when ready." in rendered


def test_render_delivery_story_scope_confirmation_after_flow_unit_selection(tmp_path):
    _client, store = _store(tmp_path)
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV20.DS5",
        active_item_title="Delivery Story Level Lifecycle",
        active_item_level="delivery_story",
        child_work_items=("CV20.DS5.US1", "CV20.DS5.US2"),
    )
    report = set_navigator_flow_unit(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        flow_unit=FLOW_UNIT_DELIVERY_STORY,
    )

    rendered = render_flow_unit_scope_confirmation_report(report)

    assert "<<<ARIAD:DELIVERY_STORY_SCOPE_CONFIRMATION>>>" in rendered
    assert "│        🧭  DELIVERY STORY SCOPE CONFIRMATION            │" in rendered
    assert "My understanding" in rendered
    assert "This Delivery Story should deliver the scope implied" in rendered
    assert "by: Delivery Story Level Lifecycle." in rendered
    assert "Selected flow unit" not in rendered
    assert "Work packages in scope" in rendered
    assert "│ - CV20.DS5.US1                                         │" in rendered
    assert "Before I create the DS Plan, correct or add anything:" in rendered
    assert "1. Is this the right scope?" in rendered
    assert "What is out of scope?" not in rendered
    assert "validation evidence" not in rendered


def test_render_story_scope_confirmation_after_flow_unit_selection(tmp_path):
    _client, store = _store(tmp_path)
    set_delivery_cursor(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV20.DS5",
        active_item_title="Delivery Story Level Lifecycle",
        active_item_level="delivery_story",
        child_work_items=("CV20.DS5.US1", "CV20.DS5.US2"),
    )
    report = set_navigator_flow_unit(
        store,
        journey="sandbox-pet-store",
        method="ariad",
        flow_unit=FLOW_UNIT_STORY_BY_STORY,
    )

    rendered = render_flow_unit_scope_confirmation_report(report)

    assert "<<<ARIAD:NEXT_STORY_CONFIRMATION>>>" in rendered
    assert "│        🧭  NEXT STORY CONFIRMATION                      │" in rendered
    assert "My understanding" in rendered
    assert "which child story becomes the next" in rendered
    assert "Selected flow unit" not in rendered
    assert "Recommended story" in rendered
    assert "│ - CV20.DS5.US1                                         │" in rendered
    assert "CV20.DS5.US2" not in rendered
    assert "Before I create the Story Plan, correct or add" in rendered
    assert "anything:" in rendered
    assert "1. Is this the right next story?" in rendered
    assert "out of scope" not in rendered
    assert "validation evidence" not in rendered


# --- CV20.DS13 — scope confirmation reflects the active DS after pull->expand ---


def test_scope_confirmation_lists_active_ds_children_after_pull_expand_flow_unit(tmp_path):
    _client, store = _store(tmp_path)
    project = tmp_path / "project"
    ds_index = project / "docs/project/roadmap/ds-35-application-admin-parity/index.md"
    ds_index.parent.mkdir(parents=True)
    ds_index.write_text(
        """# DS-35 — Application & Admin Parity

**Status:** 🟡 Planned

## Candidate Stories

| Code | Story | Type | Status |
|------|-------|------|--------|
| DS-35.US-1 | Port the application step flow | User Story | 🟡 Planned |
| DS-35.TS-1 | Admin authentication parity | Technical Story | 🟡 Planned |
""",
        encoding="utf-8",
    )
    # Cursor carries the previous DS-34's stale children.
    set_delivery_cursor(
        store,
        journey="uncle-vinny",
        method="ariad",
        active_item="DS-34",
        active_item_title="Data Model Migration",
        active_item_level="delivery_story",
        child_work_items=("DS-34.US-1", "DS-34.US-2"),
    )

    pull_lifecycle_item(
        store,
        journey="uncle-vinny",
        method="ariad",
        item=BuilderLifecycleItem(
            code="DS-35",
            title="Application & Admin Parity",
            level="delivery_story",
            why_now="next",
        ),
    )
    expand_delivery_story(store, journey="uncle-vinny", method="ariad", project_path=project)
    report = set_navigator_flow_unit(
        store, journey="uncle-vinny", method="ariad", flow_unit=FLOW_UNIT_DELIVERY_STORY
    )

    rendered = render_flow_unit_scope_confirmation_report(report)
    assert "DS-35.US-1" in rendered
    assert "DS-35.TS-1" in rendered
    assert "DS-34" not in rendered
