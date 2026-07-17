"""Unit tests for the shared fail-soft LLM logger seam (AI-09 / CV9.E2.S13)."""

from unittest.mock import MagicMock

import pytest

from memory.services.observability import build_llm_logger

pytestmark = pytest.mark.unit


def _response(**over):
    """A stand-in LLMResponse with sensible defaults, overridable per test."""
    r = MagicMock()
    r.model = over.get("model", "google/gemini-2.5-flash-lite")
    r.prompt = over.get("prompt", '[{"role":"user","content":"secret transcript"}]')
    r.content = over.get("content", "the model reply")
    r.prompt_tokens = over.get("prompt_tokens", 1000)
    r.completion_tokens = over.get("completion_tokens", 500)
    r.latency_ms = over.get("latency_ms", 420)
    return r


@pytest.fixture
def metadata_mode(mocker):
    """Pin metadata mode regardless of ambient MEMORY_LOG_LLM_CALLS."""
    mocker.patch("memory.services.observability.LOG_LLM_CALLS", True)
    mocker.patch("memory.services.observability.LOG_LLM_BODIES", False)


class TestMetadataMode:
    def test_returns_a_callable(self, metadata_mode):
        assert callable(build_llm_logger(MagicMock(), role="extraction"))

    def test_writes_metadata_without_bodies(self, metadata_mode):
        store = MagicMock()
        log = build_llm_logger(
            store, role="extraction", conversation_id="conv-1", session_id="sess-1"
        )
        log(_response())
        kwargs = store.log_llm_call.call_args.kwargs
        assert kwargs["role"] == "extraction"
        assert kwargs["model"] == "google/gemini-2.5-flash-lite"
        assert kwargs["prompt"] == ""  # body withheld in metadata mode
        assert kwargs["response_text"] == ""  # body withheld in metadata mode
        assert kwargs["prompt_tokens"] == 1000
        assert kwargs["completion_tokens"] == 500
        assert kwargs["latency_ms"] == 420
        assert kwargs["conversation_id"] == "conv-1"
        assert kwargs["session_id"] == "sess-1"

    def test_populates_cost_from_authority(self, metadata_mode):
        from memory.intelligence.cost import compute_cost

        store = MagicMock()
        build_llm_logger(store, role="extraction")(
            _response(prompt_tokens=1000, completion_tokens=1000)
        )
        expected = compute_cost("google/gemini-2.5-flash-lite", 1000, 1000)
        assert store.log_llm_call.call_args.kwargs["cost_usd"] == pytest.approx(expected)

    def test_never_writes_body_even_when_model_returns_content(self, metadata_mode):
        """Privacy regression guard — content must never leak in metadata mode."""
        store = MagicMock()
        build_llm_logger(store, role="reception")(
            _response(prompt="sensitive", content="also sensitive")
        )
        kwargs = store.log_llm_call.call_args.kwargs
        assert "sensitive" not in kwargs["prompt"]
        assert "sensitive" not in kwargs["response_text"]


class TestFullMode:
    def test_full_mode_includes_bodies(self, mocker):
        mocker.patch("memory.services.observability.LOG_LLM_CALLS", True)
        mocker.patch("memory.services.observability.LOG_LLM_BODIES", True)
        store = MagicMock()
        build_llm_logger(store, role="extraction")(
            _response(prompt="the prompt", content="the reply")
        )
        kwargs = store.log_llm_call.call_args.kwargs
        assert kwargs["prompt"] == "the prompt"
        assert kwargs["response_text"] == "the reply"


class TestOffMode:
    def test_off_mode_returns_none(self, mocker):
        mocker.patch("memory.services.observability.LOG_LLM_CALLS", False)
        assert build_llm_logger(MagicMock(), role="extraction") is None


class TestFailSoft:
    def test_store_error_does_not_propagate(self, metadata_mode):
        store = MagicMock()
        store.log_llm_call.side_effect = RuntimeError("db is gone")
        # Must not raise — since S7 a raising callback would quarantine the conversation.
        build_llm_logger(store, role="extraction")(_response())

    def test_cost_error_does_not_propagate(self, metadata_mode, mocker):
        mocker.patch("memory.services.observability.compute_cost", side_effect=ValueError("boom"))
        store = MagicMock()
        build_llm_logger(store, role="extraction")(_response())  # must not raise
        store.log_llm_call.assert_not_called()
