"""Unit tests for conversation_logger."""

import json
from unittest.mock import MagicMock

from memory.models import Conversation, Message


def _make_entries(
    user_ts: str = "2026-04-13T10:00:00Z",
    assistant_ts: str = "2026-04-13T10:01:00Z",
    assistant_text: str = "Assistant response.",
) -> list[dict]:
    return [
        {
            "type": "user",
            "timestamp": user_ts,
            "message": {"content": "User question."},
        },
        {
            "type": "assistant",
            "timestamp": assistant_ts,
            "message": {"content": [{"type": "text", "text": assistant_text}]},
        },
    ]


class TestBackfillAssistantMessages:
    def _make_conv(
        self,
        started_at: str = "2026-04-13T09:55:00Z",
        ended_at: str | None = "2026-04-13T10:05:00Z",
        journey: str | None = "mirror-poc",
    ) -> Conversation:
        return Conversation(
            interface="claude_code",
            journey=journey,
            started_at=started_at,
            ended_at=ended_at,
        )

    def test_stores_assistant_message_when_none_exist(self, mocker):
        conv = self._make_conv()
        entries = _make_entries()

        mock_mem = MagicMock()
        mock_mem.store.get_conversations_in_range.return_value = [conv]
        mock_mem.store.get_messages.return_value = []

        mocker.patch("memory.cli.conversation_logger.MemoryClient", return_value=mock_mem)
        mocker.patch("memory.cli.transcript_export.parse_jsonl", return_value=entries)

        from memory.cli.conversation_logger import backfill_assistant_messages

        backfill_assistant_messages("/fake/path.jsonl")

        mock_mem.add_message.assert_called_once_with(
            conv.id, role="assistant", content="Assistant response."
        )

    def test_skips_conversation_with_existing_assistant_messages(self, mocker):
        conv = self._make_conv()
        existing_msg = Message(
            conversation_id=conv.id, role="assistant", content="Previous summary."
        )
        entries = _make_entries()

        mock_mem = MagicMock()
        mock_mem.store.get_conversations_in_range.return_value = [conv]
        mock_mem.store.get_messages.return_value = [existing_msg]

        mocker.patch("memory.cli.conversation_logger.MemoryClient", return_value=mock_mem)
        mocker.patch("memory.cli.transcript_export.parse_jsonl", return_value=entries)

        from memory.cli.conversation_logger import backfill_assistant_messages

        backfill_assistant_messages("/fake/path.jsonl")

        mock_mem.add_message.assert_not_called()


class TestInterfaceForwarding:
    def test_log_user_message_forwards_interface(self, mocker):
        mock_mem = MagicMock()
        runtime_session = None
        mock_mem.store.get_runtime_session.return_value = runtime_session
        mock_mem.runtime_sessions.get_or_create_conversation.return_value = MagicMock(id="conv-1")
        mocker.patch("memory.cli.conversation_logger._memory_client", return_value=mock_mem)

        from memory.cli.conversation_logger import log_user_message

        log_user_message("sess-1", "hello", interface="pi")

        mock_mem.runtime_sessions.get_or_create_conversation.assert_called_once_with(
            "sess-1", interface="pi", persona=None, journey=None
        )

    def test_log_assistant_message_forwards_interface(self, mocker):
        mock_mem = MagicMock()
        mock_mem.runtime_sessions.get_or_create_conversation.return_value = MagicMock(id="conv-1")
        mocker.patch("memory.cli.conversation_logger._memory_client", return_value=mock_mem)

        from memory.cli.conversation_logger import log_assistant_message

        log_assistant_message("sess-1", "response", interface="pi")

        mock_mem.runtime_sessions.get_or_create_conversation.assert_called_once_with(
            "sess-1", interface="pi", persona=None, journey=None
        )


def test_status_reads_mute_flag_from_mirror_home(tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    mute_path = mirror_home / "mute"
    mute_path.parent.mkdir(parents=True, exist_ok=True)
    mute_path.write_text("")

    from memory.cli import conversation_logger

    conversation_logger.main(["--mirror-home", str(mirror_home), "status"])

    captured = capsys.readouterr()
    assert captured.out.strip() == "MUTED"


class TestSwitchConversation:
    def test_uses_latest_active_runtime_session_when_no_session_id_is_available(self, mocker):
        class Row(dict):
            def __getitem__(self, key):
                return super().__getitem__(key)

        mock_mem = MagicMock()
        mock_mem.store.conn.execute.return_value.fetchone.return_value = Row(
            session_id="pi-session-from-db"
        )
        runtime_session = MagicMock(
            conversation_id="old-conv", interface="pi", persona=None, journey=None
        )
        mock_mem.store.get_runtime_session.return_value = runtime_session
        mock_mem.start_conversation.return_value = MagicMock(id="new-conv")
        mocker.patch("memory.cli.conversation_logger._memory_client", return_value=mock_mem)
        mocker.patch.dict("os.environ", {"MIRROR_SESSION_ID": ""}, clear=False)

        from memory.cli.conversation_logger import switch_conversation

        conv_id = switch_conversation(persona="engineer", journey="mirror-mind")

        assert conv_id == "new-conv"
        mock_mem.end_conversation.assert_called_once_with("old-conv", extract=True)
        mock_mem.start_conversation.assert_called_once_with(
            interface="pi", persona="engineer", journey="mirror-mind"
        )
        mock_mem.store.upsert_runtime_session.assert_called_once_with(
            "pi-session-from-db",
            conversation_id="new-conv",
            interface="pi",
            persona="engineer",
            journey="mirror-mind",
            active=True,
            closed_at=None,
        )

    def test_explicit_session_id_still_takes_precedence(self, mocker):
        mock_mem = MagicMock()
        runtime_session = MagicMock(conversation_id=None, interface="pi")
        mock_mem.store.get_runtime_session.return_value = runtime_session
        mock_mem.start_conversation.return_value = MagicMock(id="new-conv")
        mocker.patch("memory.cli.conversation_logger._memory_client", return_value=mock_mem)
        mocker.patch.dict("os.environ", {"MIRROR_SESSION_ID": "env-session"}, clear=False)

        from memory.cli.conversation_logger import switch_conversation

        switch_conversation(session_id="explicit-session", journey="mirror-mind")

        mock_mem.store.get_runtime_session.assert_called_once_with("explicit-session")
        mock_mem.store.conn.execute.assert_not_called()


class TestJourneyAssociationRepair:
    def test_infers_explicit_build_command_after_skill_payload(self):
        from memory.cli.conversation_logger import _infer_journey_for_conversation

        journey, reason = _infer_journey_for_conversation(
            '<skill name="mm-build">...',
            "<skill>instructions</skill>\n\n/mm-build mirror-mind",
            {"mirror-mind": ["mirror mind", "mirror-mind"]},
        )

        assert journey == "mirror-mind"
        assert reason == "explicit build command"

    def test_infers_activation_phrase(self):
        from memory.cli.conversation_logger import _infer_journey_for_conversation

        journey, reason = _infer_journey_for_conversation(
            "vamos trabalhar no maestro",
            "vamos trabalhar no maestro",
            {"maestro": ["maestro"]},
        )

        assert journey == "maestro"
        assert reason == "activation phrase"

    def test_prefers_longer_alias(self):
        from memory.cli.conversation_logger import _infer_journey_for_conversation

        journey, _ = _infer_journey_for_conversation(
            "vamos retomar a journey mirror self update",
            "vamos retomar a journey mirror self update",
            {
                "mirror-mind": ["mirror mind", "mirror-mind"],
                "mirror-self-update": ["mirror self update", "mirror-self-update"],
            },
        )

        assert journey == "mirror-self-update"

    def test_does_not_match_short_alias_inside_longer_unknown_name(self):
        from memory.cli.conversation_logger import _infer_journey_for_conversation

        journey, reason = _infer_journey_for_conversation(
            "vamos retomar o trabalho no projeto mirror mind self update",
            "vamos retomar o trabalho no projeto mirror mind self update",
            {"mirror-mind": ["mirror mind", "mirror-mind"]},
        )

        assert journey is None
        assert reason is None


class TestSessionStart:
    def test_unmutes_and_returns_active(self, mocker, tmp_path):
        mocker.patch("memory.cli.conversation_logger._MUTE_FLAG_PATH", tmp_path / "mute")
        mocker.patch("memory.cli.conversation_logger.extract_pending", return_value=0)
        mocker.patch("memory.cli.conversation_logger.close_stale_orphans", return_value=0)
        mocker.patch("memory.cli.conversation_logger.backfill_pi_sessions", return_value=0)

        from memory.cli.conversation_logger import session_start

        result = session_start()
        assert "ACTIVE" in result

    def test_reports_counts(self, mocker, tmp_path):
        mocker.patch("memory.cli.conversation_logger._MUTE_FLAG_PATH", tmp_path / "mute")
        mocker.patch("memory.cli.conversation_logger.extract_pending", return_value=3)
        mocker.patch("memory.cli.conversation_logger.close_stale_orphans", return_value=2)
        mocker.patch("memory.cli.conversation_logger.backfill_pi_sessions", return_value=1)

        from memory.cli.conversation_logger import session_start

        result = session_start()
        assert "Closed 2" in result
        assert "Backfilled 1" in result
        assert "Extracted memories from 3" in result


class TestCloseStaleOrphans:
    def test_closes_idle_conversations_except_active_session_ones(self, mocker):
        orphan = Conversation(interface="claude_code", id="orphan-1")
        active_conv = Conversation(interface="claude_code", id="active-conv")
        mock_mem = MagicMock()
        mock_mem.store.get_open_conversations_idle_since.return_value = [orphan, active_conv]
        mock_mem.store.get_active_runtime_conversation_ids.return_value = {"active-conv"}
        mocker.patch("memory.cli.conversation_logger._memory_client", return_value=mock_mem)

        from memory.cli.conversation_logger import close_stale_orphans

        count = close_stale_orphans()
        assert count == 1
        mock_mem.conversations.end_conversation.assert_called_once_with("orphan-1", extract=True)


class TestSessionEndPi:
    def test_calls_end_session_with_extract_false(self, mocker):
        mocker.patch("memory.cli.conversation_logger.end_session")

        from memory.cli.conversation_logger import main

        main(["session-end-pi", "pi-session-id"])

        from memory.cli.conversation_logger import end_session

        end_session.assert_called_once_with("pi-session-id", extract=False, mirror_home=None)


class TestBackfillPiSessions:
    def test_imports_valid_jsonl(self, mocker, tmp_path):
        pi_dir = tmp_path / "sessions" / "--project--"
        pi_dir.mkdir(parents=True)
        session_file = pi_dir / "2026-04-17T10-00-00.jsonl"
        session_file.write_text(
            json.dumps(
                {
                    "type": "message",
                    "message": {
                        "role": "user",
                        "content": "hello",
                        "timestamp": "2026-04-17T10:00:00Z",
                    },
                }
            )
            + "\n"
            + json.dumps(
                {
                    "type": "message",
                    "message": {
                        "role": "assistant",
                        "content": [{"type": "text", "text": "hi there"}],
                        "timestamp": "2026-04-17T10:00:01Z",
                    },
                }
            )
            + "\n"
        )
        mocker.patch("memory.cli.conversation_logger._PI_SESSIONS_DIR", tmp_path / "sessions")
        mock_mem = MagicMock()
        mock_mem.store.get_runtime_session.return_value = None
        mock_mem.start_conversation.return_value = MagicMock(id="new-conv-1")
        mocker.patch("memory.cli.conversation_logger._memory_client", return_value=mock_mem)

        from memory.cli.conversation_logger import backfill_pi_sessions

        count = backfill_pi_sessions()
        assert count == 1
        mock_mem.start_conversation.assert_called_once_with(interface="pi")
        mock_mem.store.upsert_runtime_session.assert_called_once()

    def test_skips_already_imported(self, mocker, tmp_path):
        pi_dir = tmp_path / "sessions" / "--project--"
        pi_dir.mkdir(parents=True)
        session_file = pi_dir / "session.jsonl"
        session_file.write_text("")
        mocker.patch("memory.cli.conversation_logger._PI_SESSIONS_DIR", tmp_path / "sessions")
        mock_mem = MagicMock()
        mock_mem.store.get_runtime_session.return_value = object()
        mocker.patch("memory.cli.conversation_logger._memory_client", return_value=mock_mem)

        from memory.cli.conversation_logger import backfill_pi_sessions

        count = backfill_pi_sessions()
        assert count == 0
        mock_mem.start_conversation.assert_not_called()

    def test_resolves_sessions_dir_from_explicit_argument(self, mocker, tmp_path):
        pi_dir = tmp_path / "custom-pi"
        pi_dir.mkdir()
        mock_mem = MagicMock()
        mocker.patch("memory.cli.conversation_logger._memory_client", return_value=mock_mem)

        from memory.cli.conversation_logger import backfill_pi_sessions

        # Dir exists but contains no jsonl files -> 0, but importantly does
        # not touch the default ~/.pi location.
        assert backfill_pi_sessions(sessions_dir=pi_dir) == 0

    def test_resolves_sessions_dir_from_pi_sessions_env_var(self, mocker, tmp_path):
        pi_dir = tmp_path / "env-pi"
        pi_dir.mkdir()
        mocker.patch.dict("os.environ", {"PI_SESSIONS_DIR": str(pi_dir)}, clear=False)
        # Ensure any test-level monkey-patch of the module constant is cleared.
        mocker.patch("memory.cli.conversation_logger._PI_SESSIONS_DIR", None)
        mock_mem = MagicMock()
        mocker.patch("memory.cli.conversation_logger._memory_client", return_value=mock_mem)

        from memory.cli.conversation_logger import backfill_pi_sessions

        assert backfill_pi_sessions() == 0
