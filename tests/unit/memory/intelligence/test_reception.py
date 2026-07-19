"""Unit tests for memory.intelligence.reception."""

from unittest.mock import MagicMock

import pytest

from memory.config import LLM_TIMEOUT_RECEPTION
from memory.intelligence.llm_router import LLMResponse
from memory.intelligence.reception import reception
from memory.models import ReceptionResult

pytestmark = pytest.mark.unit

_PERSONAS = [
    {"slug": "engineer", "description": "software engineer", "routing_keywords": ["code", "bug"]},
    {
        "slug": "writer",
        "description": "writing and articles",
        "routing_keywords": ["write", "article"],
    },
]
_JOURNEYS = [
    {"slug": "mirror", "description": "Mirror Mind development"},
]


def _make_mock(mocker, content: str) -> MagicMock:
    """Patch reception.send_to_model to return content."""
    mock_response = LLMResponse(
        model="google/gemini-2.5-flash-lite",
        content=content,
        prompt_tokens=50,
        completion_tokens=20,
        latency_ms=200,
        prompt="[mocked]",
    )
    return mocker.patch(
        "memory.intelligence.reception.send_to_model",
        return_value=mock_response,
    )


class TestReceptionTimeout:
    def test_passes_reception_timeout_to_send_to_model(self, mocker):
        mock = _make_mock(
            mocker,
            '{"personas": [], "journey": null, "touches_identity": false, "touches_shadow": false}',
        )
        reception("hello", _PERSONAS, _JOURNEYS)
        assert mock.call_args.kwargs["timeout"] == LLM_TIMEOUT_RECEPTION


class TestReceptionHappyPath:
    def test_returns_reception_result(self, mocker):
        _make_mock(
            mocker,
            '{"personas": ["engineer"], "journey": null, "touches_identity": false, "touches_shadow": false}',
        )
        result = reception("fix my bug", _PERSONAS, _JOURNEYS)
        assert isinstance(result, ReceptionResult)

    def test_personas_populated(self, mocker):
        _make_mock(
            mocker,
            '{"personas": ["engineer"], "journey": null, "touches_identity": false, "touches_shadow": false}',
        )
        result = reception("fix my bug", _PERSONAS, _JOURNEYS)
        assert result.personas == ["engineer"]

    def test_journey_populated(self, mocker):
        _make_mock(
            mocker,
            '{"personas": [], "journey": "mirror", "touches_identity": false, "touches_shadow": false}',
        )
        result = reception("work on the mirror codebase", _PERSONAS, _JOURNEYS)
        assert result.journey == "mirror"

    def test_touches_identity_true(self, mocker):
        _make_mock(
            mocker,
            '{"personas": [], "journey": null, "touches_identity": true, "touches_shadow": false}',
        )
        result = reception("what do I really value in life", _PERSONAS, _JOURNEYS)
        assert result.touches_identity is True

    def test_touches_shadow_true(self, mocker):
        _make_mock(
            mocker,
            '{"personas": [], "journey": null, "touches_identity": false, "touches_shadow": true}',
        )
        result = reception("I keep avoiding this conversation", _PERSONAS, _JOURNEYS)
        assert result.touches_shadow is True

    def test_touches_identity_false_by_default(self, mocker):
        _make_mock(
            mocker,
            '{"personas": ["engineer"], "journey": null, "touches_identity": false, "touches_shadow": false}',
        )
        result = reception("fix my code", _PERSONAS, _JOURNEYS)
        assert result.touches_identity is False

    def test_touches_shadow_false_by_default(self, mocker):
        _make_mock(
            mocker,
            '{"personas": [], "journey": null, "touches_identity": false, "touches_shadow": false}',
        )
        result = reception("how are you", _PERSONAS, _JOURNEYS)
        assert result.touches_shadow is False

    def test_empty_personas_list(self, mocker):
        _make_mock(
            mocker,
            '{"personas": [], "journey": null, "touches_identity": false, "touches_shadow": false}',
        )
        result = reception("what is freedom", _PERSONAS, _JOURNEYS)
        assert result.personas == []

    def test_null_journey(self, mocker):
        _make_mock(
            mocker,
            '{"personas": ["writer"], "journey": null, "touches_identity": false, "touches_shadow": false}',
        )
        result = reception("write an article", _PERSONAS, _JOURNEYS)
        assert result.journey is None

    def test_multiple_personas_preserved_in_order(self, mocker):
        _make_mock(
            mocker,
            '{"personas": ["engineer", "writer"], "journey": null, "touches_identity": false, "touches_shadow": false}',
        )
        result = reception("write code docs", _PERSONAS, _JOURNEYS)
        assert result.personas == ["engineer", "writer"]

    def test_markdown_fenced_json_cleaned(self, mocker):
        raw = '```json\n{"personas": ["writer"], "journey": null, "touches_identity": false, "touches_shadow": false}\n```'
        _make_mock(mocker, raw)
        result = reception("write an article", _PERSONAS, _JOURNEYS)
        assert result.personas == ["writer"]

    def test_prompt_contains_reception_prompt_text(self, mocker):
        mock_send = _make_mock(
            mocker,
            '{"personas": [], "journey": null, "touches_identity": false, "touches_shadow": false}',
        )
        reception("test query", _PERSONAS, _JOURNEYS)
        messages_arg = mock_send.call_args[0][1]
        prompt_content = messages_arg[0]["content"]
        assert "test query" in prompt_content
        assert "engineer" in prompt_content  # persona slug in prompt

    def test_on_llm_call_invoked(self, mocker):
        _make_mock(
            mocker,
            '{"personas": [], "journey": null, "touches_identity": false, "touches_shadow": false}',
        )
        callback = MagicMock()
        reception("query", _PERSONAS, _JOURNEYS, on_llm_call=callback)
        callback.assert_called_once()
        assert isinstance(callback.call_args[0][0], LLMResponse)

    def test_on_llm_call_not_invoked_when_none(self, mocker):
        _make_mock(
            mocker,
            '{"personas": [], "journey": null, "touches_identity": false, "touches_shadow": false}',
        )
        result = reception("query", _PERSONAS, _JOURNEYS, on_llm_call=None)
        assert isinstance(result, ReceptionResult)


class TestReceptionFallback:
    def test_malformed_json_returns_empty(self, mocker):
        _make_mock(mocker, "not valid json at all")
        result = reception("query", _PERSONAS, _JOURNEYS)
        assert result == ReceptionResult.empty()

    def test_non_dict_json_returns_empty(self, mocker):
        _make_mock(mocker, '["engineer"]')
        result = reception("query", _PERSONAS, _JOURNEYS)
        assert result == ReceptionResult.empty()

    def test_llm_exception_returns_empty(self, mocker):
        mocker.patch(
            "memory.intelligence.reception.send_to_model",
            side_effect=RuntimeError("API error"),
        )
        result = reception("query", _PERSONAS, _JOURNEYS)
        assert result == ReceptionResult.empty()

    def test_empty_query_returns_empty_without_llm_call(self, mocker):
        mock_send = mocker.patch("memory.intelligence.reception.send_to_model")
        result = reception("   ", _PERSONAS, _JOURNEYS)
        assert result == ReceptionResult.empty()
        mock_send.assert_not_called()

    def test_non_list_personas_field_coerced_to_empty(self, mocker):
        _make_mock(
            mocker,
            '{"personas": "engineer", "journey": null, "touches_identity": false, "touches_shadow": false}',
        )
        result = reception("query", _PERSONAS, _JOURNEYS)
        assert result.personas == []

    def test_non_string_journey_coerced_to_none(self, mocker):
        _make_mock(
            mocker,
            '{"personas": [], "journey": 42, "touches_identity": false, "touches_shadow": false}',
        )
        result = reception("query", _PERSONAS, _JOURNEYS)
        assert result.journey is None

    def test_on_llm_call_not_invoked_on_empty_query(self, mocker):
        mocker.patch("memory.intelligence.reception.send_to_model")
        callback = MagicMock()
        reception("", _PERSONAS, _JOURNEYS, on_llm_call=callback)
        callback.assert_not_called()

    def test_on_llm_call_not_invoked_on_llm_exception(self, mocker):
        mocker.patch(
            "memory.intelligence.reception.send_to_model",
            side_effect=RuntimeError("API error"),
        )
        callback = MagicMock()
        reception("query", _PERSONAS, _JOURNEYS, on_llm_call=callback)
        callback.assert_not_called()


class TestReceptionResultEmpty:
    def test_empty_has_correct_defaults(self):
        result = ReceptionResult.empty()
        assert result.personas == []
        assert result.journey is None
        assert result.touches_identity is False
        assert result.touches_shadow is False

    def test_empty_equals_empty(self):
        assert ReceptionResult.empty() == ReceptionResult.empty()
