"""Tests for embedding generation and serialisation."""

import json
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from memory.config import LLM_MAX_RETRIES, LLM_TIMEOUT_EMBEDDING, OPENROUTER_BASE_URL
from memory.intelligence.embeddings import (
    EmbeddingError,
    add_embedding_provenance,
    bytes_to_embedding,
    embedding_provenance,
    embedding_to_bytes,
    generate_embedding,
    get_embedding_client,
)


class TestEmbeddingRoundTrip:
    def test_roundtrip_preserves_values(self):
        original = np.array([0.1, 0.2, 0.3, 0.4, 0.5], dtype=np.float32)
        restored = bytes_to_embedding(embedding_to_bytes(original))
        np.testing.assert_array_almost_equal(original, restored)

    def test_roundtrip_full_dimension(self):
        """Test with realistic 1536-dim embedding."""
        original = np.random.rand(1536).astype(np.float32)
        restored = bytes_to_embedding(embedding_to_bytes(original))
        np.testing.assert_array_almost_equal(original, restored)

    def test_embedding_to_bytes_returns_bytes(self):
        arr = np.array([1.0, 2.0], dtype=np.float32)
        result = embedding_to_bytes(arr)
        assert isinstance(result, bytes)

    def test_bytes_to_embedding_returns_ndarray(self):
        arr = np.array([1.0, 2.0], dtype=np.float32)
        b = embedding_to_bytes(arr)
        result = bytes_to_embedding(b)
        assert isinstance(result, np.ndarray)

    def test_output_dtype_is_float32(self):
        original = np.array([1.0, 2.0, 3.0], dtype=np.float32)
        restored = bytes_to_embedding(embedding_to_bytes(original))
        assert restored.dtype == np.float32

    def test_float64_input_converted_to_float32(self):
        """embedding_to_bytes should coerce float64 → float32."""
        arr64 = np.array([1.0, 2.0, 3.0], dtype=np.float64)
        b = embedding_to_bytes(arr64)
        restored = bytes_to_embedding(b)
        assert restored.dtype == np.float32

    def test_byte_length_matches_float32_size(self):
        n = 128
        arr = np.ones(n, dtype=np.float32)
        b = embedding_to_bytes(arr)
        assert len(b) == n * 4  # 4 bytes per float32

    def test_zero_vector_roundtrip(self):
        original = np.zeros(64, dtype=np.float32)
        restored = bytes_to_embedding(embedding_to_bytes(original))
        np.testing.assert_array_equal(original, restored)

    def test_unit_vector_roundtrip(self):
        original = np.ones(64, dtype=np.float32) / np.sqrt(64)
        restored = bytes_to_embedding(embedding_to_bytes(original))
        np.testing.assert_array_almost_equal(original, restored)


class TestGetEmbeddingClient:
    def test_uses_openrouter_base_url(self):
        client = get_embedding_client()
        assert str(client.base_url).rstrip("/") == OPENROUTER_BASE_URL.rstrip("/")

    def test_uses_openrouter_api_key(self):
        with patch("memory.intelligence.embeddings.OPENROUTER_API_KEY", "test-key"):
            client = get_embedding_client()
        assert client.api_key == "test-key"

    def test_applies_embedding_timeout(self):
        client = get_embedding_client()
        assert client.timeout == LLM_TIMEOUT_EMBEDDING

    def test_applies_retry_ceiling(self):
        client = get_embedding_client()
        assert client.max_retries == LLM_MAX_RETRIES


class TestGenerateEmbedding:
    def test_calls_embeddings_create_with_correct_model(self):
        fake_vector = np.random.rand(1536).astype(np.float32)
        mock_client = MagicMock()
        mock_client.embeddings.create.return_value = MagicMock(
            data=[MagicMock(embedding=fake_vector.tolist())]
        )

        with (
            patch("memory.intelligence.embeddings.OPENROUTER_API_KEY", "test-key"),
            patch("memory.intelligence.embeddings.get_embedding_client", return_value=mock_client),
        ):
            result = generate_embedding("hello world")

        mock_client.embeddings.create.assert_called_once_with(
            input="hello world",
            model="openai/text-embedding-3-small",
        )
        assert result.shape == (1536,)
        assert result.dtype == np.float32

    def test_returns_float32_ndarray(self):
        fake_vector = [0.1] * 1536
        mock_client = MagicMock()
        mock_client.embeddings.create.return_value = MagicMock(
            data=[MagicMock(embedding=fake_vector)]
        )

        with (
            patch("memory.intelligence.embeddings.OPENROUTER_API_KEY", "test-key"),
            patch("memory.intelligence.embeddings.get_embedding_client", return_value=mock_client),
        ):
            result = generate_embedding("test")

        assert isinstance(result, np.ndarray)
        assert result.dtype == np.float32
        assert result.shape == (1536,)


# --- CV9.E2.S1 Embedding Resilience helpers ---


def _resp(embedding):
    """A provider response carrying one embedding payload."""
    return MagicMock(data=[MagicMock(embedding=embedding)])


def _empty_data():
    """A well-formed response whose data list is empty (the live-failure shape)."""
    return MagicMock(data=[])


def _mock_client(mocker, *, side_effect=None, return_value=None):
    client = MagicMock()
    if side_effect is not None:
        client.embeddings.create.side_effect = side_effect
    else:
        client.embeddings.create.return_value = return_value
    mocker.patch("memory.intelligence.embeddings.get_embedding_client", return_value=client)
    return client


@pytest.fixture(autouse=True)
def _fast_sleep(mocker):
    """No test may actually sleep during retry backoff."""
    return mocker.patch("memory.intelligence.embeddings.time.sleep")


@pytest.fixture
def _key(mocker):
    mocker.patch("memory.intelligence.embeddings.OPENROUTER_API_KEY", "test-key")


class TestEmbeddingResilience:
    """CV9.E2.S1 (AI-04 sibling) — the embedding boundary fails safely.

    Three failure classes: permanent-input (empty text, no call), transient
    (empty data/payload, retried), and permanent-config (dimension mismatch,
    fail-fast). Provider exceptions are wrapped once — the SDK already retried.
    """

    def test_empty_text_fails_permanently_without_calling_provider(self, mocker, _key):
        client = _mock_client(mocker, return_value=_resp([0.1] * 1536))
        with pytest.raises(EmbeddingError) as exc:
            generate_embedding("")
        assert exc.value.permanent is True
        client.embeddings.create.assert_not_called()

    def test_whitespace_text_fails_permanently_without_calling_provider(self, mocker, _key):
        client = _mock_client(mocker, return_value=_resp([0.1] * 1536))
        with pytest.raises(EmbeddingError):
            generate_embedding("  \n\t ")
        client.embeddings.create.assert_not_called()

    def test_empty_data_retries_then_succeeds(self, mocker, _key):
        client = _mock_client(mocker, side_effect=[_empty_data(), _resp([0.2] * 1536)])
        result = generate_embedding("hello", attempts=3)
        assert result.shape == (1536,)
        assert result.dtype == np.float32
        assert client.embeddings.create.call_count == 2

    def test_empty_payload_retries_then_succeeds(self, mocker, _key):
        client = _mock_client(mocker, side_effect=[_resp([]), _resp([0.2] * 1536)])
        result = generate_embedding("hello", attempts=3)
        assert result.shape == (1536,)
        assert client.embeddings.create.call_count == 2

    def test_retry_exhaustion_raises_after_configured_attempts(self, mocker, _key):
        client = _mock_client(mocker, side_effect=[_empty_data(), _empty_data(), _empty_data()])
        with pytest.raises(EmbeddingError) as exc:
            generate_embedding("hello", attempts=3)
        assert "3 attempts" in str(exc.value)
        assert exc.value.permanent is False
        assert client.embeddings.create.call_count == 3

    def test_dimension_mismatch_fails_fast_without_retry(self, mocker, _key):
        client = _mock_client(mocker, return_value=_resp([0.1] * 512))
        with pytest.raises(EmbeddingError) as exc:
            generate_embedding("hello", attempts=3)
        assert exc.value.permanent is True
        message = str(exc.value)
        assert "512" in message and "1536" in message
        assert client.embeddings.create.call_count == 1

    def test_provider_exception_wrapped_without_app_retry(self, mocker, _key):
        client = _mock_client(mocker, side_effect=RuntimeError("provider 500"))
        with pytest.raises(EmbeddingError) as exc:
            generate_embedding("hello", attempts=3)
        assert client.embeddings.create.call_count == 1
        assert "provider 500" in str(exc.value)

    def test_backoff_sleeps_between_transient_retries(self, mocker, _key, _fast_sleep):
        _mock_client(mocker, side_effect=[_empty_data(), _resp([0.2] * 1536)])
        generate_embedding("hello", attempts=3)
        _fast_sleep.assert_called_once()


class TestEmbeddingProvenance:
    """CV9.E2.S17 (AI-07) — provenance is recorded, and the merge never raises."""

    def test_provenance_reports_current_pin(self):
        from memory.config import EMBEDDING_DIMENSIONS, EMBEDDING_MODEL

        prov = embedding_provenance()
        assert prov["embedding_model"] == EMBEDDING_MODEL
        assert prov["embedding_dimensions"] == EMBEDDING_DIMENSIONS

    def test_from_none_adds_provenance(self):
        from memory.config import EMBEDDING_MODEL

        result = json.loads(add_embedding_provenance(None))
        assert result["embedding_model"] == EMBEDDING_MODEL

    def test_preserves_foreign_keys(self):
        result = json.loads(add_embedding_provenance('{"source": "import"}'))
        assert result["source"] == "import"
        assert "embedding_model" in result

    def test_provenance_keys_are_authoritative(self):
        from memory.config import EMBEDDING_MODEL

        result = json.loads(add_embedding_provenance('{"embedding_model": "old/model"}'))
        assert result["embedding_model"] == EMBEDDING_MODEL

    def test_malformed_or_non_object_metadata_never_raises(self):
        for bad in ("not json", "[1, 2]", "42", ""):
            result = json.loads(add_embedding_provenance(bad))
            assert "embedding_model" in result

    def test_returns_valid_json_object(self):
        assert isinstance(json.loads(add_embedding_provenance(None)), dict)
