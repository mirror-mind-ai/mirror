"""Wrapper for generating embeddings through OpenRouter."""

import json
import time
from collections.abc import Callable

import numpy as np
from openai import OpenAI

from memory.config import (
    EMBEDDING_ATTEMPTS,
    EMBEDDING_DIMENSIONS,
    EMBEDDING_MODEL,
    EMBEDDING_RETRY_BACKOFF,
    LLM_MAX_RETRIES,
    LLM_TIMEOUT_EMBEDDING,
    OPENROUTER_API_KEY,
    OPENROUTER_BASE_URL,
)
from memory.intelligence.llm_router import LLMResponse


class EmbeddingError(RuntimeError):
    """Raised when embedding generation fails after validation and bounded retry.

    ``permanent`` marks a deterministic failure that retrying cannot fix — empty
    input or a dimension mismatch — so the retry loop stops immediately instead
    of thrashing (and, for empty input, before spending on a doomed call).
    Transient failures (a valid request that returns an empty payload) leave
    ``permanent`` false and are retried within budget.
    """

    def __init__(self, message: str, *, permanent: bool = False) -> None:
        super().__init__(message)
        self.permanent = permanent


def get_embedding_client() -> OpenAI:
    return OpenAI(
        api_key=OPENROUTER_API_KEY,
        base_url=OPENROUTER_BASE_URL,
        timeout=LLM_TIMEOUT_EMBEDDING,
        max_retries=LLM_MAX_RETRIES,
    )


def _extract_embedding(response: object) -> np.ndarray:
    """Validate a provider response and return a float32 vector.

    Empty ``data`` or an empty payload is a *transient* failure: the request was
    well-formed but came back empty, so the caller retries. A wrong dimension is
    *permanent* — almost always a ``MEMORY_EMBEDDING_MODEL`` override to a model
    whose vectors cannot live in this corpus — so it fails fast and loudly rather
    than being retried or silently stored (AI-07 shape guard). This checks vector
    *shape*, not vector *space*: a silent provider re-route to a different
    1536-dim space is invisible here and needs embedding provenance (AI-07).
    """
    data = getattr(response, "data", None)
    if not data:
        raise EmbeddingError("No embedding data received")
    payload = data[0].embedding
    if payload is None or len(payload) == 0:
        raise EmbeddingError("Empty embedding payload received")
    if len(payload) != EMBEDDING_DIMENSIONS:
        raise EmbeddingError(
            f"Embedding dimension mismatch: expected {EMBEDDING_DIMENSIONS}, "
            f"got {len(payload)}. Check MEMORY_EMBEDDING_MODEL — a model whose "
            f"vectors are not {EMBEDDING_DIMENSIONS}-dim cannot be stored in this corpus.",
            permanent=True,
        )
    return np.array(payload, dtype=np.float32)


def _log_embedding_call(
    on_llm_call: Callable[[LLMResponse], None] | None,
    response: object,
    text: str,
    t0: float,
) -> None:
    """Emit one ledger callback per embedding API round-trip (D-003 / CV9.E2.S18).

    Logged per attempt so retries and failures — real, billable spend — are not
    undercounted. A failed round-trip has no usage, so it lands as an unpriced
    row (``prompt_tokens=None`` → ``cost_usd`` NULL) rather than vanishing. The
    response body is always empty: a vector is not text.
    """
    if on_llm_call is None:
        return
    prompt_tokens = None
    usage = getattr(response, "usage", None) if response is not None else None
    if usage is not None:
        raw = getattr(usage, "prompt_tokens", None)
        prompt_tokens = raw if isinstance(raw, int) else None
    on_llm_call(
        LLMResponse(
            model=EMBEDDING_MODEL,
            content="",
            prompt_tokens=prompt_tokens,
            completion_tokens=None,
            latency_ms=int((time.perf_counter() - t0) * 1000),
            prompt=text,
        )
    )


def generate_embedding(
    text: str,
    *,
    attempts: int = EMBEDDING_ATTEMPTS,
    on_llm_call: Callable[[LLMResponse], None] | None = None,
) -> np.ndarray:
    """Generate an embedding for ``text`` via OpenRouter, with bounded retry.

    Failure taxonomy:

    * missing key -> ``RuntimeError`` (mirrors ``send_to_model``);
    * empty/whitespace input -> permanent ``EmbeddingError``, no network call;
    * empty ``data``/payload -> transient, retried up to ``attempts`` times;
    * dimension mismatch -> permanent ``EmbeddingError``, no retry;
    * provider/SDK exception -> wrapped in ``EmbeddingError``. The SDK client
      already applies its own ``max_retries`` for transient transport failures,
      so this layer does not re-retry a raised provider error.

    No fake or zero vector is ever returned: every path either yields a validated
    embedding or raises.
    """
    if not OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY is not configured.")
    if not text or not text.strip():
        raise EmbeddingError("Cannot embed empty text.", permanent=True)

    client = get_embedding_client()
    last_error: EmbeddingError | None = None
    for attempt in range(1, attempts + 1):
        response = None
        t0 = time.perf_counter()
        try:
            response = client.embeddings.create(input=text, model=EMBEDDING_MODEL)
            vector = _extract_embedding(response)
        except EmbeddingError as exc:
            _log_embedding_call(on_llm_call, response, text, t0)  # response came back invalid
            if exc.permanent:
                raise
            last_error = exc  # empty response — retry within budget
        except Exception as exc:
            # The SDK already retried transient transport failures; a raised
            # provider error here is terminal for this call. Re-type it so
            # callers catch one embedding failure contract.
            _log_embedding_call(on_llm_call, None, text, t0)  # no response — unpriced
            raise EmbeddingError(f"Embedding provider call failed: {exc}") from exc
        else:
            _log_embedding_call(on_llm_call, response, text, t0)
            return vector
        if attempt < attempts:
            time.sleep(EMBEDDING_RETRY_BACKOFF * attempt)

    raise EmbeddingError(
        f"No embedding generated after {attempts} attempts: {last_error}"
    ) from last_error


def embedding_to_bytes(embedding: np.ndarray) -> bytes:
    """Convert a numpy array to bytes for SQLite storage."""
    return embedding.astype(np.float32).tobytes()


def bytes_to_embedding(data: bytes) -> np.ndarray:
    """Convert SQLite bytes back to a numpy array."""
    return np.frombuffer(data, dtype=np.float32)


def embedding_provenance() -> dict[str, object]:
    """Provenance for a vector produced by the currently configured embedding pin."""
    return {"embedding_model": EMBEDDING_MODEL, "embedding_dimensions": EMBEDDING_DIMENSIONS}


def add_embedding_provenance(metadata: str | None) -> str:
    """Merge current embedding provenance into a metadata JSON string.

    Foreign keys are preserved; the provenance keys are authoritative for this
    write (a re-embed must be able to overwrite a stale model). Never raises on
    malformed or non-object existing metadata — it falls back to a fresh object,
    so a bad metadata value can never fail a memory/attachment write (the boundary
    CV9.E2.S1 made crash-safe). Records the *configured* model, which equals the
    generation model unless the pin is hot-swapped mid-process.
    """
    base: dict[str, object] = {}
    if metadata:
        try:
            parsed = json.loads(metadata)
            if isinstance(parsed, dict):
                base = parsed
        except (json.JSONDecodeError, TypeError):
            base = {}
    base.update(embedding_provenance())
    return json.dumps(base)
