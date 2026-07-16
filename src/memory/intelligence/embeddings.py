"""Wrapper for generating embeddings through OpenRouter."""

import numpy as np
from openai import OpenAI

from memory.config import (
    EMBEDDING_MODEL,
    LLM_MAX_RETRIES,
    LLM_TIMEOUT_EMBEDDING,
    OPENROUTER_API_KEY,
    OPENROUTER_BASE_URL,
)


def get_embedding_client() -> OpenAI:
    return OpenAI(
        api_key=OPENROUTER_API_KEY,
        base_url=OPENROUTER_BASE_URL,
        timeout=LLM_TIMEOUT_EMBEDDING,
        max_retries=LLM_MAX_RETRIES,
    )


def generate_embedding(text: str) -> np.ndarray:
    """Generate an embedding for text using OpenAI text-embedding-3-small via OpenRouter.

    Raises ``RuntimeError`` on a missing key (mirrors ``send_to_model``) so callers
    fail clearly and fast instead of hitting an opaque 401 after retries.
    """
    if not OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY is not configured.")
    client = get_embedding_client()
    response = client.embeddings.create(
        input=text,
        model=EMBEDDING_MODEL,
    )
    return np.array(response.data[0].embedding, dtype=np.float32)


def embedding_to_bytes(embedding: np.ndarray) -> bytes:
    """Convert a numpy array to bytes for SQLite storage."""
    return embedding.astype(np.float32).tobytes()


def bytes_to_embedding(data: bytes) -> np.ndarray:
    """Convert SQLite bytes back to a numpy array."""
    return np.frombuffer(data, dtype=np.float32)
