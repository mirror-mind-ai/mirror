"""Testes unitários para memory.intelligence.llm_router."""

import json
from unittest.mock import MagicMock

import pytest

from memory.intelligence.llm_router import (
    CreditInfo,
    LLMResponse,
    fetch_generation_cost,
    get_credits,
    resolve_model,
    send_to_model,
)

pytestmark = pytest.mark.unit


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def api_key_set(mocker):
    mocker.patch("memory.intelligence.llm_router.OPENROUTER_API_KEY", "test-key")


@pytest.fixture
def mock_openai_client(mocker, api_key_set):
    mock_choice = MagicMock()
    mock_choice.message.content = "  resposta  "

    mock_completion = MagicMock()
    mock_completion.choices = [mock_choice]
    mock_completion.usage.prompt_tokens = 10
    mock_completion.usage.completion_tokens = 5
    mock_completion.id = "gen-xyz"

    mock_instance = MagicMock()
    mock_instance.chat.completions.create.return_value = mock_completion

    mocker.patch("memory.intelligence.llm_router.OpenAI", return_value=mock_instance)
    return mock_instance


def _make_urlopen(mocker, response_data: dict):
    """Helper: patch urlopen to return response_data as JSON."""
    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps(response_data).encode()
    mock_resp.__enter__ = lambda s: s
    mock_resp.__exit__ = MagicMock(return_value=False)
    return mocker.patch(
        "memory.intelligence.llm_router.urllib.request.urlopen", return_value=mock_resp
    )


# ---------------------------------------------------------------------------
# resolve_model
# ---------------------------------------------------------------------------


class TestResolveModel:
    def test_direct_model_id_passthrough(self):
        assert resolve_model("openai/gpt-4", "mid") == "openai/gpt-4"

    def test_resolves_known_family_and_tier(self):
        result = resolve_model("gemini", "lite")
        assert result == "google/gemini-2.5-flash-lite"

    def test_resolves_flagship_tier(self):
        result = resolve_model("claude", "flagship")
        assert result == "anthropic/claude-opus-4.6"

    def test_resolves_mid_tier(self):
        result = resolve_model("gemini", "mid")
        assert result == "google/gemini-2.5-flash"

    def test_case_insensitive_family(self):
        result = resolve_model("Gemini", "mid")
        assert result == resolve_model("gemini", "mid")

    def test_case_insensitive_tier(self):
        result = resolve_model("gemini", "MID")
        assert result == resolve_model("gemini", "mid")

    def test_unknown_family_raises_value_error(self):
        with pytest.raises(ValueError, match="nonexistent"):
            resolve_model("nonexistent", "mid")

    def test_unknown_family_error_lists_available(self):
        with pytest.raises(ValueError, match="gemini"):
            resolve_model("nonexistent", "mid")

    def test_unknown_tier_raises_value_error(self):
        with pytest.raises(ValueError, match="ultra"):
            resolve_model("gemini", "ultra")

    def test_unknown_tier_error_suggests_valid_tiers(self):
        with pytest.raises(ValueError, match="lite"):
            resolve_model("gemini", "ultra")


# ---------------------------------------------------------------------------
# send_to_model
# ---------------------------------------------------------------------------


class TestSendToModel:
    def test_returns_llm_response(self, mock_openai_client):
        result = send_to_model("some/model", [{"role": "user", "content": "hi"}])
        assert isinstance(result, LLMResponse)

    def test_response_content_stripped(self, mock_openai_client):
        result = send_to_model("some/model", [{"role": "user", "content": "hi"}])
        assert result.content == "resposta"

    def test_model_field_populated(self, mock_openai_client):
        result = send_to_model("some/model", [{"role": "user", "content": "hi"}])
        assert result.model == "some/model"

    def test_prompt_tokens_from_usage(self, mock_openai_client):
        result = send_to_model("some/model", [{"role": "user", "content": "hi"}])
        assert result.prompt_tokens == 10

    def test_completion_tokens_from_usage(self, mock_openai_client):
        result = send_to_model("some/model", [{"role": "user", "content": "hi"}])
        assert result.completion_tokens == 5

    def test_total_cost_is_none(self, mock_openai_client):
        result = send_to_model("some/model", [{"role": "user", "content": "hi"}])
        assert result.total_cost is None

    def test_generation_id_from_response_id(self, mock_openai_client):
        result = send_to_model("some/model", [{"role": "user", "content": "hi"}])
        assert result.generation_id == "gen-xyz"

    def test_usage_none_leaves_tokens_none(self, mocker, api_key_set):
        mock_completion = MagicMock()
        mock_completion.choices[0].message.content = "ok"
        mock_completion.usage = None
        mock_instance = MagicMock()
        mock_instance.chat.completions.create.return_value = mock_completion
        mocker.patch("memory.intelligence.llm_router.OpenAI", return_value=mock_instance)

        result = send_to_model("m", [])
        assert result.prompt_tokens is None
        assert result.completion_tokens is None

    def test_missing_api_key_raises_runtime_error(self, mocker):
        mocker.patch("memory.intelligence.llm_router.OPENROUTER_API_KEY", "")
        with pytest.raises(RuntimeError, match="OPENROUTER_API_KEY"):
            send_to_model("m", [])

    def test_passes_temperature_and_max_tokens(self, mock_openai_client):
        send_to_model("m", [], temperature=0.1, max_tokens=100)
        call_kwargs = mock_openai_client.chat.completions.create.call_args[1]
        assert call_kwargs["temperature"] == 0.1
        assert call_kwargs["max_tokens"] == 100

    def test_latency_ms_is_non_negative_integer(self, mock_openai_client):
        result = send_to_model("m", [{"role": "user", "content": "hi"}])
        assert isinstance(result.latency_ms, int)
        assert result.latency_ms >= 0

    def test_prompt_is_non_empty_string(self, mock_openai_client):
        result = send_to_model("m", [{"role": "user", "content": "hi"}])
        assert isinstance(result.prompt, str)
        assert len(result.prompt) > 0

    def test_prompt_contains_message_content(self, mock_openai_client):
        result = send_to_model("m", [{"role": "user", "content": "hello world"}])
        assert "hello world" in result.prompt


# ---------------------------------------------------------------------------
# fetch_generation_cost
# ---------------------------------------------------------------------------


class TestFetchGenerationCost:
    def test_returns_cost_on_first_attempt(self, mocker, api_key_set):
        _make_urlopen(mocker, {"data": {"total_cost": 0.003}})
        result = fetch_generation_cost("gen-1")
        assert result == pytest.approx(0.003)

    def test_returns_none_when_cost_key_missing(self, mocker, api_key_set):
        _make_urlopen(mocker, {"data": {}})
        result = fetch_generation_cost("gen-1", retries=0)
        assert result is None

    def test_retries_until_cost_available(self, mocker, api_key_set):
        mocker.patch("time.sleep")
        responses = [{"data": {}}, {"data": {}}, {"data": {"total_cost": 0.005}}]
        call_count = 0

        def fake_urlopen(req, **kwargs):
            nonlocal call_count
            resp = MagicMock()
            resp.read.return_value = json.dumps(responses[call_count]).encode()
            resp.__enter__ = lambda s: s
            resp.__exit__ = MagicMock(return_value=False)
            call_count += 1
            return resp

        mocker.patch(
            "memory.intelligence.llm_router.urllib.request.urlopen", side_effect=fake_urlopen
        )
        result = fetch_generation_cost("gen-1", retries=2)
        assert result == pytest.approx(0.005)

    def test_returns_none_after_all_retries_fail(self, mocker, api_key_set):
        mocker.patch("time.sleep")
        _make_urlopen(mocker, {"data": {}})
        result = fetch_generation_cost("gen-1", retries=2)
        assert result is None

    def test_sleep_called_with_backoff(self, mocker, api_key_set):
        mock_sleep = mocker.patch("time.sleep")
        _make_urlopen(mocker, {"data": {}})
        fetch_generation_cost("gen-1", retries=2)
        sleep_args = [call.args[0] for call in mock_sleep.call_args_list]
        assert sleep_args == [1, 2]

    def test_exception_during_request_is_swallowed(self, mocker, api_key_set):
        mocker.patch("time.sleep")
        mocker.patch(
            "memory.intelligence.llm_router.urllib.request.urlopen",
            side_effect=Exception("network error"),
        )
        result = fetch_generation_cost("gen-1", retries=1)
        assert result is None

    def test_cost_cast_to_float(self, mocker, api_key_set):
        _make_urlopen(mocker, {"data": {"total_cost": 5}})
        result = fetch_generation_cost("gen-1")
        assert result == 5.0
        assert isinstance(result, float)

    def test_uses_certifi_ssl_context(self, mocker, api_key_set):
        mock_urlopen = _make_urlopen(mocker, {"data": {"total_cost": 0.003}})
        mock_context = mocker.patch("memory.intelligence.llm_router._openrouter_ssl_context")

        fetch_generation_cost("gen-1")

        assert mock_urlopen.call_args.kwargs["context"] == mock_context.return_value


# ---------------------------------------------------------------------------
# get_credits
# ---------------------------------------------------------------------------


class TestGetCredits:
    def test_returns_credit_info(self, mocker, api_key_set):
        _make_urlopen(mocker, {"data": {"total_credits": 10.0, "total_usage": 3.0}})
        result = get_credits()
        assert isinstance(result, CreditInfo)

    def test_balance_computed_as_total_minus_usage(self, mocker, api_key_set):
        _make_urlopen(mocker, {"data": {"total_credits": 10.0, "total_usage": 3.0}})
        result = get_credits()
        assert result.balance == pytest.approx(7.0)
        assert result.balance == result.total_credits - result.total_usage

    def test_missing_api_key_raises_runtime_error(self, mocker):
        mocker.patch("memory.intelligence.llm_router.OPENROUTER_API_KEY", "")
        with pytest.raises(RuntimeError, match="OPENROUTER_API_KEY"):
            get_credits()

    def test_authorization_header_sent(self, mocker, api_key_set):
        _make_urlopen(mocker, {"data": {"total_credits": 5.0, "total_usage": 1.0}})
        mock_request = mocker.patch("memory.intelligence.llm_router.urllib.request.Request")
        mock_request.return_value = MagicMock()
        try:
            get_credits()
        except Exception:
            pass
        call_kwargs = mock_request.call_args[1]
        headers = call_kwargs.get("headers", {})
        assert headers.get("Authorization") == "Bearer test-key"

    def test_uses_certifi_ssl_context(self, mocker, api_key_set):
        mock_urlopen = _make_urlopen(mocker, {"data": {"total_credits": 5.0, "total_usage": 1.0}})
        mock_context = mocker.patch("memory.intelligence.llm_router._openrouter_ssl_context")

        get_credits()

        assert mock_urlopen.call_args.kwargs["context"] == mock_context.return_value
