"""Tests for Builder Mode CLI context loader."""

from pathlib import Path

import pytest

from memory import MemoryClient
from memory.builder.delivery_cursor import set_delivery_cursor
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


def test_build_load_renders_resume_surface_for_adopted_journey(mocker, tmp_path, capsys):
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
    assert "BUILDER RESUME" in out
    assert "journey\nsandbox-pet-store" in out
    assert "adopted method\nariad" in out
    assert "resumable\nyes" in out
    assert "CV20 — Builder Mode Evolution" in out
    assert "last delivery event\ntemplate_preparation" in out
    assert "no story lifecycle work was executed" in out


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
