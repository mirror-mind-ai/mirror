"""Pipeline wiring for the metadata-default logger seam (AI-09 / CV9.E2.S13).

Drives a real extraction run with a mocked model call and asserts the service
wires the seam so a metadata-only ``llm_calls`` row lands — estimated cost
present, conversation content withheld.
"""

import pytest

from memory.intelligence.llm_router import LLMResponse

pytestmark = pytest.mark.unit


def _eligible_conversation(conversation_service):
    conv = conversation_service.start_conversation(interface="cli", journey="mirror")
    for i in range(4):
        conversation_service.add_message(conv.id, role="user", content=f"decision {i}")
    return conv


def _model_response() -> LLMResponse:
    # Empty JSON so extraction stores nothing, but usage is present so cost computes.
    return LLMResponse(
        model="google/gemini-2.5-flash-lite",
        content="[]",
        prompt="SENSITIVE TRANSCRIPT CONTENT",
        prompt_tokens=1000,
        completion_tokens=200,
        latency_ms=42,
    )


@pytest.fixture
def metadata_mode(mocker):
    """Pin metadata mode regardless of the ambient MEMORY_LOG_LLM_CALLS."""
    mocker.patch("memory.services.observability.LOG_LLM_CALLS", True)
    mocker.patch("memory.services.observability.LOG_LLM_BODIES", False)


class TestExtractionObservability:
    def test_extraction_logs_metadata_only_row_with_cost(
        self, conversation_service, store, mocker, mock_conversation_embedding, metadata_mode
    ):
        mocker.patch("memory.intelligence.extraction.send_to_model", return_value=_model_response())
        conv = _eligible_conversation(conversation_service)

        conversation_service.extract_conversation(conv.id)

        rows = store.get_llm_calls(conversation_id=conv.id)
        assert rows, "metadata default should log at least one call per extraction"
        for row in rows:
            assert row["prompt"] == ""  # body withheld in metadata mode
            assert row["response"] == ""  # body withheld in metadata mode
            assert "SENSITIVE" not in (row["prompt"] or "")  # privacy regression guard
            assert row["prompt_tokens"] == 1000
            assert row["cost_usd"] is not None  # estimated cost recorded

    def test_off_mode_logs_nothing(
        self, conversation_service, store, mocker, mock_conversation_embedding
    ):
        mocker.patch("memory.services.observability.LOG_LLM_CALLS", False)
        mocker.patch("memory.intelligence.extraction.send_to_model", return_value=_model_response())
        conv = _eligible_conversation(conversation_service)

        conversation_service.extract_conversation(conv.id)

        assert store.get_llm_calls(conversation_id=conv.id) == []
