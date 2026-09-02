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


# --- Hook entries (CV22.DS7.US5 finding) ---------------------------------
#
# `main()` parsed --mirror-home but the hook entries took no arguments, so
# `user-prompt` and `session-end` wrote to the ambient resolved home while
# silently accepting the flag. Found while porting the family to TypeScript:
# an E2E revertibility check wrote into the mirror home's test database
# instead of the disposable home it was given.


def test_user_prompt_hook_honours_explicit_mirror_home(mocker, tmp_path):
    import io
    import json

    import pytest

    env_home = tmp_path / ".mirror" / "testuser"
    explicit_home = tmp_path / ".mirror" / "pati"
    mocker.patch.dict("os.environ", {"MIRROR_HOME": str(env_home)}, clear=False)
    mocker.patch(
        "sys.stdin",
        io.StringIO(json.dumps({"session_id": "hook-1", "prompt": "hello from the hook"})),
    )

    from memory.cli.conversation_logger import main

    with pytest.raises(SystemExit) as exit_info:
        main(["--mirror-home", str(explicit_home), "user-prompt"])
    assert exit_info.value.code == 0

    env_mem = MemoryClient(env="test", db_path=default_db_path_for_home(env_home))
    explicit_mem = MemoryClient(env="test", db_path=default_db_path_for_home(explicit_home))

    assert env_mem.store.conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0] == 0
    rows = explicit_mem.store.conn.execute("SELECT role, content FROM messages").fetchall()
    assert [(row["role"], row["content"]) for row in rows] == [("user", "hello from the hook")]


def test_user_prompt_hook_reads_mute_state_from_explicit_mirror_home(mocker, tmp_path):
    import io
    import json

    import pytest

    env_home = tmp_path / ".mirror" / "testuser"
    explicit_home = tmp_path / ".mirror" / "pati"
    explicit_home.mkdir(parents=True, exist_ok=True)
    (explicit_home / "mute").write_text("")
    mocker.patch.dict("os.environ", {"MIRROR_HOME": str(env_home)}, clear=False)
    mocker.patch(
        "sys.stdin",
        io.StringIO(json.dumps({"session_id": "hook-1", "prompt": "must not be logged"})),
    )

    from memory.cli.conversation_logger import main

    with pytest.raises(SystemExit):
        main(["--mirror-home", str(explicit_home), "user-prompt"])

    explicit_mem = MemoryClient(env="test", db_path=default_db_path_for_home(explicit_home))
    assert explicit_mem.store.conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0] == 0


def test_session_end_hook_honours_explicit_mirror_home(mocker, tmp_path):
    import io
    import json

    import pytest

    env_home = tmp_path / ".mirror" / "testuser"
    explicit_home = tmp_path / ".mirror" / "pati"
    mocker.patch.dict("os.environ", {"MIRROR_HOME": str(env_home)}, clear=False)

    explicit_mem = MemoryClient(env="test", db_path=default_db_path_for_home(explicit_home))
    conv = explicit_mem.start_conversation(interface="pi")
    explicit_mem.store.upsert_runtime_session(
        "hook-session", conversation_id=conv.id, interface="pi"
    )
    mocker.patch("sys.stdin", io.StringIO(json.dumps({"session_id": "hook-session"})))
    mocker.patch(
        "memory.services.conversation.ConversationService._run_extraction", return_value=[]
    )
    mocker.patch(
        "memory.services.conversation.ConversationService.finalize_metadata_on_close",
        return_value={},
    )

    from memory.cli.conversation_logger import main

    with pytest.raises(SystemExit):
        main(["--mirror-home", str(explicit_home), "session-end"])

    reopened = MemoryClient(env="test", db_path=default_db_path_for_home(explicit_home))
    assert reopened.store.get_conversation(conv.id).ended_at is not None
    assert reopened.store.get_runtime_session("hook-session").active is False
