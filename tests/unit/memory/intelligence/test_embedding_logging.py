"""CV9.E2.S18 (D-003) — embedding calls reach the llm_calls ledger, per attempt."""

from unittest.mock import MagicMock

import pytest

from memory.config import EMBEDDING_MODEL
from memory.intelligence.embeddings import EmbeddingError, generate_embedding
from memory.intelligence.llm_router import LLMResponse
from memory.services.observability import build_llm_logger

_VALID = [0.1] * 1536


def _resp(prompt_tokens):
    return MagicMock(
        data=[MagicMock(embedding=list(_VALID))],
        usage=MagicMock(prompt_tokens=prompt_tokens),
    )


def _empty():
    return MagicMock(data=[], usage=None)


def _client(mocker, *, side_effect=None, return_value=None):
    c = MagicMock()
    if side_effect is not None:
        c.embeddings.create.side_effect = side_effect
    else:
        c.embeddings.create.return_value = return_value
    mocker.patch("memory.intelligence.embeddings.get_embedding_client", return_value=c)
    mocker.patch("memory.intelligence.embeddings.OPENROUTER_API_KEY", "test-key")
    mocker.patch("memory.intelligence.embeddings.time.sleep")
    return c


class TestEmbeddingLogging:
    def test_success_logs_one_priced_bodiless_row(self, store, mocker):
        _client(mocker, return_value=_resp(5))
        generate_embedding("hello", on_llm_call=build_llm_logger(store, role="embedding"))

        rows = store.get_llm_calls(role="embedding")
        assert len(rows) == 1
        assert rows[0]["model"] == EMBEDDING_MODEL
        assert rows[0]["prompt_tokens"] == 5
        assert rows[0]["cost_usd"] is not None
        assert rows[0]["response"] == ""  # a vector is not a body

    def test_logs_one_row_per_attempt(self, store, mocker):
        _client(mocker, side_effect=[_empty(), _resp(5)])
        generate_embedding(
            "hello", attempts=3, on_llm_call=build_llm_logger(store, role="embedding")
        )

        assert len(store.get_llm_calls(role="embedding", limit=10)) == 2

    def test_failed_call_logs_unpriced_row_and_raises(self, store, mocker):
        _client(mocker, side_effect=[_empty(), _empty(), _empty()])
        with pytest.raises(EmbeddingError):
            generate_embedding(
                "hello", attempts=3, on_llm_call=build_llm_logger(store, role="embedding")
            )

        rows = store.get_llm_calls(role="embedding", limit=10)
        assert len(rows) == 3
        assert all(r["cost_usd"] is None and r["prompt_tokens"] is None for r in rows)

    def test_empty_input_logs_nothing(self, store, mocker):
        _client(mocker, return_value=_resp(5))
        with pytest.raises(EmbeddingError):
            generate_embedding("  ", on_llm_call=build_llm_logger(store, role="embedding"))

        assert store.get_llm_calls(role="embedding") == []

    def test_logging_failure_does_not_break_embedding(self, store, mocker):
        _client(mocker, return_value=_resp(5))
        mocker.patch.object(store, "log_llm_call", side_effect=RuntimeError("ledger down"))
        vec = generate_embedding("hello", on_llm_call=build_llm_logger(store, role="embedding"))
        assert vec.shape == (1536,)  # fail-soft: vector still returned

    def test_no_callback_logs_nothing(self, store, mocker):
        _client(mocker, return_value=_resp(5))
        generate_embedding("hello")
        assert store.get_llm_calls(role="embedding") == []

    def test_curation_role_is_separable(self, store, mocker):
        _client(mocker, return_value=_resp(5))
        generate_embedding("hello", on_llm_call=build_llm_logger(store, role="embedding:curation"))
        assert len(store.get_llm_calls(role="embedding:curation")) == 1

    def test_commit_false_defers_persistence(self, store):
        cb = build_llm_logger(store, role="embedding", commit=False)
        cb(LLMResponse(model=EMBEDDING_MODEL, content="", prompt_tokens=5, prompt="x"))
        store.conn.rollback()  # uncommitted row is discarded
        assert store.get_llm_calls(role="embedding") == []

    def test_commit_true_survives_rollback(self, store):
        cb = build_llm_logger(store, role="embedding", commit=True)
        cb(LLMResponse(model=EMBEDDING_MODEL, content="", prompt_tokens=5, prompt="x"))
        store.conn.rollback()  # already committed
        assert len(store.get_llm_calls(role="embedding")) == 1

    def test_llm_calls_indexes_exist(self, store):
        names = {
            r[0]
            for r in store.conn.execute(
                "SELECT name FROM sqlite_master WHERE type='index'"
            ).fetchall()
        }
        assert "idx_llm_calls_role" in names
        assert "idx_llm_calls_called_at" in names
