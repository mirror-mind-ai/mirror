"""Tests for session-end hook behavior in the conversation logger.

The old TRANSCRIPT_EXPORT_AUTOMATIC behavior has been removed.
backfill_assistant_messages is now always called when a transcript exists.
"""

import json


def _session_end_payload(session_id: str = "sess-1", transcript_path: str | None = None) -> str:
    payload = {"session_id": session_id}
    if transcript_path is not None:
        payload["transcript_path"] = transcript_path
    return json.dumps(payload)


def test_hook_session_end_always_backfills_when_transcript_exists(mocker, tmp_path):
    transcript_path = tmp_path / "session.jsonl"
    transcript_path.write_text("{}\n", encoding="utf-8")

    mocker.patch(
        "sys.stdin.read", return_value=_session_end_payload(transcript_path=str(transcript_path))
    )
    mocker.patch("memory.cli.conversation_logger.end_session")
    backfill = mocker.patch("memory.cli.conversation_logger.backfill_assistant_messages")

    from memory.cli.conversation_logger import hook_session_end

    try:
        hook_session_end()
    except SystemExit as exc:
        assert exc.code == 0

    # The hook threads its mirror home through so --mirror-home is honored
    # (CV22.DS7.US5); the runtime hooks pass None and keep ambient resolution.
    backfill.assert_called_once_with(str(transcript_path), mirror_home=None)


def test_hook_session_end_never_calls_export_transcript(mocker, tmp_path):
    transcript_path = tmp_path / "session.jsonl"
    transcript_path.write_text("{}\n", encoding="utf-8")

    mocker.patch(
        "sys.stdin.read", return_value=_session_end_payload(transcript_path=str(transcript_path))
    )
    mocker.patch("memory.cli.conversation_logger.end_session")
    mocker.patch("memory.cli.conversation_logger.backfill_assistant_messages")
    export_transcript = mocker.patch("memory.cli.transcript_export.export_transcript")

    from memory.cli.conversation_logger import hook_session_end

    try:
        hook_session_end()
    except SystemExit as exc:
        assert exc.code == 0

    export_transcript.assert_not_called()


def test_hook_session_end_skips_backfill_when_no_transcript(mocker, tmp_path):
    mocker.patch(
        "sys.stdin.read",
        return_value=_session_end_payload(),  # no transcript_path
    )
    mocker.patch("memory.cli.conversation_logger.end_session")
    backfill = mocker.patch("memory.cli.conversation_logger.backfill_assistant_messages")

    from memory.cli.conversation_logger import hook_session_end

    try:
        hook_session_end()
    except SystemExit as exc:
        assert exc.code == 0

    backfill.assert_not_called()
