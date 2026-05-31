"""Tests for conversations CLI behavior."""

import json

from memory import MemoryClient
from memory.config import default_db_path_for_home


def test_conversations_reads_from_explicit_mirror_home(tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    conv = mem.start_conversation(
        "cli", persona="engineer", journey="mirror-poc", title="Scoped conversation"
    )
    mem.add_message(conv.id, "user", "Hello")

    from memory.cli.conversations import main

    main(["--mirror-home", str(mirror_home)])

    captured = capsys.readouterr()
    assert "Scoped conversation" in captured.out
    assert "mirror-poc" in captured.out
    assert conv.id[:8] in captured.out


def test_conversations_explicit_mirror_home_overrides_environment_selection(
    mocker, tmp_path, capsys
):
    env_home = tmp_path / ".mirror" / "testuser"
    env_db_path = default_db_path_for_home(env_home)
    env_mem = MemoryClient(env="test", db_path=env_db_path)
    env_conv = env_mem.start_conversation("cli", title="Environment conversation")
    env_mem.add_message(env_conv.id, "user", "env")

    explicit_home = tmp_path / ".mirror" / "pati"
    explicit_db_path = default_db_path_for_home(explicit_home)
    explicit_mem = MemoryClient(env="test", db_path=explicit_db_path)
    explicit_conv = explicit_mem.start_conversation("cli", title="Explicit conversation")
    explicit_mem.add_message(explicit_conv.id, "user", "explicit")

    mocker.patch.dict("os.environ", {"MIRROR_HOME": str(env_home)}, clear=False)

    from memory.cli.conversations import main

    main(["--mirror-home", str(explicit_home)])

    captured = capsys.readouterr()
    assert "Explicit conversation" in captured.out
    assert "Environment conversation" not in captured.out


def test_conversations_metadata_lifecycle_dry_run_reports_without_mutation(tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    conv = mem.start_conversation("cli")
    mem.conversations.set_provisional_title(conv.id, "vamos trabalhar no maestro")
    mem.add_message(conv.id, "user", "Vamos validar checkpoint visibility")
    mem.add_message(conv.id, "assistant", "Vamos revisar o handoff")
    before = mem.store.get_conversation(conv.id)

    from memory.cli.conversations import main

    main(["--mirror-home", str(mirror_home), "--metadata-lifecycle-dry-run", conv.id])

    captured = capsys.readouterr()
    report = json.loads(captured.out)
    after = mem.store.get_conversation(conv.id)
    assert report["mode"] == "dry_run"
    assert report["mutated"] is False
    assert report["fields"]["title"]["decision"] == "repair"
    assert after.title == before.title
    assert after.metadata == before.metadata


def test_conversations_metadata_lifecycle_apply_reports_changes(tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    conv = mem.start_conversation("cli")
    mem.conversations.set_provisional_title(conv.id, "vamos trabalhar no maestro")
    mem.add_message(conv.id, "user", "Vamos validar checkpoint visibility")
    mem.add_message(conv.id, "assistant", "Vamos revisar o handoff")

    from memory.cli.conversations import main

    main([
        "--mirror-home",
        str(mirror_home),
        "--metadata-lifecycle-apply",
        conv.id,
        "--title",
        "Maestro checkpoint visibility validation",
        "--tag",
        "maestro",
        "--tag",
        "metadata",
    ])

    captured = capsys.readouterr()
    report = json.loads(captured.out)
    stored = mem.store.get_conversation(conv.id)
    assert report["mode"] == "apply"
    assert report["mutated"] is True
    assert report["changed"]["title"] == "Maestro checkpoint visibility validation"
    assert report["skipped"]["summary"] == "no_value_provided"
    assert stored.title == "Maestro checkpoint visibility validation"


def test_conversations_metadata_lifecycle_apply_preserves_manual_lock(tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    conv = mem.start_conversation("cli", title="Initial title")
    mem.add_message(conv.id, "user", "Quero corrigir títulos")
    mem.add_message(conv.id, "assistant", "Vamos desenhar a correção")
    mem.conversations.update_title(conv.id, "Manual conversation title")

    from memory.cli.conversations import main

    main([
        "--mirror-home",
        str(mirror_home),
        "--metadata-lifecycle-apply",
        conv.id,
        "--title",
        "Generated replacement title",
    ])

    captured = capsys.readouterr()
    report = json.loads(captured.out)
    stored = mem.store.get_conversation(conv.id)
    assert report["mode"] == "apply"
    assert report["mutated"] is False
    assert report["skipped"]["title"] == "manual_lock_preserved"
    assert stored.title == "Manual conversation title"


def test_conversations_metadata_lifecycle_demo_reports_pass_without_production_data(capsys):
    from memory.cli.conversations import main

    main(["--metadata-lifecycle-demo"])

    captured = capsys.readouterr()
    report = json.loads(captured.out)
    assert report["mode"] == "metadata_lifecycle_demo"
    assert report["uses_production_data"] is False
    assert report["passed"] is True
    assert report["checks"]["preview_non_mutating"] is True
    assert report["checks"]["apply_changed_title"] is True
    assert report["checks"]["manual_lock_preserved"] is True
    assert report["checks"]["refine_candidate_skipped"] is True


def test_conversations_metadata_lifecycle_preview_at_message_reports_boundary(
    tmp_path, capsys
):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    conv = mem.start_conversation("cli", title="Metadata lifecycle")
    first = mem.add_message(conv.id, "user", "Vamos tratar o título")
    mem.add_message(conv.id, "assistant", "Podemos criar uma política")

    from memory.cli.conversations import main

    main([
        "--mirror-home",
        str(mirror_home),
        "--metadata-lifecycle-preview-at-message",
        first.id,
    ])

    captured = capsys.readouterr()
    report = json.loads(captured.out)
    assert report["mode"] == "debug_preview_at_message"
    assert report["mutated"] is False
    assert report["conversation_id"] == conv.id
    assert report["message_id"] == first.id
    assert report["included_message_count"] == 1
    assert report["excluded_message_count"] == 1
