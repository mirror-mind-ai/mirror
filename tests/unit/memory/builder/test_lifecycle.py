from pathlib import Path

import pytest

from memory import MemoryClient
from memory.builder.ariad_method import get_ariad_method
from memory.builder.delivery_cursor import get_delivery_cursor, set_delivery_cursor
from memory.builder.lifecycle import (
    BuilderLifecycleItem,
    _story_folder_name,
    assert_implementation_allowed,
    expand_delivery_story,
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
    assert "Delivery Flow: ◉ Pull → ○ Prepare → ○ Expand → ○ Plan" in rendered
    assert "DELIVERY STORY ACTIVATED" in rendered
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
    assert "Delivery Flow: ✓ Pull → ◉ Prepare → ○ Expand → ○ Plan" in rendered
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
    assert "Delivery Flow: ✓ Pull → ✓ Prepare → ✓ Expand → ◉ Plan" in rendered
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


# --- CV20.DS13 — expand reads the Delivery Story candidate table ---


def _seed_ds_cursor(store, *, active_item="DS-35", title="Application & Admin Parity", children=()):
    set_delivery_cursor(
        store,
        journey="uncle-vinny",
        method="ariad",
        active_item=active_item,
        active_item_title=title,
        active_item_level="delivery_story",
        child_work_items=children,
    )


def _write_ds_index(project, body, folder="ds-35-application-admin-parity"):
    ds_index = project / "docs" / "project" / "roadmap" / folder / "index.md"
    ds_index.parent.mkdir(parents=True, exist_ok=True)
    ds_index.write_text(body, encoding="utf-8")
    return ds_index


_FOUR_COL_DS_INDEX = """# DS-35 — Application & Admin Parity

**Status:** 🟡 Planned

## Candidate Stories

| Code | Story | Type | Status |
|------|-------|------|--------|
| DS-35.US-1 | Port the application step flow | User Story | 🟡 Planned |
| DS-35.US-2 | Port the review step | User Story | 🟡 Planned |
| DS-35.TS-1 | Admin authentication parity | Technical Story | 🟡 Planned |

## Done Condition

Done when children deliver a coherent outcome.
"""


def test_expand_reads_candidate_table_children(tmp_path):
    _client, store = _store(tmp_path)
    project = tmp_path / "project"
    ds_index = _write_ds_index(project, _FOUR_COL_DS_INDEX)
    _seed_ds_cursor(store)

    report = expand_delivery_story(
        store, journey="uncle-vinny", method="ariad", project_path=project
    )

    assert report.cursor.child_work_items == ("DS-35.US-1", "DS-35.US-2", "DS-35.TS-1")
    assert report.recommended_story == "DS-35.US-1"
    assert report.recommended_story_title == "Port the application step flow"
    # No fabricated US1 package.
    assert not (ds_index.parent / "ds-35-us1-application-admin-parity").exists()
    # Real child materialized with its real folder name.
    assert (ds_index.parent / "ds-35-us-1-port-the-application-step-flow" / "index.md").exists()


def test_expand_parses_generated_five_column_table(tmp_path):
    _client, store = _store(tmp_path)
    project = tmp_path / "project"
    _write_ds_index(
        project,
        """# DS-35 — Application & Admin Parity

**Status:** 🟡 Planned

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| DS-35.US-1 | Port the application step flow | User Story | Observable flow | 🟡 Planned |
| DS-35.TS-1 | Admin authentication parity | Technical Story | Admin can log in | 🟡 Planned |

## Done Condition

Done.
""",
    )
    _seed_ds_cursor(store)

    report = expand_delivery_story(
        store, journey="uncle-vinny", method="ariad", project_path=project
    )

    assert report.cursor.child_work_items == ("DS-35.US-1", "DS-35.TS-1")
    assert report.recommended_story == "DS-35.US-1"


def test_expand_recommends_first_pending_child(tmp_path):
    _client, store = _store(tmp_path)
    project = tmp_path / "project"
    _write_ds_index(
        project,
        """# DS-35 — Application & Admin Parity

**Status:** 🟡 Planned

## Candidate Stories

| Code | Story | Type | Status |
|------|-------|------|--------|
| DS-35.US-1 | Port the application step flow | User Story | ✅ Done |
| DS-35.US-2 | Port the review step | User Story | 🟡 Planned |

## Done Condition

Done.
""",
    )
    _seed_ds_cursor(store)

    report = expand_delivery_story(
        store, journey="uncle-vinny", method="ariad", project_path=project
    )

    assert report.recommended_story == "DS-35.US-2"
    assert report.cursor.child_work_items == ("DS-35.US-1", "DS-35.US-2")


def test_expand_fallback_still_resets_child_work_items(tmp_path):
    _client, store = _store(tmp_path)
    project = tmp_path / "project"
    # No DS index on disk -> fallback synthetic child.
    _seed_ds_cursor(
        store,
        active_item="DS-99",
        title="Orphan Story",
        children=("DS-34.US-1", "DS-34.US-2"),
    )

    report = expand_delivery_story(
        store, journey="uncle-vinny", method="ariad", project_path=project
    )

    assert report.recommended_story == "DS-99.US1"
    assert report.cursor.child_work_items == ("DS-99.US1",)


def test_expand_replaces_stale_children_from_previous_delivery_story(tmp_path):
    _client, store = _store(tmp_path)
    project = tmp_path / "project"
    _write_ds_index(project, _FOUR_COL_DS_INDEX)
    # Cursor still carries the previous DS-34's children.
    _seed_ds_cursor(store, children=("DS-34.US-1", "DS-34.US-2", "DS-34.TS-1"))

    report = expand_delivery_story(
        store, journey="uncle-vinny", method="ariad", project_path=project
    )

    assert report.cursor.child_work_items == ("DS-35.US-1", "DS-35.US-2", "DS-35.TS-1")
    assert all(not code.startswith("DS-34") for code in report.cursor.child_work_items)


def test_expand_materializes_technical_story_package_with_type(tmp_path):
    _client, store = _store(tmp_path)
    project = tmp_path / "project"
    ds_index = _write_ds_index(project, _FOUR_COL_DS_INDEX)
    _seed_ds_cursor(store)

    expand_delivery_story(store, journey="uncle-vinny", method="ariad", project_path=project)

    ts_index = ds_index.parent / "ds-35-ts-1-admin-authentication-parity" / "index.md"
    assert ts_index.exists()
    assert "**Type:** Technical Story" in ts_index.read_text(encoding="utf-8")


# --- CV20.DS13 — pull clears stale delivery-cursor state on item change ---


def test_pull_clears_stale_children_when_active_item_changes(tmp_path):
    _client, store = _store(tmp_path)
    set_delivery_cursor(
        store,
        journey="uncle-vinny",
        method="ariad",
        active_item="DS-34",
        active_item_title="Data Model Migration",
        active_item_level="delivery_story",
        child_work_items=("DS-34.US-1", "DS-34.US-2"),
        aggregate_checkpoint_status=("plan:approved",),
    )

    report = pull_lifecycle_item(
        store,
        journey="uncle-vinny",
        method="ariad",
        item=BuilderLifecycleItem(
            code="DS-35",
            title="Application & Admin Parity",
            level="delivery_story",
            why_now="next candidate",
        ),
    )

    assert report.cursor.child_work_items == ()
    assert report.cursor.aggregate_checkpoint_status == ()


def test_pull_preserves_children_when_repulling_same_item(tmp_path):
    _client, store = _store(tmp_path)
    set_delivery_cursor(
        store,
        journey="uncle-vinny",
        method="ariad",
        active_item="DS-35",
        active_item_title="Application & Admin Parity",
        active_item_level="delivery_story",
        child_work_items=("DS-35.US-1",),
    )

    report = pull_lifecycle_item(
        store,
        journey="uncle-vinny",
        method="ariad",
        item=BuilderLifecycleItem(
            code="DS-35",
            title="Application & Admin Parity",
            level="delivery_story",
            why_now="resume",
        ),
    )

    assert report.cursor.child_work_items == ("DS-35.US-1",)


def test_story_folder_name_appends_slugified_title():
    assert (
        _story_folder_name("DS-35.US-1", "Port the application step flow")
        == "ds-35-us-1-port-the-application-step-flow"
    )


def test_story_folder_name_drops_trailing_hyphen_for_empty_slug():
    # All-punctuation title slugifies to empty; the folder must not end in a hyphen.
    assert _story_folder_name("DS-35.TS-1", "!!! ???") == "ds-35-ts-1"


def test_story_folder_name_caps_long_titles_within_filesystem_limit():
    folder = _story_folder_name("DS-35.TS-1", "decide hosting " * 60)
    assert len(folder.encode()) <= 255
    slug = folder[len("ds-35-ts-1-") :]
    assert len(slug) <= 80


_LONG_TITLE = "decide hosting and managed postgres and secrets and headers " * 12

_LONG_CHILD_DS_INDEX = f"""# DS-35 — Application & Admin Parity

**Status:** 🟡 Planned

## Candidate Stories

| Code | Story | Type | Status |
|------|-------|------|--------|
| DS-35.TS-1 | {_LONG_TITLE} | Technical Story | 🟡 Planned |

## Done Condition
Done.
"""


def test_expand_handles_paragraph_length_child_titles(tmp_path):
    # A paragraph-length candidate "Story" cell must not crash expand on mkdir.
    _client, store = _store(tmp_path)
    project = tmp_path / "project"
    _write_ds_index(project, _LONG_CHILD_DS_INDEX)
    _seed_ds_cursor(store)

    report = expand_delivery_story(
        store, journey="uncle-vinny", method="ariad", project_path=project
    )

    assert report.cursor.child_work_items == ("DS-35.TS-1",)
    for path in report.materialized_paths:
        assert all(len(part.encode()) <= 255 for part in path.parts)


def test_existing_roadmap_components_stay_filesystem_safe():
    # Guards the regression class: the runtime must never persist a roadmap
    # directory component near the filesystem NAME_MAX (255) limit.
    repo_root = Path(__file__).resolve().parents[4]
    roadmap = repo_root / "docs" / "project" / "roadmap"
    if not roadmap.is_dir():
        pytest.skip("roadmap docs not present in this checkout")
    offenders = [
        directory.name
        for directory in roadmap.rglob("*")
        if directory.is_dir() and len(directory.name.encode()) > 120
    ]
    assert offenders == [], f"roadmap components exceed safe length: {offenders}"
