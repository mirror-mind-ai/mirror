"""CV9.E2.S7 (AI-02) — extraction failure isolation and quarantine.

Service-layer behavior: a failing extraction records a bounded attempt counter,
re-raises so the maintenance loop can isolate it, quarantines after the max, and
still finalizes/closes the conversation.
"""

import json

import pytest


def _eligible_conversation(conversation_service):
    """An ended-eligible conversation: journey set, four messages, not extracted."""
    conv = conversation_service.start_conversation(interface="cli", journey="mirror")
    for i in range(4):
        conversation_service.add_message(conv.id, role="user", content=f"message {i}")
    return conv


def _metadata(store, conv_id):
    return json.loads(store.get_conversation(conv_id).metadata or "{}")


class TestExtractionAttemptRecording:
    def test_failed_extraction_records_attempt_and_reraises(
        self, conversation_service, store, mocker
    ):
        mocker.patch(
            "memory.services.conversation.extract_memories",
            side_effect=RuntimeError("provider down"),
        )
        conv = _eligible_conversation(conversation_service)

        with pytest.raises(RuntimeError):
            conversation_service.extract_conversation(conv.id)

        meta = _metadata(store, conv.id)
        assert meta.get("extraction_attempts") == 1
        assert meta.get("extracted") is not True

    def test_attempts_accumulate_across_runs(self, conversation_service, store, mocker):
        mocker.patch("memory.services.conversation.EXTRACTION_MAX_ATTEMPTS", 5)
        mocker.patch(
            "memory.services.conversation.extract_memories",
            side_effect=RuntimeError("provider down"),
        )
        conv = _eligible_conversation(conversation_service)

        for _ in range(2):
            with pytest.raises(RuntimeError):
                conversation_service.extract_conversation(conv.id)

        meta = _metadata(store, conv.id)
        assert meta.get("extraction_attempts") == 2
        assert meta.get("extraction_quarantined") is not True


class TestQuarantine:
    def test_quarantines_after_max_attempts_and_drops_from_pending(
        self, conversation_service, store, mocker
    ):
        mocker.patch("memory.services.conversation.EXTRACTION_MAX_ATTEMPTS", 1)
        mocker.patch(
            "memory.services.conversation.extract_memories",
            side_effect=RuntimeError("provider down"),
        )
        conv = _eligible_conversation(conversation_service)
        conversation_service.end_conversation(conv.id, extract=False)

        assert conv.id in {c.id for c in store.get_unextracted_conversations()}

        with pytest.raises(RuntimeError):
            conversation_service.extract_conversation(conv.id)

        meta = _metadata(store, conv.id)
        assert meta.get("extraction_attempts") == 1
        assert meta.get("extraction_quarantined") is True
        assert conv.id not in {c.id for c in store.get_unextracted_conversations()}


class TestFinalizeOnFailure:
    def test_end_conversation_finalizes_and_closes_even_when_extraction_fails(
        self, conversation_service, store, mocker
    ):
        finalize = mocker.patch.object(conversation_service, "finalize_metadata_on_close")
        mocker.patch(
            "memory.services.conversation.extract_memories",
            side_effect=RuntimeError("provider down"),
        )
        conv = _eligible_conversation(conversation_service)

        with pytest.raises(RuntimeError):
            conversation_service.end_conversation(conv.id, extract=True)

        finalize.assert_called_once_with(conv.id)
        stored = store.get_conversation(conv.id)
        assert stored.ended_at is not None
        assert _metadata(store, conv.id).get("extraction_attempts") == 1
