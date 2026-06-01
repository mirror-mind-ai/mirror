"""Tests for conversation-logger mirror-home targeting."""

from memory import MemoryClient
from memory.config import default_db_path_for_home


def test_status_uses_explicit_mirror_home_for_mute_state(mocker, tmp_path, capsys):
    env_home = tmp_path / ".mirror" / "testuser"
    explicit_home = tmp_path / ".mirror" / "pati"
    (explicit_home / "mute").parent.mkdir(parents=True, exist_ok=True)
    (explicit_home / "mute").write_text("")

    mocker.patch.dict("os.environ", {"MIRROR_HOME": str(env_home)}, clear=False)

    from memory.cli.conversation_logger import main

    main(["--mirror-home", str(explicit_home), "status"])

    captured = capsys.readouterr()
    assert captured.out.strip() == "MUTED"


def test_log_user_explicit_mirror_home_overrides_environment_selection(mocker, tmp_path):
    env_home = tmp_path / ".mirror" / "testuser"
    explicit_home = tmp_path / ".mirror" / "pati"
    mocker.patch.dict("os.environ", {"MIRROR_HOME": str(env_home)}, clear=False)

    from memory.cli.conversation_logger import main

    main(["--mirror-home", str(explicit_home), "log-user", "sess-1", "hello"])

    env_mem = MemoryClient(env="test", db_path=default_db_path_for_home(env_home))
    explicit_mem = MemoryClient(env="test", db_path=default_db_path_for_home(explicit_home))

    assert env_mem.store.conn.execute("SELECT COUNT(*) FROM conversations").fetchone()[0] == 0
    assert explicit_mem.store.conn.execute("SELECT COUNT(*) FROM conversations").fetchone()[0] == 1


def test_session_end_pi_explicit_mirror_home_uses_explicit_runtime_session(mocker, tmp_path):
    env_home = tmp_path / ".mirror" / "testuser"
    explicit_home = tmp_path / ".mirror" / "pati"
    mocker.patch.dict("os.environ", {"MIRROR_HOME": str(env_home)}, clear=False)

    explicit_mem = MemoryClient(env="test", db_path=default_db_path_for_home(explicit_home))
    conv = explicit_mem.start_conversation(interface="pi")
    explicit_mem.store.upsert_runtime_session(
        "pi-session-id",
        conversation_id=conv.id,
        interface="pi",
    )

    mock_end = mocker.patch.object(explicit_mem, "end_conversation")
    mocker.patch("memory.cli.conversation_logger._memory_client", return_value=explicit_mem)

    from memory.cli.conversation_logger import main

    main(["--mirror-home", str(explicit_home), "session-end-pi", "pi-session-id"])

    mock_end.assert_called_once_with(conv.id, extract=False)


def test_session_end_pi_finalizes_metadata_through_real_command_path(mocker, tmp_path):
    import json

    explicit_home = tmp_path / ".mirror" / "pati"
    mem = MemoryClient(env="test", db_path=default_db_path_for_home(explicit_home))
    conv = mem.start_conversation(interface="pi")
    mem.conversations.set_provisional_title(conv.id, "vamos trabalhar no maestro")
    mem.add_message(conv.id, "user", "Vamos validar checkpoint visibility")
    mem.add_message(conv.id, "assistant", "Vamos revisar o handoff")
    mem.add_message(conv.id, "user", "Também resumo e tags")
    mem.add_message(conv.id, "assistant", "Vamos finalizar metadados")
    mem.store.upsert_runtime_session(
        "pi-session-id",
        conversation_id=conv.id,
        interface="pi",
    )
    mocker.patch(
        "memory.services.conversation.generate_conversation_title",
        return_value="Pi session metadata finalization",
    )
    mocker.patch(
        "memory.services.conversation.generate_conversation_summary",
        return_value="Pi session close finalized conversation metadata.",
    )
    mocker.patch(
        "memory.services.conversation.generate_conversation_tags",
        return_value=["pi", "metadata lifecycle"],
    )

    from memory.cli.conversation_logger import main

    main(["--mirror-home", str(explicit_home), "session-end-pi", "pi-session-id"])

    stored = mem.store.get_conversation(conv.id)
    runtime_session = mem.store.get_runtime_session("pi-session-id")
    metadata = json.loads(stored.metadata)
    assert stored.ended_at is not None
    assert stored.title == "Pi session metadata finalization"
    assert stored.summary == "Pi session close finalized conversation metadata."
    assert json.loads(stored.tags) == ["pi", "metadata lifecycle"]
    assert metadata["last_metadata_update_source"] == "close_time_metadata_finalization"
    assert runtime_session.active is False
