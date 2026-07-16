"""Tests for embedding generation and serialisation."""

from unittest.mock import MagicMock, patch

import numpy as np

from memory.config import LLM_MAX_RETRIES, LLM_TIMEOUT_EMBEDDING, OPENROUTER_BASE_URL
from memory.intelligence.embeddings import (
    bytes_to_embedding,
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
