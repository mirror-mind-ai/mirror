"""Tests for Builder Mode CLI context loader."""

from pathlib import Path

import pytest

from memory import MemoryClient
from memory.builder.delivery_cursor import get_delivery_cursor, set_delivery_cursor
from memory.builder.method_adoption import set_adopted_method
from memory.cli import build
from memory.cli.runtime import CloneRole
from memory.config import default_db_path_for_home

JOURNEY_CONTENT = """# Mirror POC
**Status:** active

## Description

Scoped journey description.
"""


def test_build_load_reads_project_path_from_journey_service(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "mirror-poc", JOURNEY_CONTENT)
    project_path = tmp_path / "project"
    mem.journeys.set_project_path("mirror-poc", str(project_path))

    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)
    mocker.patch("memory.cli.build.switch_conversation")
    mocker.patch("memory.cli.build._persist_global_sticky_defaults")
    mocker.patch("memory.cli.build._is_mirror_mind_checkout", return_value=True)
    inspect = mocker.patch(
        "memory.cli.build.inspect_clone_role",
        return_value=CloneRole("dev", Path("/repo/.mirror-clone-role")),
    )
    mocker.patch.object(mem, "load_mirror_context", return_value="context")
    mocker.patch.object(mem, "search", return_value=[])

    build.cmd_load("mirror-poc")

    captured = capsys.readouterr()
    assert f"project_path={project_path.resolve()}" in captured.out
    inspect.assert_called_once_with(project_path.resolve())


def test_build_load_refuses_when_journey_project_path_is_production_clone(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "mirror-poc", JOURNEY_CONTENT)
    project_path = tmp_path / "production-project"
    mem.journeys.set_project_path("mirror-poc", str(project_path))

    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)
    mocker.patch("memory.cli.build._is_mirror_mind_checkout", return_value=True)
    inspect = mocker.patch(
        "memory.cli.build.inspect_clone_role",
        return_value=CloneRole("production", Path("/repo/.mirror-clone-role")),
    )

    with pytest.raises(SystemExit) as exc:
        build.cmd_load("mirror-poc")

    assert exc.value.code == 2
    err = capsys.readouterr().err
    assert "Builder Mode refused" in err
    assert "Project path:" in err
    assert "--ignore-production-role" in err
    inspect.assert_called_once_with(project_path.resolve())


def test_build_load_renders_roadmap_snapshot_when_adopted_journey_has_no_active_item(
    mocker, tmp_path, capsys
):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    project_path = tmp_path / "project"
    roadmap = project_path / "docs/project/roadmap/index.md"
    roadmap.parent.mkdir(parents=True)
    roadmap.write_text(
        """# Roadmap

| Code | Capability Value | Status |
|------|------------------|--------|
| CV2 | Checkout Flow | Candidate |

## CV2: Checkout Flow

**Status:** Candidate

Candidate Delivery Stories:

- DS1 Checkout entry and address capture.
""",
        encoding="utf-8",
    )
    ds6_plan = (
        project_path
        / "docs/project/roadmap/cv20-builder-mode-evolution/"
        / "cv20-ds6-refinement-workbench-flow/plan.md"
    )
    ds6_plan.parent.mkdir(parents=True)
    ds6_plan.write_text(
        """# Plan

## Seed Change Requests

### CR: Roadmap Snapshot focuses CV10 instead of active Builder work

### CR: Ariad marked surfaces can be summarized instead of rendered
""",
        encoding="utf-8",
    )
    mem.journeys.set_project_path("sandbox-pet-store", str(project_path))
    set_adopted_method(mem.store, "sandbox-pet-store", "ariad")
    set_delivery_cursor(
        mem.store,
        journey="sandbox-pet-store",
        method="ariad",
        last_delivery_event="template_preparation",
    )

    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)
    mocker.patch("memory.cli.build.switch_conversation")
    mocker.patch("memory.cli.build._persist_global_sticky_defaults")
    mocker.patch("memory.cli.build._is_mirror_mind_checkout", return_value=False)
    mocker.patch.object(mem, "load_mirror_context", return_value="context")
    mocker.patch.object(mem, "search", return_value=[])

    build.cmd_load("sandbox-pet-store")

    out = capsys.readouterr().out
    assert "BUILDER ORIENTATION" in out
    assert "BUILDER HOME" not in out
    assert "ROADMAP SNAPSHOT" not in out
    assert "PULL CANDIDATES" not in out
    assert "Where are we in the roadmap?" in out
    assert "What can be pulled next?" in out
    assert "What is open for refinement?" in out
    assert "What can we do now?" in out
    assert "Delivery Flow:" not in out
    assert "Ariad:" not in out
    assert "🟪[CV2] Checkout Flow" in out
    assert "└─ 🟦[DS1] Checkout entry" in out
    assert "▸ CV2.DS1 Checkout entry" in out
    assert "Checkout entry and address capture" in out
    assert "no active Refinement Story" in out
    assert "no captured Change Requests" in out
    assert "pull CV2.DS1" in out
    assert "capture Refinement Work" in out
    assert "BUILDER RESUME" not in out
    assert "Choose a move when ready." in out


def test_build_load_renders_resume_surface_when_adopted_journey_has_active_item(
    mocker, tmp_path, capsys
):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    project_path = tmp_path / "project"
    roadmap = project_path / "docs/project/roadmap/cv20/index.md"
    roadmap.parent.mkdir(parents=True)
    roadmap.write_text(
        "# CV20 — Builder Mode Evolution\n\n**Status:** 🟢 Active\n", encoding="utf-8"
    )
    mem.journeys.set_project_path("sandbox-pet-store", str(project_path))
    set_adopted_method(mem.store, "sandbox-pet-store", "ariad")
    set_delivery_cursor(
        mem.store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV2.DS1",
        last_delivery_event="pull",
    )

    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)
    mocker.patch("memory.cli.build.switch_conversation")
    mocker.patch("memory.cli.build._persist_global_sticky_defaults")
    mocker.patch("memory.cli.build._is_mirror_mind_checkout", return_value=False)
    mocker.patch.object(mem, "load_mirror_context", return_value="context")
    mocker.patch.object(mem, "search", return_value=[])

    build.cmd_load("sandbox-pet-store")

    out = capsys.readouterr().out
    assert "BUILDER RESUME" in out
    assert "BUILDER HOME" not in out
    assert "│ active item                                            │" in out
    assert "CV2.DS1" in out
    assert "prepare_active_item" in out
    assert "ROADMAP SNAPSHOT" not in out


def test_build_load_preserves_base_behavior_for_non_ariad_journey(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "custom-method-journey", JOURNEY_CONTENT)
    project_path = tmp_path / "project"
    mem.journeys.set_project_path("custom-method-journey", str(project_path))
    set_adopted_method(mem.store, "custom-method-journey", "custom")

    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)
    mocker.patch("memory.cli.build.switch_conversation")
    mocker.patch("memory.cli.build._persist_global_sticky_defaults")
    mocker.patch("memory.cli.build._is_mirror_mind_checkout", return_value=False)
    mocker.patch.object(mem, "load_mirror_context", return_value="context")
    mocker.patch.object(mem, "search", return_value=[])

    build.cmd_load("custom-method-journey")

    out = capsys.readouterr().out
    assert "project_path=" in out
    assert "context" in out
    assert "ROADMAP SNAPSHOT" not in out
    assert "Ariad Pull Candidates" not in out
    assert "BUILDER RESUME" not in out


def test_mm_build_skill_requires_marked_ariad_surfaces_to_render_verbatim():
    skill = Path(".pi/skills/mm-build/SKILL.md").read_text(encoding="utf-8")

    assert "every marked block" in skill
    assert "verbatim before" in skill
    assert "<<<ARIAD:BUILDER_HOME>>>" in skill
    assert "stdout order" in skill
    assert "CHANGE_REQUEST_CAPTURED" in skill
    assert "REFINEMENT_STORY_PULLED" in skill
    assert "REFINEMENT_FLOW_EVENT" in skill
    assert "refinement-story create" in skill
    assert "refinement-story pull" in skill
    assert "change-request select" in skill
    assert "refinement-story close" in skill
    assert "Do not skip" in skill
    assert "implement this CR" in skill
    assert "Do not close an RS while any attached CR remains unfinished" in skill
    assert "capture this as a CR" in skill
    assert "pull that refinement story" in skill


def test_build_plan_item_renders_checkpoint_and_updates_cursor(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    project_path = tmp_path / "project"
    roadmap = project_path / "docs/project/roadmap/index.md"
    roadmap.parent.mkdir(parents=True)
    roadmap.write_text(
        """# Roadmap

## CV2: Checkout Flow

**Status:** Candidate

Candidate Delivery Stories:

- DS1 Checkout entry and address capture.
""",
        encoding="utf-8",
    )
    mem.journeys.set_project_path("sandbox-pet-store", str(project_path))
    set_adopted_method(mem.store, "sandbox-pet-store", "ariad")
    set_delivery_cursor(
        mem.store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV2.DS1",
        active_item_title="Checkout Flow / Checkout entry and address capture",
        active_item_level="user_story",
        last_delivery_event="prepare",
    )
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_plan_item("ariad", journey="sandbox-pet-store")

    out = capsys.readouterr().out
    cursor = get_delivery_cursor(mem.store, "sandbox-pet-store")
    assert cursor is not None
    assert cursor.active_checkpoint == "after_plan"
    assert cursor.pending_confirmation == "navigator_approval"
    assert cursor.last_delivery_event == "plan"
    assert "PLAN CHECKPOINT" in out
    assert "Delivery Flow: ✓ Pull → ✓ Prepare → ✓ Expand → ◉ Plan" in out
    assert "🟦[CV2.DS1]" in out
    assert "story package" in out
    assert "index_artifact_path=" in out
    assert "test_guide_artifact_path=" in out
    assert "pending: navigator_approval" in out
    assert "Implementation remains blocked" in out
    plan_path = project_path / (
        "docs/project/roadmap/cv2-checkout-flow/cv2-ds1-checkout-entry-and-address-capture/plan.md"
    )
    assert (plan_path.parent / "index.md").exists()
    assert plan_path.exists()
    assert (plan_path.parent / "test-guide.md").exists()
    plan_text = plan_path.read_text(encoding="utf-8")
    assert "# Plan — CV2.DS1" in plan_text
    assert "Checkout entry and address capture" in plan_text
    assert "E2E decision: required" in plan_text


def test_build_plan_delivery_story_records_aggregate_checkpoint(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    project = tmp_path / "project"
    package = (
        project
        / "docs/project/roadmap/cv20-builder-mode-evolution/cv20-ds5-delivery-story-level-lifecycle"
    )
    package.mkdir(parents=True)
    (package / "index.md").write_text(
        "# CV20.DS5 — Delivery Story Level Lifecycle", encoding="utf-8"
    )
    mem.journeys.set_project_path("sandbox-pet-store", str(project))
    set_adopted_method(mem.store, "sandbox-pet-store", "ariad")
    set_delivery_cursor(
        mem.store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV20.DS5",
        active_item_level="delivery_story",
        navigator_flow_unit="delivery_story",
    )
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_plan_delivery_story(
        "ariad",
        journey="sandbox-pet-store",
        objective="Approve aggregate DS plan.",
        child_work_items=("CV20.DS5.US1",),
    )

    cursor = get_delivery_cursor(mem.store, "sandbox-pet-store")
    assert cursor is not None
    assert cursor.active_checkpoint == "after_delivery_story_plan"
    assert cursor.aggregate_checkpoint_status == ("plan:pending",)
    out = capsys.readouterr().out
    assert "<<<ARIAD:DELIVERY_STORY_PLAN_CHECKPOINT>>>" in out
    assert "│        🧭  DELIVERY STORY PLAN                          │" in out
    assert "│ - CV20.DS5.US1                                         │" in out
    assert "Flow unit" not in out
    assert "Navigator gate" not in out
    assert package.joinpath("plan.md").exists()
    assert package.joinpath("test-guide.md").exists()
    assert (
        package.joinpath("index.md").read_text(encoding="utf-8")
        == "# CV20.DS5 — Delivery Story Level Lifecycle"
    )
    assert "│ plan artifact                                          │" not in out
    assert "<<<ARIAD:ARTIFACTS_MATERIALIZED>>>" in out
    assert "index.md" in out
    assert "plan.md" in out
    assert "test-guide.md" in out
    assert "existing story index" in out
    assert "created test guide" in out


def test_build_approve_delivery_story_plan_records_approval(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    set_adopted_method(mem.store, "sandbox-pet-store", "ariad")
    set_delivery_cursor(
        mem.store,
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
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_approve_delivery_story_plan("ariad", journey="sandbox-pet-store")

    cursor = get_delivery_cursor(mem.store, "sandbox-pet-store")
    assert cursor is not None
    assert cursor.aggregate_checkpoint_status == ("plan:approved",)
    out = capsys.readouterr().out
    assert "│        🧭  DELIVERY STORY PLAN APPROVED                 │" in out
    assert "Delivery Flow: ✓ Pull → ✓ Prepare → ✓ Expand → ✓ DS Plan → ◉ Implement" in out
    assert "What was approved?" in out
    assert "Approved work packages" in out
    assert "What is being planned?" not in out
    assert "Plan objective" not in out
    assert "Delivery Story Plan approved." not in out
    assert "Begin implementation under the approved plan." in out
    assert "Choose the next move when ready." not in out
    assert "<<<ARIAD:IMPLEMENTATION_STARTED>>>" in out
    assert "│        🟧  IMPLEMENTATION STARTED                     │" in out
    assert "The approved Delivery Story Plan now authorizes" in out
    assert "Push, release, deploy, purchase" in out
    assert "Begin implementing the approved plan now." in out


def test_build_set_flow_unit_records_delivery_story_choice(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    set_adopted_method(mem.store, "sandbox-pet-store", "ariad")
    set_delivery_cursor(mem.store, journey="sandbox-pet-store", method="ariad")
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_set_flow_unit("ariad", journey="sandbox-pet-store", unit="delivery_story")

    cursor = get_delivery_cursor(mem.store, "sandbox-pet-store")
    assert cursor is not None
    assert cursor.navigator_flow_unit == "delivery_story"
    out = capsys.readouterr().out
    assert "<<<ARIAD:NAVIGATOR_FLOW_UNIT>>>" not in out
    assert "<<<ARIAD:DELIVERY_STORY_SCOPE_CONFIRMATION>>>" in out
    assert "Delivery Flow:" not in out
    assert "My understanding" in out
    assert "Selected flow unit" not in out
    assert "Before I create the DS Plan, correct or add anything:" in out
    assert "1. Is this the right scope?" in out
    assert "What is out of scope?" not in out
    assert "validation evidence" not in out


def test_build_set_flow_unit_inspects_default(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    set_adopted_method(mem.store, "sandbox-pet-store", "ariad")
    set_delivery_cursor(mem.store, journey="sandbox-pet-store", method="ariad")
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_set_flow_unit("ariad", journey="sandbox-pet-store")

    out = capsys.readouterr().out
    assert "Selected flow unit" in out
    assert "│ story_by_story                                         │" in out
    assert "source" not in out
    assert "default" not in out
    assert "SCOPE_CONFIRMATION" not in out


def test_build_set_cadence_accepts_accelerated(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    set_adopted_method(mem.store, "sandbox-pet-store", "ariad")
    set_delivery_cursor(mem.store, journey="sandbox-pet-store", method="ariad")
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_set_cadence("ariad", journey="sandbox-pet-store", profile="accelerated")

    cursor = get_delivery_cursor(mem.store, "sandbox-pet-store")
    assert cursor is not None
    assert cursor.cadence_profile == "accelerated"
    assert "cadence profile\naccelerated" in capsys.readouterr().out


def test_build_set_cadence_autonomous_requires_limits(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    set_adopted_method(mem.store, "sandbox-pet-store", "ariad")
    set_delivery_cursor(mem.store, journey="sandbox-pet-store", method="ariad")
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    with pytest.raises(SystemExit) as exc:
        build.cmd_set_cadence("ariad", journey="sandbox-pet-store", profile="autonomous")

    assert exc.value.code == 1
    assert "requires at least one --limit" in capsys.readouterr().err


def test_build_set_cadence_records_autonomous_limits(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    set_adopted_method(mem.store, "sandbox-pet-store", "ariad")
    set_delivery_cursor(mem.store, journey="sandbox-pet-store", method="ariad")
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_set_cadence(
        "ariad",
        journey="sandbox-pet-store",
        profile="autonomous",
        limits=("stop before push", "stop on scope change"),
    )

    cursor = get_delivery_cursor(mem.store, "sandbox-pet-store")
    assert cursor is not None
    assert cursor.cadence_profile == "autonomous"
    assert cursor.cadence_limits == ("stop before push", "stop on scope change")
    out = capsys.readouterr().out
    assert "cadence profile\nautonomous" in out
    assert "cadence limits\nstop before push, stop on scope change" in out


def test_plan_artifact_path_prefers_existing_canonical_package(tmp_path):
    project = tmp_path / "project"
    canonical = (
        project
        / "docs/project/roadmap/cv20-builder-mode-evolution/cv20-ds5-delivery-story-level-lifecycle/cv20-ds5-ts3-lifecycle-checkpoint-artifact-materialization"
    )
    canonical.mkdir(parents=True)
    (canonical / "index.md").write_text(
        "# CV20.DS5.TS3 — Lifecycle Checkpoint Artifact Materialization", encoding="utf-8"
    )
    cursor = type("Cursor", (), {"active_item": "CV20.DS5.TS3"})()

    assert build._plan_artifact_path(str(project), cursor) == canonical / "plan.md"


def test_checkpoint_artifact_path_prefers_existing_delivery_story_package(tmp_path):
    project = tmp_path / "project"
    canonical = (
        project
        / "docs/project/roadmap/cv2-checkout-flow/cv2-ds1-checkout-entry-and-address-capture"
    )
    canonical.mkdir(parents=True)
    (canonical / "index.md").write_text(
        "# CV2.DS1 — Checkout Entry And Address Capture", encoding="utf-8"
    )
    cursor = type("Cursor", (), {"active_item": "CV2.DS1"})()

    assert build._checkpoint_artifact_path(str(project), cursor, "validation.md") == (
        canonical / "validation.md"
    )


def test_build_plan_item_refuses_delivery_story(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    project_path = tmp_path / "project"
    mem.journeys.set_project_path("sandbox-pet-store", str(project_path))
    set_adopted_method(mem.store, "sandbox-pet-store", "ariad")
    set_delivery_cursor(
        mem.store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV2.DS1",
        active_item_title="Checkout Flow / Checkout entry and address capture",
        active_item_level="delivery_story",
        last_delivery_event="prepare",
    )
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    with pytest.raises(SystemExit) as exc:
        build.cmd_plan_item("ariad", journey="sandbox-pet-store")

    assert exc.value.code == 1
    assert "Plan requires a User Story or Technical Story" in capsys.readouterr().err


def test_build_approve_plan_allows_implementation_guard(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    set_adopted_method(mem.store, "sandbox-pet-store", "ariad")
    set_delivery_cursor(
        mem.store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV2.DS1.US1",
        active_item_level="user_story",
        active_checkpoint="after_plan",
        pending_confirmation="navigator_approval",
        last_delivery_event="plan",
    )
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_approve_plan("ariad", journey="sandbox-pet-store")
    build.cmd_check_implementation("ariad", journey="sandbox-pet-store")

    out = capsys.readouterr().out
    cursor = get_delivery_cursor(mem.store, "sandbox-pet-store")
    assert cursor is not None
    assert cursor.pending_confirmation is None
    assert cursor.last_delivery_event == "plan_approved"
    assert "PLAN APPROVED" in out
    assert "╭────────────────────────────────────────────────────────╮" in out
    assert "│        🟩■  PLAN APPROVED" in out
    assert "<<<ARIAD:IMPLEMENTATION_GUARD>>>" in out
    assert "│        🟧■  IMPLEMENTATION GUARD" in out
    assert "status" in out
    assert "allowed" in out


def test_build_check_implementation_refuses_pending_approval(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    set_adopted_method(mem.store, "sandbox-pet-store", "ariad")
    set_delivery_cursor(
        mem.store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV2.DS1",
        active_checkpoint="after_plan",
        pending_confirmation="navigator_approval",
        last_delivery_event="plan",
    )
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    with pytest.raises(SystemExit) as exc:
        build.cmd_check_implementation("ariad", journey="sandbox-pet-store")

    assert exc.value.code == 1
    out = capsys.readouterr().out
    assert "<<<ARIAD:IMPLEMENTATION_GUARD>>>" in out
    assert "╭────────────────────────────────────────────────────────╮" in out
    assert "│        🟧■  IMPLEMENTATION GUARD" in out
    assert "navigator_approval" in out
    assert "blocked" in out


def test_build_continue_lifecycle_accelerated_runs_done_after_review(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    set_adopted_method(mem.store, "sandbox-pet-store", "ariad")
    set_delivery_cursor(
        mem.store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV2.DS1.US1",
        active_item_level="user_story",
        last_delivery_event="review_complete",
        cadence_profile="accelerated",
    )
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_continue_lifecycle(
        "ariad",
        journey="sandbox-pet-store",
        process_alignment="Lifecycle checkpoints are complete.",
        project_alignment="Story package is coherent.",
        product_alignment="Navigator accepted behavior.",
        history_action="Committed story-scoped files.",
        roadmap_update="Marked story Done.",
        next_recommendation="Inspect next pull candidates.",
    )

    out = capsys.readouterr().out
    cursor = get_delivery_cursor(mem.store, "sandbox-pet-store")
    assert cursor is not None
    assert cursor.last_delivery_event == "done_complete"
    assert "<<<ARIAD:COHERENCE_CHECKPOINT>>>" not in out
    assert "<<<ARIAD:DONE_CHECKPOINT>>>" in out


def test_build_continue_lifecycle_stepwise_refuses_automatic_continuation(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    set_adopted_method(mem.store, "sandbox-pet-store", "ariad")
    set_delivery_cursor(
        mem.store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV2.DS1.US1",
        active_item_level="user_story",
        last_delivery_event="review_complete",
        cadence_profile="stepwise",
    )
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    with pytest.raises(SystemExit) as exc:
        build.cmd_continue_lifecycle("ariad", journey="sandbox-pet-store")

    assert exc.value.code == 1
    assert "Stepwise cadence does not continue automatically" in capsys.readouterr().out


def test_build_coherence_item_completes_after_debt_review(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    set_adopted_method(mem.store, "sandbox-pet-store", "ariad")
    set_delivery_cursor(
        mem.store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV2.DS1.US1",
        active_item_level="user_story",
        last_delivery_event="review_complete",
    )
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_coherence_item(
        "ariad",
        journey="sandbox-pet-store",
        process_alignment="Lifecycle artifacts are complete.",
        project_alignment="Story package reflects the change.",
        product_alignment="Navigator accepted behavior.",
    )

    out = capsys.readouterr().out
    cursor = get_delivery_cursor(mem.store, "sandbox-pet-store")
    assert cursor is not None
    assert cursor.pending_confirmation is None
    assert cursor.last_delivery_event == "coherence_complete"
    assert "<<<ARIAD:COHERENCE_CHECKPOINT>>>" in out
    assert "coherent" in out
    assert "Coherence is complete" in out


def test_build_done_item_completes_after_coherence(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    set_adopted_method(mem.store, "sandbox-pet-store", "ariad")
    set_delivery_cursor(
        mem.store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV2.DS1.US1",
        active_item_level="user_story",
        last_delivery_event="coherence_complete",
    )
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_done_item(
        "ariad",
        journey="sandbox-pet-store",
        history_action="Committed validated story changes.",
        roadmap_update="Marked story Done.",
        next_recommendation="Inspect pull candidates.",
    )

    out = capsys.readouterr().out
    cursor = get_delivery_cursor(mem.store, "sandbox-pet-store")
    assert cursor is not None
    assert cursor.pending_confirmation is None
    assert cursor.last_delivery_event == "done_complete"
    assert "<<<ARIAD:DONE_CHECKPOINT>>>" in out
    assert "Story closure is complete" in out
    assert "<<<ARIAD:PROJECT_POSITION>>>" in out
    assert out.rstrip().endswith("<<<END:PROJECT_POSITION>>>")


def test_build_done_delivery_story_renders_project_position_last(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    project_path = tmp_path / "project"
    roadmap = project_path / "docs/project/roadmap/index.md"
    roadmap.parent.mkdir(parents=True)
    roadmap.write_text(
        """# Roadmap

| Code | Capability Value | Status |
|------|------------------|--------|
| CV2 | Checkout Flow | In Progress |
""",
        encoding="utf-8",
    )
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    mem.journeys.set_project_path("sandbox-pet-store", str(project_path))
    set_adopted_method(mem.store, "sandbox-pet-store", "ariad")
    set_delivery_cursor(
        mem.store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV2.DS1",
        active_item_title="Checkout entry and address capture",
        active_item_level="delivery_story",
        navigator_flow_unit="delivery_story",
        child_work_items=("CV2.DS1.US1",),
        aggregate_checkpoint_status=(
            "plan:approved",
            "validation:passed",
            "debt_review:review:no_action",
        ),
    )
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_done_delivery_story(
        "ariad",
        journey="sandbox-pet-store",
        summary="Closed checkout entry and address capture.",
    )

    out = capsys.readouterr().out
    assert "<<<ARIAD:DELIVERY_STORY_CLOSURE_CHECKPOINT>>>" in out
    assert "<<<ARIAD:ARTIFACTS_MATERIALIZED>>>" in out
    assert "<<<ARIAD:PROJECT_POSITION>>>" in out
    assert "What just moved?" in out
    assert out.rstrip().endswith("<<<END:PROJECT_POSITION>>>")


def test_build_coherence_item_requires_review_complete(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    set_adopted_method(mem.store, "sandbox-pet-store", "ariad")
    set_delivery_cursor(
        mem.store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV2.DS1.US1",
        active_item_level="user_story",
        last_delivery_event="validation_passed",
    )
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    with pytest.raises(SystemExit) as exc:
        build.cmd_coherence_item("ariad", journey="sandbox-pet-store")

    assert exc.value.code == 1
    assert "Coherence requires completed Debt Review" in capsys.readouterr().out


def test_build_review_item_renders_pending_debt_decision(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    project_path = tmp_path / "project"
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    mem.journeys.set_project_path("sandbox-pet-store", str(project_path))
    set_adopted_method(mem.store, "sandbox-pet-store", "ariad")
    set_delivery_cursor(
        mem.store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV2.DS1.US1",
        active_item_level="user_story",
        last_delivery_event="validation_passed",
    )
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_review_item(
        "ariad",
        journey="sandbox-pet-store",
        debt_findings=("Checkout address form duplicates cart rendering state.",),
    )

    out = capsys.readouterr().out
    cursor = get_delivery_cursor(mem.store, "sandbox-pet-store")
    assert cursor is not None
    assert cursor.active_checkpoint == "review_decision"
    assert cursor.pending_confirmation == "navigator_debt_decision"
    assert cursor.last_delivery_event == "review"
    assert "<<<ARIAD:DEBT_REVIEW_CHECKPOINT>>>" in out
    assert "pending_debt_decision" in out
    assert "Navigator debt decision is required" in out


def test_build_review_item_completes_no_action_decision(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    set_adopted_method(mem.store, "sandbox-pet-store", "ariad")
    set_delivery_cursor(
        mem.store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV2.DS1.US1",
        active_item_level="user_story",
        last_delivery_event="validation_passed",
    )
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_review_item(
        "ariad",
        journey="sandbox-pet-store",
        debt_findings=("No debt found.",),
        debt_decision="no_action",
    )

    out = capsys.readouterr().out
    cursor = get_delivery_cursor(mem.store, "sandbox-pet-store")
    assert cursor is not None
    assert cursor.pending_confirmation is None
    assert cursor.last_delivery_event == "review_complete"
    assert "reviewed" in out
    assert "✓ none" in out


def test_build_review_item_requires_validation_passed(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    set_adopted_method(mem.store, "sandbox-pet-store", "ariad")
    set_delivery_cursor(
        mem.store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV2.DS1.US1",
        active_item_level="user_story",
        last_delivery_event="validate",
    )
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    with pytest.raises(SystemExit) as exc:
        build.cmd_review_item("ariad", journey="sandbox-pet-store")

    assert exc.value.code == 1
    assert "Debt Review requires passed Validation" in capsys.readouterr().out


def test_build_validate_item_renders_checkpoint_and_records_pending_navigator_validation(
    mocker, tmp_path, capsys
):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    project_path = tmp_path / "project"
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    mem.journeys.set_project_path("sandbox-pet-store", str(project_path))
    set_adopted_method(mem.store, "sandbox-pet-store", "ariad")
    set_delivery_cursor(
        mem.store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV2.DS1.US1",
        active_item_title="Checkout entry and address capture",
        active_item_level="user_story",
        last_delivery_event="plan_approved",
    )
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_validate_item(
        "ariad",
        journey="sandbox-pet-store",
        checks=("uv run pytest tests/unit",),
        checks_status="passed",
        e2e_decision="required",
        navigator_route="Validate checkout entry through Pi natural language.",
        implementation_complete=True,
    )

    out = capsys.readouterr().out
    cursor = get_delivery_cursor(mem.store, "sandbox-pet-store")
    assert cursor is not None
    assert cursor.active_checkpoint == "after_validation"
    assert cursor.pending_confirmation == "navigator_validation"
    assert cursor.last_delivery_event == "validate"
    assert "<<<ARIAD:VALIDATION_CHECKPOINT>>>" in out
    assert "╭────────────────────────────────────────────────────────╮" in out
    assert "│        🧪■  VALIDATION CHECKPOINT" in out
    assert "required E2E evidence is missing" in out
    assert "Navigator validation has not been accepted" in out
    assert "validation artifact" in out


def test_build_validate_item_passes_when_all_evidence_is_present(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    set_adopted_method(mem.store, "sandbox-pet-store", "ariad")
    set_delivery_cursor(
        mem.store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV2.DS1.US1",
        active_item_level="user_story",
        last_delivery_event="implementation_complete",
    )
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_validate_item(
        "ariad",
        journey="sandbox-pet-store",
        checks=("uv run pytest",),
        checks_status="passed",
        e2e_decision="required",
        e2e_evidence="Navigator verified checkout entry.",
        navigator_route="Validate checkout entry through Pi natural language.",
        navigator_accepted=True,
    )

    out = capsys.readouterr().out
    cursor = get_delivery_cursor(mem.store, "sandbox-pet-store")
    assert cursor is not None
    assert cursor.pending_confirmation is None
    assert cursor.last_delivery_event == "validation_passed"
    assert "│        🧪■  VALIDATION CHECKPOINT" in out
    assert "passed" in out
    assert "navigator accepted" in out
    assert "✓ none" in out


def test_build_validate_item_accepts_pending_navigator_validation(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    set_adopted_method(mem.store, "sandbox-pet-store", "ariad")
    set_delivery_cursor(
        mem.store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV2.DS1.US1",
        active_item_level="user_story",
        active_checkpoint="after_validation",
        pending_confirmation="navigator_validation",
        last_delivery_event="validate",
    )
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_validate_item(
        "ariad",
        journey="sandbox-pet-store",
        checks=("npm test && npm run build",),
        checks_status="passed",
        e2e_decision="required",
        e2e_evidence="Navigator manually validated the checkout flow.",
        navigator_route="Validate checkout in the browser.",
        navigator_accepted=True,
    )

    out = capsys.readouterr().out
    cursor = get_delivery_cursor(mem.store, "sandbox-pet-store")
    assert cursor is not None
    assert cursor.active_checkpoint is None
    assert cursor.pending_confirmation is None
    assert cursor.last_delivery_event == "validation_passed"
    assert "<<<ARIAD:VALIDATION_CHECKPOINT>>>" in out
    assert "passed" in out
    assert "navigator accepted" in out


def test_build_validate_item_blocks_without_implementation_completion(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    set_adopted_method(mem.store, "sandbox-pet-store", "ariad")
    set_delivery_cursor(
        mem.store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV2.DS1.US1",
        active_item_level="user_story",
        last_delivery_event="plan_approved",
    )
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    with pytest.raises(SystemExit) as exc:
        build.cmd_validate_item(
            "ariad",
            journey="sandbox-pet-store",
            checks=("uv run pytest",),
            checks_status="passed",
        )

    assert exc.value.code == 1
    out = capsys.readouterr().out
    assert "Implementation requires implementation completion evidence" not in out
    assert "Validation requires implementation completion evidence" in out


def test_build_plan_item_requires_ariad_adoption(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "custom-method-journey", JOURNEY_CONTENT)
    set_delivery_cursor(
        mem.store,
        journey="custom-method-journey",
        method="ariad",
        active_item="CV2.DS1",
        last_delivery_event="prepare",
    )
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    with pytest.raises(SystemExit) as exc:
        build.cmd_plan_item("ariad", journey="custom-method-journey")

    assert exc.value.code == 1
    assert "has not adopted Ariad" in capsys.readouterr().err


def test_build_load_allows_non_mirror_project_without_clone_role_guard(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "softwarezen", JOURNEY_CONTENT)
    project_path = tmp_path / "szen_play"
    mem.journeys.set_project_path("softwarezen", str(project_path))

    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)
    mocker.patch("memory.cli.build.switch_conversation")
    mocker.patch("memory.cli.build._persist_global_sticky_defaults")
    mocker.patch("memory.cli.build._is_mirror_mind_checkout", return_value=False)
    inspect = mocker.patch("memory.cli.build.inspect_clone_role")
    mocker.patch.object(mem, "load_mirror_context", return_value="context")
    mocker.patch.object(mem, "search", return_value=[])

    build.cmd_load("softwarezen")

    captured = capsys.readouterr()
    assert f"project_path={project_path.resolve()}" in captured.out
    state = mem.store.get_runtime_session("__global_operating_mode__")
    assert state is not None
    assert '"active_mode": "Builder Mode"' in (state.metadata or "")
    assert '"active_journey": "softwarezen"' in (state.metadata or "")
    inspect.assert_not_called()


def test_build_inspect_method_renders_ariad_defaults(capsys):
    build.cmd_inspect_method("ariad")

    out = capsys.readouterr().out
    assert "Builder Method Available" in out
    assert "method\nAriad" in out
    assert "id\nariad" in out
    assert "Pull escolhe o foco" in out
    assert "Done registra e fecha" in out
    assert "after_plan" in out
    assert "blocks: implement" in out
    assert "history.commit" in out
    assert "push" in out
    assert "release" in out
    assert "contracts" in out
    assert "plan_contract: plan" in out
    assert "implement_contract: implement" in out
    assert "templates" in out
    assert "docs/project/roadmap/templates/plan.md" in out


def test_build_inspect_method_reports_no_active_journey_when_no_context(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_inspect_method(None)

    out = capsys.readouterr().out
    assert "active journey\nnone" in out
    assert "adopted method\nnone" in out
    assert "available methods\nariad" in out
    assert "No Builder journey is active yet" in out


def test_build_inspect_method_uses_active_builder_journey(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "builder-mode-evolution", JOURNEY_CONTENT)
    mem.store.upsert_runtime_session(
        "session-1",
        interface="pi",
        active=True,
        metadata=(
            '{"operating_mode": {'
            '"active_mode": "Builder Mode", '
            '"active_journey": "builder-mode-evolution"}}'
        ),
    )
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_inspect_method(None, session_id="session-1")

    out = capsys.readouterr().out
    assert "journey\nbuilder-mode-evolution" in out
    assert "adopted method\nnone" in out
    assert "available methods\nariad" in out


def test_build_inspect_method_reports_journey_without_adopted_method(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "builder-mode-evolution", JOURNEY_CONTENT)
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_inspect_method(None, journey="builder-mode-evolution")

    out = capsys.readouterr().out
    assert "journey\nbuilder-mode-evolution" in out
    assert "adopted method\nnone" in out
    assert "available methods\nariad" in out
    assert "has not adopted a Builder method yet" in out
    assert "build adopt --journey builder-mode-evolution --method ariad" in out


def test_build_inspect_method_rejects_unknown_method(capsys):
    with pytest.raises(SystemExit) as exc:
        build.cmd_inspect_method("unknown")

    assert exc.value.code == 1
    err = capsys.readouterr().err
    assert "Builder method 'unknown' not found" in err
    assert "Available methods: ariad" in err


def test_build_inspect_method_rejects_unknown_journey(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    with pytest.raises(SystemExit) as exc:
        build.cmd_inspect_method(None, journey="missing")

    assert exc.value.code == 1
    err = capsys.readouterr().err
    assert "journey 'missing' not found" in err


def test_build_adopt_method_records_ariad_for_explicit_journey(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "builder-mode-evolution", JOURNEY_CONTENT)
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_adopt_method("ariad", journey="builder-mode-evolution")

    out = capsys.readouterr().out
    assert "Builder Method Adopted" in out
    assert "journey\nbuilder-mode-evolution" in out
    assert "adopted method\nariad" in out
    assert "Ariad is now adopted for this journey" in out
    assert "story lifecycle execution" in out

    build.cmd_inspect_method(None, journey="builder-mode-evolution")
    inspected = capsys.readouterr().out
    assert "adopted method\nariad" in inspected
    assert "Ariad is adopted for this journey" in inspected


def test_build_adopt_method_uses_active_builder_journey(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "builder-mode-evolution", JOURNEY_CONTENT)
    mem.store.upsert_runtime_session(
        "session-1",
        interface="pi",
        active=True,
        metadata=(
            '{"operating_mode": {'
            '"active_mode": "Builder Mode", '
            '"active_journey": "builder-mode-evolution"}}'
        ),
    )
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_adopt_method("ariad", session_id="session-1")

    out = capsys.readouterr().out
    assert "journey\nbuilder-mode-evolution" in out
    assert "adopted method\nariad" in out


def test_build_adopt_method_is_idempotent(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "builder-mode-evolution", JOURNEY_CONTENT)
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_adopt_method("ariad", journey="builder-mode-evolution")
    build.cmd_adopt_method("ariad", journey="builder-mode-evolution")

    out = capsys.readouterr().out
    assert "Ariad was already adopted for this journey" in out


def test_build_adopt_method_rejects_unknown_method(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "builder-mode-evolution", JOURNEY_CONTENT)
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    with pytest.raises(SystemExit) as exc:
        build.cmd_adopt_method("unknown", journey="builder-mode-evolution")

    assert exc.value.code == 1
    err = capsys.readouterr().err
    assert "Builder method 'unknown' not found" in err


def test_build_adopt_method_rejects_unknown_journey(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    with pytest.raises(SystemExit) as exc:
        build.cmd_adopt_method("ariad", journey="missing")

    assert exc.value.code == 1
    err = capsys.readouterr().err
    assert "journey 'missing' not found" in err


def test_build_adopt_method_requires_journey_context(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    with pytest.raises(SystemExit) as exc:
        build.cmd_adopt_method("ariad")

    assert exc.value.code == 1
    err = capsys.readouterr().err
    assert "Builder method adoption requires a journey" in err


def test_build_prepare_templates_for_explicit_adopted_journey(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    project_path = tmp_path / "project"
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    mem.journeys.set_project_path("sandbox-pet-store", str(project_path))
    set_adopted_method(mem.store, "sandbox-pet-store", "ariad")
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_prepare_templates("ariad", journey="sandbox-pet-store")

    out = capsys.readouterr().out
    assert "Ariad Template Preparation" in out
    assert "journey\nsandbox-pet-store" in out
    assert "method\nariad" in out
    assert "checked" in out
    assert "created" in out
    assert "pending" in out
    assert "No story lifecycle work was executed" in out
    assert (project_path / "docs/project/roadmap/templates/plan.md").is_file()


def test_build_prepare_templates_uses_active_builder_journey(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    project_path = tmp_path / "project"
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    mem.journeys.set_project_path("sandbox-pet-store", str(project_path))
    set_adopted_method(mem.store, "sandbox-pet-store", "ariad")
    mem.store.upsert_runtime_session(
        "session-1",
        interface="pi",
        active=True,
        metadata=(
            '{"operating_mode": {'
            '"active_mode": "Builder Mode", '
            '"active_journey": "sandbox-pet-store"}}'
        ),
    )
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_prepare_templates("ariad", session_id="session-1")

    out = capsys.readouterr().out
    assert "journey\nsandbox-pet-store" in out
    assert (project_path / "docs/project/roadmap/ariad-adoption.md").is_file()


def test_build_prepare_templates_preserves_existing_files(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    project_path = tmp_path / "project"
    existing = project_path / "docs/project/roadmap/templates/plan.md"
    existing.parent.mkdir(parents=True)
    existing.write_text("# Human Plan\n", encoding="utf-8")
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    mem.journeys.set_project_path("sandbox-pet-store", str(project_path))
    set_adopted_method(mem.store, "sandbox-pet-store", "ariad")
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_prepare_templates("ariad", journey="sandbox-pet-store")

    out = capsys.readouterr().out
    assert "preserved" in out
    assert "docs/project/roadmap/templates/plan.md" in out
    assert existing.read_text(encoding="utf-8") == "# Human Plan\n"


def test_build_prepare_templates_requires_ariad_adoption(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    project_path = tmp_path / "project"
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    mem.journeys.set_project_path("sandbox-pet-store", str(project_path))
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    with pytest.raises(SystemExit) as exc:
        build.cmd_prepare_templates("ariad", journey="sandbox-pet-store")

    assert exc.value.code == 1
    err = capsys.readouterr().err
    assert "has not adopted Ariad yet" in err
    assert not (project_path / "docs/project/roadmap/templates/plan.md").exists()


def test_build_prepare_templates_requires_project_path(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    set_adopted_method(mem.store, "sandbox-pet-store", "ariad")
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    with pytest.raises(SystemExit) as exc:
        build.cmd_prepare_templates("ariad", journey="sandbox-pet-store")

    assert exc.value.code == 1
    err = capsys.readouterr().err
    assert "has no project_path configured" in err


def test_build_prepare_templates_rejects_unknown_method(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    with pytest.raises(SystemExit) as exc:
        build.cmd_prepare_templates("unknown", journey="sandbox-pet-store")

    assert exc.value.code == 1
    err = capsys.readouterr().err
    assert "Builder method 'unknown' not found" in err


def test_build_sync_cursor_for_explicit_adopted_journey(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    set_adopted_method(mem.store, "sandbox-pet-store", "ariad")
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_sync_cursor("ariad", journey="sandbox-pet-store")

    out = capsys.readouterr().out
    assert "Builder Delivery Cursor Synced" in out
    assert "journey\nsandbox-pet-store" in out
    assert "method\nariad" in out
    assert "active item\nnone" in out
    assert "last delivery event\ntemplate_preparation" in out
    assert "No story lifecycle work was executed" in out


def test_build_sync_cursor_uses_active_builder_journey(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    set_adopted_method(mem.store, "sandbox-pet-store", "ariad")
    mem.store.upsert_runtime_session(
        "session-1",
        interface="pi",
        active=True,
        metadata=(
            '{"operating_mode": {'
            '"active_mode": "Builder Mode", '
            '"active_journey": "sandbox-pet-store"}}'
        ),
    )
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_sync_cursor("ariad", session_id="session-1")

    out = capsys.readouterr().out
    assert "journey\nsandbox-pet-store" in out
    assert "method\nariad" in out


def test_build_sync_cursor_requires_ariad_adoption(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    with pytest.raises(SystemExit) as exc:
        build.cmd_sync_cursor("ariad", journey="sandbox-pet-store")

    assert exc.value.code == 1
    err = capsys.readouterr().err
    assert "has not adopted Ariad yet" in err


def test_build_sync_cursor_rejects_unknown_method(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    with pytest.raises(SystemExit) as exc:
        build.cmd_sync_cursor("unknown", journey="sandbox-pet-store")

    assert exc.value.code == 1
    err = capsys.readouterr().err
    assert "Builder method 'unknown' not found" in err


def test_build_sync_cursor_requires_journey_context(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    with pytest.raises(SystemExit) as exc:
        build.cmd_sync_cursor("ariad")

    assert exc.value.code == 1
    err = capsys.readouterr().err
    assert "Builder method cursor sync requires a journey" in err


def test_build_pull_candidates_lists_roadmap_items(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    project_path = tmp_path / "project"
    roadmap = project_path / "docs/project/roadmap/index.md"
    roadmap.parent.mkdir(parents=True)
    roadmap.write_text(
        """# Roadmap

| Code | Capability Value | Status |
|------|------------------|--------|
| CV2 | Checkout Flow | Candidate |

## CV2: Checkout Flow

**Status:** Candidate

Candidate Delivery Stories:

- DS1 Checkout entry and address capture.
""",
        encoding="utf-8",
    )
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    mem.journeys.set_project_path("sandbox-pet-store", str(project_path))
    set_adopted_method(mem.store, "sandbox-pet-store", "ariad")
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_pull_candidates("ariad", journey="sandbox-pet-store")

    out = capsys.readouterr().out
    assert "ROADMAP SNAPSHOT" in out
    assert "Delivery Flow:" not in out
    assert "Ariad:" not in out
    assert "🟪[CV2]  Checkout Flow" in out
    assert "view                         overview" in out
    assert "PULL CANDIDATES" in out
    assert "CV2.DS1 — Checkout Flow / Checkout entry" in out
    assert "No item was pulled" in out


def test_build_pull_delivery_story_prepares_and_expands(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    project_path = tmp_path / "project"
    roadmap = project_path / "docs/project/roadmap/index.md"
    roadmap.parent.mkdir(parents=True)
    roadmap.write_text(
        """# Roadmap

| Code | Capability Value | Status |
|------|------------------|--------|
| CV2 | Checkout Flow | In Progress |
""",
        encoding="utf-8",
    )
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    mem.journeys.set_project_path("sandbox-pet-store", str(project_path))
    set_adopted_method(mem.store, "sandbox-pet-store", "ariad")
    set_delivery_cursor(mem.store, journey="sandbox-pet-store", method="ariad")
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_pull_item(
        "ariad",
        journey="sandbox-pet-store",
        item_code="CV2.DS1",
        item_title="Checkout entry and address capture",
        item_level="delivery_story",
        why_now="next candidate capability",
    )

    out = capsys.readouterr().out
    cursor = get_delivery_cursor(mem.store, "sandbox-pet-store")
    assert cursor is not None
    assert cursor.active_item == "CV2.DS1"
    assert cursor.last_delivery_event == "expand"
    assert cursor.active_checkpoint == "next_story_confirmation"
    assert cursor.pending_confirmation == "navigator_story_confirmation"
    assert cursor.child_work_items == ("CV2.DS1.US1",)
    assert "<<<ARIAD:DELIVERY_STORY_READY>>>" in out
    assert "<<<ARIAD:ARTIFACTS_MATERIALIZED>>>" in out
    assert "Expand — CV2.DS1" in out
    assert "created DS package" in out
    assert "created US1 package" in out
    assert "<<<ARIAD:DELIVERY_STORY_IDENTIFIED>>>" not in out
    assert "<<<ARIAD:PREPARE_FIELD_READING>>>" not in out
    assert "<<<ARIAD:EXPAND_DECISION>>>" not in out
    assert "What was pulled?" in out
    assert "Where are we in the roadmap?" in out
    assert "What did Prepare find?" in out
    assert "What was materialized?" in out
    assert "What is recommended next?" in out
    assert "Recommended flow unit" in out
    assert "delivery_story" in out
    assert "Why this recommendation?" in out
    assert "Navigator-facing unit" in out
    assert "Choose the next flow unit when ready." in out
    assert "🟩[US1] Checkout entry and address capture" in out
    assert (
        project_path
        / "docs/project/roadmap/cv2-checkout-flow/cv2-ds1-checkout-entry-and-address-capture/index.md"
    ).exists()
    assert (
        project_path
        / "docs/project/roadmap/cv2-checkout-flow/cv2-ds1-checkout-entry-and-address-capture/cv2-ds1-us1-checkout-entry-and-address-capture/index.md"
    ).exists()


def test_build_pull_item_updates_cursor(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    set_adopted_method(mem.store, "sandbox-pet-store", "ariad")
    set_delivery_cursor(mem.store, journey="sandbox-pet-store", method="ariad")
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_pull_item(
        "ariad",
        journey="sandbox-pet-store",
        item_code="CHECKOUT-FLOW",
        item_title="Checkout Flow",
        item_level="user_story",
        why_now="next candidate capability",
    )

    out = capsys.readouterr().out
    assert "Delivery Flow: ◉ Pull → ○ Prepare → ○ Expand → ○ Plan" in out
    assert "DELIVERY STORY ACTIVATED" in out
    assert "roadmap candidate" in out
    assert "active item: CHECKOUT-FLOW" in out
    assert "Prepare" in out
    cursor = get_delivery_cursor(mem.store, "sandbox-pet-store")
    assert cursor is not None
    assert cursor.active_item == "CHECKOUT-FLOW"
    assert cursor.last_delivery_event == "prepare"


def test_build_prepare_item_updates_cursor(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    project_path = tmp_path / "project"
    (project_path / "docs/process").mkdir(parents=True)
    (project_path / "docs/process/development-guide.md").write_text("# Dev\n", encoding="utf-8")
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    mem.journeys.set_project_path("sandbox-pet-store", str(project_path))
    set_adopted_method(mem.store, "sandbox-pet-store", "ariad")
    set_delivery_cursor(
        mem.store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CHECKOUT-FLOW",
        last_delivery_event="pull",
    )
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_prepare_item("ariad", journey="sandbox-pet-store")

    out = capsys.readouterr().out
    assert "Delivery Flow: ✓ Pull → ◉ Prepare → ○ Expand → ○ Plan" in out
    assert "PREPARE FIELD READING" in out
    assert "🟦[CHECKOUT-FLOW]" in out
    assert "✓ docs/process/development-guide.md: present" in out
    assert "Plan" in out
    cursor = get_delivery_cursor(mem.store, "sandbox-pet-store")
    assert cursor is not None
    assert cursor.last_delivery_event == "prepare"


def test_build_pull_item_requires_adoption(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    set_delivery_cursor(mem.store, journey="sandbox-pet-store", method="ariad")
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    with pytest.raises(SystemExit) as exc:
        build.cmd_pull_item(
            "ariad",
            journey="sandbox-pet-store",
            item_code="CHECKOUT-FLOW",
            item_title="Checkout Flow",
            item_level="user_story",
            why_now="next candidate capability",
        )

    assert exc.value.code == 1
    assert "has not adopted Ariad yet" in capsys.readouterr().err


def test_build_prepare_item_requires_active_item(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    set_adopted_method(mem.store, "sandbox-pet-store", "ariad")
    set_delivery_cursor(mem.store, journey="sandbox-pet-store", method="ariad")
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    with pytest.raises(SystemExit) as exc:
        build.cmd_prepare_item("ariad", journey="sandbox-pet-store")

    assert exc.value.code == 1
    assert "active item" in capsys.readouterr().err


def test_build_load_allows_production_clone_when_override_passed(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "mirror-poc", JOURNEY_CONTENT)

    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)
    mocker.patch("memory.cli.build.switch_conversation")
    mocker.patch("memory.cli.build._persist_global_sticky_defaults")
    mocker.patch("memory.cli.build._is_mirror_mind_checkout", return_value=True)
    mocker.patch(
        "memory.cli.build.inspect_clone_role",
        return_value=CloneRole("production", Path("/repo/.mirror-clone-role")),
    )
    mocker.patch.object(mem, "load_mirror_context", return_value="context")
    mocker.patch.object(mem, "search", return_value=[])

    build.cmd_load("mirror-poc", ignore_production_role=True)

    err = capsys.readouterr().err
    assert "Production clone override" in err


def test_refinement_story_create_command_renders_overview_without_setting_cursor(
    mocker, tmp_path, capsys
):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)

    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_refinement_story_create(
        journey="sandbox-pet-store",
        title="RS-001 — Sandbox checkout refinements",
        source="dogfood",
    )

    out = capsys.readouterr().out
    stories = mem.store.list_refinement_stories("sandbox-pet-store")
    assert len(stories) == 1
    assert stories[0].title == "RS-001 — Sandbox checkout refinements"
    assert "<<<ARIAD:REFINEMENT_STORY_OVERVIEW>>>" in out
    assert "refinement_story_id=" in out
    assert mem.store.get_refinement_cursor("sandbox-pet-store") is None


def test_change_request_capture_command_renders_surface_and_preserves_delivery_cursor(
    mocker, tmp_path, capsys
):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    story = mem.store.create_refinement_story(
        journey="sandbox-pet-store",
        title="RS-001 — Sandbox checkout refinements",
    )
    set_delivery_cursor(
        mem.store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV2.DS1",
        last_delivery_event="prepare",
    )

    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_change_request_capture(
        journey="sandbox-pet-store",
        refinement_story_id=story.id,
        title="Clarify checkout state",
        body="Docs disagree about whether CV2.DS1 is in progress.",
        source="dogfood",
    )

    out = capsys.readouterr().out
    change_requests = mem.store.list_change_requests(
        "sandbox-pet-store", refinement_story_id=story.id
    )
    assert len(change_requests) == 1
    assert change_requests[0].title == "Clarify checkout state"
    assert "<<<ARIAD:CHANGE_REQUEST_CAPTURED>>>" in out
    assert "RS001: RS-001 — Sandbox checkout refinements" in out
    assert story.id not in out
    assert "change_request_id=" in out
    assert mem.store.get_refinement_cursor("sandbox-pet-store") is None
    delivery_cursor = get_delivery_cursor(mem.store, "sandbox-pet-store")
    assert delivery_cursor is not None
    assert delivery_cursor.active_item == "CV2.DS1"


def test_change_request_attach_and_overview_commands_render_ordered_overview(
    mocker, tmp_path, capsys
):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    story = mem.store.create_refinement_story(
        journey="sandbox-pet-store",
        title="RS-001 — Sandbox checkout refinements",
    )
    change_request = mem.store.create_change_request(
        journey="sandbox-pet-store",
        title="Clarify checkout state",
        body="Docs disagree about CV2.DS1.",
    )

    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_change_request_attach(
        journey="sandbox-pet-store",
        change_request_id=change_request.id,
        refinement_story_id=story.id,
    )
    build.cmd_refinement_story_overview(
        journey="sandbox-pet-store",
        refinement_story_id=story.id,
    )

    out = capsys.readouterr().out
    attached = mem.store.get_change_request(change_request.id)
    assert attached is not None
    assert attached.refinement_story_id == story.id
    assert out.count("<<<ARIAD:REFINEMENT_STORY_OVERVIEW>>>") == 2
    assert "CR001: Clarify checkout state [captured]" in out
    assert "available next moves" not in out


def test_refinement_story_pull_command_sets_cursor_and_preserves_delivery_cursor(
    mocker, tmp_path, capsys
):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    story = mem.store.create_refinement_story(
        journey="sandbox-pet-store",
        title="RS-002 — Sandbox refinement pull validation",
    )
    mem.store.create_change_request(
        journey="sandbox-pet-store",
        refinement_story_id=story.id,
        title="Validate RS pull",
        body="The RS should become active without starting a CR cycle.",
    )
    set_delivery_cursor(
        mem.store,
        journey="sandbox-pet-store",
        method="ariad",
        active_item="CV2.DS1",
        last_delivery_event="prepare",
    )

    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_refinement_story_pull(
        journey="sandbox-pet-store",
        refinement_story_id=story.id,
    )

    out = capsys.readouterr().out
    cursor = mem.store.get_refinement_cursor("sandbox-pet-store")
    assert cursor is not None
    assert cursor.active_refinement_story_id == story.id
    assert cursor.active_change_request_id is None
    assert cursor.last_refinement_event == "refinement_story_pulled"
    delivery_cursor = get_delivery_cursor(mem.store, "sandbox-pet-store")
    assert delivery_cursor is not None
    assert delivery_cursor.active_item == "CV2.DS1"
    assert "<<<ARIAD:REFINEMENT_STORY_PULLED>>>" in out
    assert "RS001: RS-002" in out
    assert "change requests (#1)" in out
    assert "CR001: Validate RS pull [captured]" in out
    assert "active CR: none" not in out


def test_builder_home_shows_active_refinement_story_after_pull(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    project_path = tmp_path / "project"
    roadmap = project_path / "docs/project/roadmap/index.md"
    roadmap.parent.mkdir(parents=True)
    roadmap.write_text(
        """# Roadmap

| Code | Delivery Story | Outcome | Status |
|------|----------------|---------|--------|
| [CV2](cv2/index.md) | Checkout Flow | Checkout Flow | 🟡 Planned |
| [CV2.DS1](cv2/ds1/index.md) | Checkout entry | Checkout entry | 🟡 Planned |
""",
        encoding="utf-8",
    )
    mem.journeys.set_project_path("sandbox-pet-store", str(project_path))
    set_adopted_method(mem.store, "sandbox-pet-store", "ariad")
    set_delivery_cursor(
        mem.store,
        journey="sandbox-pet-store",
        method="ariad",
        last_delivery_event="template_preparation",
    )
    story = mem.store.create_refinement_story(
        journey="sandbox-pet-store",
        title="RS-002 — Sandbox refinement pull validation",
    )
    mem.store.set_refinement_cursor(
        journey="sandbox-pet-store",
        active_refinement_story_id=story.id,
        active_change_request_id=None,
        last_refinement_event="refinement_story_pulled",
    )

    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)
    mocker.patch("memory.cli.build.switch_conversation")
    mocker.patch("memory.cli.build._persist_global_sticky_defaults")
    mocker.patch("memory.cli.build._is_mirror_mind_checkout", return_value=False)
    mocker.patch.object(mem, "load_mirror_context", return_value="context")
    mocker.patch.object(mem, "search", return_value=[])

    build.cmd_load("sandbox-pet-store")

    out = capsys.readouterr().out
    assert "BUILDER ORIENTATION" in out
    assert "active RS: RS001: RS-002" in out
    assert "continue active Refinement Story" in out
    assert "Choose a move when ready." in out


def test_change_request_discard_command_removes_captured_cr(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    story = mem.store.create_refinement_story(journey="sandbox-pet-store", title="RS flow")
    cr = mem.store.create_change_request(
        journey="sandbox-pet-store",
        refinement_story_id=story.id,
        title="Duplicate CR",
        body="Duplicate.",
    )
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_change_request_discard(
        journey="sandbox-pet-store",
        change_request_id=cr.id,
        reason="Duplicate capture",
    )

    out = capsys.readouterr().out
    assert "<<<ARIAD:CHANGE_REQUEST_DISCARDED>>>" in out
    assert "CR001: Duplicate CR" in out
    assert "Duplicate capture" in out
    assert mem.store.get_change_request(cr.id) is None


def test_change_request_flow_commands_update_state_and_render_surfaces(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    story = mem.store.create_refinement_story(journey="sandbox-pet-store", title="RS flow")
    cr = mem.store.create_change_request(
        journey="sandbox-pet-store",
        refinement_story_id=story.id,
        title="Validate CR flow",
        body="State only.",
    )
    mem.store.create_change_request(
        journey="sandbox-pet-store",
        refinement_story_id=story.id,
        title="Next CR flow",
        body="Next state.",
    )
    mem.store.update_refinement_story_status(story.id, "active")
    mem.store.set_refinement_cursor(
        journey="sandbox-pet-store",
        active_refinement_story_id=story.id,
        active_change_request_id=None,
        last_refinement_event="refinement_story_pulled",
    )
    set_delivery_cursor(
        mem.store, journey="sandbox-pet-store", method="ariad", active_item="CV2.DS1"
    )
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_change_request_flow("select", journey="sandbox-pet-store", change_request_id=cr.id)
    build.cmd_change_request_flow("confirm", journey="sandbox-pet-store", change_request_id=cr.id)
    build.cmd_change_request_flow(
        "plan", journey="sandbox-pet-store", change_request_id=cr.id, summary="Plan state"
    )
    build.cmd_change_request_flow(
        "mark-implemented",
        journey="sandbox-pet-store",
        change_request_id=cr.id,
        evidence="Implemented state",
    )
    build.cmd_change_request_flow(
        "validate", journey="sandbox-pet-store", change_request_id=cr.id, evidence="Valid"
    )
    build.cmd_change_request_flow(
        "done", journey="sandbox-pet-store", change_request_id=cr.id, notes="Done state"
    )

    out = capsys.readouterr().out
    assert out.count("<<<ARIAD:REFINEMENT_FLOW_EVENT>>>") == 6
    assert "<<<ARIAD:REFINEMENT_STORY_PROGRESS>>>" in out
    assert "RS001 PROGRESS" in out
    assert "🟩🟦 1/2 resolved" in out
    assert "🟩 CR001: Validate CR flow [done]" in out
    assert "🟦 CR002: Next CR flow [captured]" in out
    assert "Next CR recommendation: CR002 — Next CR flow [captured]" in out
    assert "Await Navigator confirmation before selecting it." in out
    assert mem.store.get_change_request(cr.id).status == "done"
    assert mem.store.get_refinement_cursor("sandbox-pet-store").active_change_request_id is None
    assert get_delivery_cursor(mem.store, "sandbox-pet-store").active_item == "CV2.DS1"


def test_refinement_story_flow_commands_review_coherence_close(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    story = mem.store.create_refinement_story(journey="sandbox-pet-store", title="RS flow")
    mem.store.update_refinement_story_status(story.id, "active")
    mem.store.set_refinement_cursor(
        journey="sandbox-pet-store",
        active_refinement_story_id=story.id,
        active_change_request_id=None,
        last_refinement_event="change_request_done",
    )
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_refinement_story_flow(
        "review", journey="sandbox-pet-store", refinement_story_id=story.id, summary="Review only"
    )
    build.cmd_refinement_story_flow(
        "coherence", journey="sandbox-pet-store", refinement_story_id=story.id, summary="Coherent"
    )
    build.cmd_refinement_story_flow(
        "close", journey="sandbox-pet-store", refinement_story_id=story.id, summary="Closed"
    )

    out = capsys.readouterr().out
    assert out.count("<<<ARIAD:REFINEMENT_FLOW_EVENT>>>") == 3
    assert "RS Flow:" in out
    assert "🔎 RS001 REVIEW" in out
    assert "◉ RS001 COHERENCE" in out
    assert "◻ RS001 CLOSED" in out
    assert "RS001: RS flow" not in out
    assert "Review only" in out
    assert "Coherent" in out
    assert "Closed" in out
    assert "current RS phase" not in out
    assert mem.store.get_refinement_story(story.id).status == "closed"
    assert mem.store.get_refinement_cursor("sandbox-pet-store").active_refinement_story_id is None


def test_change_request_flow_park_reject_promote_commands_update_state_and_render_surfaces(
    mocker, tmp_path, capsys
):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    story = mem.store.create_refinement_story(journey="sandbox-pet-store", title="RS flow")
    park_cr = mem.store.create_change_request(
        journey="sandbox-pet-store", refinement_story_id=story.id, title="Park CR", body="Body."
    )
    reject_cr = mem.store.create_change_request(
        journey="sandbox-pet-store", refinement_story_id=story.id, title="Reject CR", body="Body."
    )
    promote_cr = mem.store.create_change_request(
        journey="sandbox-pet-store", refinement_story_id=story.id, title="Promote CR", body="Body."
    )
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_change_request_flow(
        "park",
        journey="sandbox-pet-store",
        change_request_id=park_cr.id,
        reason="Deferred to build 2",
        revisit_trigger="When the API ships",
    )
    build.cmd_change_request_flow(
        "reject", journey="sandbox-pet-store", change_request_id=reject_cr.id, reason="Duplicate"
    )
    build.cmd_change_request_flow(
        "promote", journey="sandbox-pet-store", change_request_id=promote_cr.id, target="DS-99"
    )

    out = capsys.readouterr().out
    assert out.count("<<<ARIAD:REFINEMENT_FLOW_EVENT>>>") == 3
    assert "🟫 CR001 PARKED" in out
    assert "🟥 CR002 REJECTED" in out
    assert "🔷 CR003 PROMOTED" in out
    assert mem.store.get_change_request(park_cr.id).status == "parked"
    assert mem.store.get_change_request(reject_cr.id).status == "rejected"
    assert mem.store.get_change_request(promote_cr.id).status == "promoted"


def test_refinement_story_park_command_parks_active_story(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    story = mem.store.create_refinement_story(journey="sandbox-pet-store", title="RS flow")
    mem.store.update_refinement_story_status(story.id, "active")
    mem.store.set_refinement_cursor(
        journey="sandbox-pet-store",
        active_refinement_story_id=story.id,
        active_change_request_id=None,
        last_refinement_event="refinement_story_pulled",
    )
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_refinement_story_flow(
        "park",
        journey="sandbox-pet-store",
        refinement_story_id=story.id,
        reason="Not now",
        revisit_trigger="Next planning cycle",
    )

    out = capsys.readouterr().out
    assert "🟫 RS001 PARKED" in out
    assert mem.store.get_refinement_story(story.id).status == "parked"
    assert mem.store.get_refinement_cursor("sandbox-pet-store").active_refinement_story_id is None


def test_change_request_park_reject_promote_argparse_wiring(mocker, tmp_path, capsys):
    """Drive the real argparse path (main()), not just the cmd_* function.

    This is new subparser/dispatch wiring for CV20.DS14; unlike the pre-existing
    six CR verbs (which this repo tests only at the cmd_* layer), the new
    verbs get this extra check because the wiring itself is new and unverified.
    """
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    story = mem.store.create_refinement_story(journey="sandbox-pet-store", title="RS flow")
    cr = mem.store.create_change_request(
        journey="sandbox-pet-store", refinement_story_id=story.id, title="Park CR", body="Body."
    )
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.main(
        [
            "change-request",
            "park",
            "--journey",
            "sandbox-pet-store",
            "--change-request-id",
            cr.id,
            "--reason",
            "Deferred to build 2",
            "--revisit-trigger",
            "When the API ships",
        ]
    )

    out = capsys.readouterr().out
    assert "🟫 CR001 PARKED" in out
    assert mem.store.get_change_request(cr.id).status == "parked"


def test_refinement_story_park_argparse_wiring(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    story = mem.store.create_refinement_story(journey="sandbox-pet-store", title="RS flow")
    mem.store.update_refinement_story_status(story.id, "active")
    mem.store.set_refinement_cursor(
        journey="sandbox-pet-store",
        active_refinement_story_id=story.id,
        active_change_request_id=None,
        last_refinement_event="refinement_story_pulled",
    )
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.main(
        [
            "refinement-story",
            "park",
            "--journey",
            "sandbox-pet-store",
            "--refinement-story-id",
            story.id,
            "--reason",
            "Not now",
            "--revisit-trigger",
            "Next planning cycle",
        ]
    )

    out = capsys.readouterr().out
    assert "🟫 RS001 PARKED" in out
    assert mem.store.get_refinement_story(story.id).status == "parked"


def test_change_request_park_missing_required_arg_exits_with_usage_error(capsys):
    with pytest.raises(SystemExit) as exc_info:
        build.main(
            [
                "change-request",
                "park",
                "--journey",
                "sandbox-pet-store",
                "--change-request-id",
                "cr-1",
                "--reason",
                "Deferred",
                # --revisit-trigger deliberately omitted
            ]
        )

    assert exc_info.value.code == 2
    err = capsys.readouterr().err
    assert "--revisit-trigger" in err


def test_change_request_park_on_terminal_cr_exits_cleanly_without_traceback(
    mocker, tmp_path, capsys
):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    story = mem.store.create_refinement_story(journey="sandbox-pet-store", title="RS flow")
    cr = mem.store.create_change_request(
        journey="sandbox-pet-store", refinement_story_id=story.id, title="Done CR", body="Body."
    )
    mem.store.update_change_request_status(cr.id, "done", completed_at="2026-07-20T00:00:00Z")
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    with pytest.raises(SystemExit) as exc_info:
        build.main(
            [
                "change-request",
                "park",
                "--journey",
                "sandbox-pet-store",
                "--change-request-id",
                cr.id,
                "--reason",
                "Deferred",
                "--revisit-trigger",
                "Later",
            ]
        )

    assert exc_info.value.code == 1
    err = capsys.readouterr().err
    assert "Error:" in err
    assert "already terminal" in err
    assert "Traceback" not in err


def test_refinement_story_close_rejects_unfinished_cr(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "sandbox-pet-store", JOURNEY_CONTENT)
    story = mem.store.create_refinement_story(journey="sandbox-pet-store", title="RS flow")
    cr = mem.store.create_change_request(
        journey="sandbox-pet-store",
        title="Unfinished CR",
        body="Still captured",
        refinement_story_id=story.id,
    )
    mem.store.update_refinement_story_status(story.id, "active")
    mem.store.set_refinement_cursor(
        journey="sandbox-pet-store",
        active_refinement_story_id=story.id,
        active_change_request_id=None,
        last_refinement_event="refinement_story_coherent",
    )
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    import pytest

    with pytest.raises(SystemExit):
        build.cmd_refinement_story_flow(
            "close", journey="sandbox-pet-store", refinement_story_id=story.id, summary="Closed"
        )

    err = capsys.readouterr().err
    assert "unfinished Change Requests" in err
    assert cr.id in err
    assert mem.store.get_refinement_story(story.id).status == "active"


# --- CV20.DS13 — Delivery Story grammar roadmap support (CLI) ---


def _ds_grammar_project(project_path):
    roadmap = project_path / "docs" / "project" / "roadmap"
    (roadmap / "ds-35-application-admin-parity").mkdir(parents=True)
    (roadmap / "index.md").write_text(
        """# Roadmap

## Chapter 7 — Platform Migration — 🟡 Planned

| Code | Delivery Story | Status |
|------|----------------|--------|
| [DS-34](ds-34-data-model-migration/index.md) | Data Model Migration | ✅ Done |
| [DS-35](ds-35-application-admin-parity/index.md) | Application & Admin Parity | 🟡 Planned |
""",
        encoding="utf-8",
    )
    (roadmap / "ds-35-application-admin-parity" / "index.md").write_text(
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
    (roadmap / "ds-34-data-model-migration").mkdir(parents=True)
    (roadmap / "ds-34-data-model-migration" / "index.md").write_text(
        "# DS-34 — Data Model Migration\n\n**Status:** ✅ Done\n", encoding="utf-8"
    )
    legacy = roadmap / "legacy" / "cv5-learning-loop"
    legacy.mkdir(parents=True)
    legacy.joinpath("index.md").write_text(
        "# CV5 — Learning Loop\n\n**Status:** Planned\n", encoding="utf-8"
    )


def test_build_pull_ds_grammar_delivery_story_expands_real_children(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    project_path = tmp_path / "project"
    _ds_grammar_project(project_path)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "uncle-vinny", JOURNEY_CONTENT)
    mem.journeys.set_project_path("uncle-vinny", str(project_path))
    set_adopted_method(mem.store, "uncle-vinny", "ariad")
    set_delivery_cursor(mem.store, journey="uncle-vinny", method="ariad")
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_pull_item(
        "ariad",
        journey="uncle-vinny",
        item_code="DS-35",
        item_title="Application & Admin Parity",
        item_level="delivery_story",
        why_now="next candidate capability",
    )

    out = capsys.readouterr().out
    cursor = get_delivery_cursor(mem.store, "uncle-vinny")
    assert cursor is not None
    assert cursor.child_work_items == ("DS-35.US-1", "DS-35.TS-1")
    assert "<<<ARIAD:DELIVERY_STORY_READY>>>" in out
    assert "<<<ARIAD:ARTIFACTS_MATERIALIZED>>>" in out
    assert "created US-1 package" in out
    assert "created TS-1 package" in out
    assert "US1 package" not in out


def test_build_pull_candidates_excludes_legacy_on_ds_roadmap(mocker, tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    project_path = tmp_path / "project"
    _ds_grammar_project(project_path)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "uncle-vinny", JOURNEY_CONTENT)
    mem.journeys.set_project_path("uncle-vinny", str(project_path))
    set_adopted_method(mem.store, "uncle-vinny", "ariad")
    set_delivery_cursor(mem.store, journey="uncle-vinny", method="ariad")
    mocker.patch("memory.cli.build.MemoryClient", return_value=mem)

    build.cmd_pull_candidates("ariad", journey="uncle-vinny")

    out = capsys.readouterr().out
    assert "DS-35 — Application & Admin Parity" in out
    assert "CV5" not in out
    assert "Learning Loop" not in out
