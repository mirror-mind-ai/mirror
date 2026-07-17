"""CV9.E2.S16 (AI-10) — extraction status is recorded in conversation metadata."""

import json

import pytest

from memory.intelligence.llm_router import LLMResponse

pytestmark = pytest.mark.unit

_MEMORY_JSON = '[{"title":"T","content":"C","memory_type":"insight","layer":"ego","tags":[]}]'


def _eligible(conversation_service):
    conv = conversation_service.start_conversation(interface="cli", journey="mirror")
    for i in range(4):
        conversation_service.add_message(conv.id, role="user", content=f"decision {i}")
    return conv


def _response(content: str) -> LLMResponse:
    return LLMResponse(
        model="google/gemini-2.5-flash-lite",
        content=content,
        prompt_tokens=10,
        completion_tokens=5,
        latency_ms=20,
        prompt="[p]",
    )


def _meta(store, conv_id: str) -> dict:
    return json.loads(store.get_conversation(conv_id).metadata or "{}")


class TestExtractionStatusMetadata:
    def test_ok_status(self, conversation_service, store, mocker, mock_conversation_embedding):
        mocker.patch(
            "memory.intelligence.extraction.send_to_model", return_value=_response(_MEMORY_JSON)
        )
        conv = _eligible(conversation_service)
        conversation_service.extract_conversation(conv.id)
        assert _meta(store, conv.id)["extraction_status"] == "ok"

    def test_no_signal_status(
        self, conversation_service, store, mocker, mock_conversation_embedding
    ):
        mocker.patch("memory.intelligence.extraction.send_to_model", return_value=_response("[]"))
        conv = _eligible(conversation_service)
        conversation_service.extract_conversation(conv.id)
        assert _meta(store, conv.id)["extraction_status"] == "no_signal"

    def test_parse_failed_status(
        self, conversation_service, store, mocker, mock_conversation_embedding
    ):
        mocker.patch(
            "memory.intelligence.extraction.send_to_model",
            return_value=_response("not json at all"),
        )
        conv = _eligible(conversation_service)
        conversation_service.extract_conversation(conv.id)
        assert _meta(store, conv.id)["extraction_status"] == "parse_failed"

    def test_dropped_counts_recorded(
        self, conversation_service, store, mocker, mock_conversation_embedding
    ):
        bad = '[{"title":"T","content":"C","memory_type":"insight","layer":"banana","tags":[]}]'
        mocker.patch("memory.intelligence.extraction.send_to_model", return_value=_response(bad))
        conv = _eligible(conversation_service)
        conversation_service.extract_conversation(conv.id)
        meta = _meta(store, conv.id)
        assert meta["extraction_status"] == "no_signal"
        assert meta["extraction_dropped"]["invalid_layer"] == 1

    def test_llm_failed_status_and_still_raises(self, conversation_service, store, mocker):
        mocker.patch(
            "memory.intelligence.extraction.send_to_model",
            side_effect=RuntimeError("provider down"),
        )
        conv = _eligible(conversation_service)
        with pytest.raises(RuntimeError):
            conversation_service.extract_conversation(conv.id)
        meta = _meta(store, conv.id)
        assert meta["extraction_status"] == "llm_failed"
        assert meta["extraction_attempts"] == 1

    def test_retry_after_failure_overwrites_with_ok(
        self, conversation_service, store, mocker, mock_conversation_embedding
    ):
        calls = {"n": 0}

        def _send(*args, **kwargs):
            calls["n"] += 1
            if calls["n"] == 1:
                raise RuntimeError("provider down")
            return _response(_MEMORY_JSON)

        mocker.patch("memory.intelligence.extraction.send_to_model", side_effect=_send)
        conv = _eligible(conversation_service)

        with pytest.raises(RuntimeError):
            conversation_service.extract_conversation(conv.id)
        assert _meta(store, conv.id)["extraction_status"] == "llm_failed"

        conversation_service.extract_conversation(conv.id)  # retry succeeds
        assert _meta(store, conv.id)["extraction_status"] == "ok"
