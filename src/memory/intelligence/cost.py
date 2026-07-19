"""The one cost authority for model-in-the-loop spend (AI-09 / CV9.E2.S13).

Token counts arrive with every LLM response; prices are a static table; cost is
a pure function of the two. Keeping this in one place is deliberate — scattering
cost math across call sites is the failure the audit's consult FX constant warns
about.

Prices are **estimated** published list prices (USD per 1K tokens) for the
pinned models, and drift over time. Update this table whenever the model pins
change (see AI-06 / CV9.E2.S12). An unknown model yields ``None`` — never a
silent ``0`` — so unpriced spend stays visibly unpriced rather than looking free.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ModelPrice:
    """USD per 1K tokens for a model's prompt and completion sides."""

    prompt_per_1k: float
    completion_per_1k: float


# Estimated OpenRouter list prices (USD / 1K tokens). Verify on every pin change.
MODEL_PRICES: dict[str, ModelPrice] = {
    # Extraction pin — google/gemini-2.5-flash-lite: ~$0.10/M in, ~$0.40/M out.
    "google/gemini-2.5-flash-lite": ModelPrice(prompt_per_1k=0.0001, completion_per_1k=0.0004),
    # Embedding pin — openai/text-embedding-3-small: ~$0.02/M, no completion side.
    "openai/text-embedding-3-small": ModelPrice(prompt_per_1k=0.00002, completion_per_1k=0.0),
}


def compute_cost(
    model: str,
    prompt_tokens: int | None,
    completion_tokens: int | None,
) -> float | None:
    """Estimate the USD cost of one call from its model and token usage.

    Returns ``None`` when the model is not in the price table or when prompt
    usage is missing — both cases mean the cost is genuinely unknown, and a
    ``None`` keeps it out of any sum rather than understating spend as ``0``.
    Missing completion tokens are treated as zero completion (some providers
    omit the field on empty completions).
    """
    price = MODEL_PRICES.get(model)
    if price is None or prompt_tokens is None:
        return None
    completion = completion_tokens or 0
    return (prompt_tokens / 1000) * price.prompt_per_1k + (
        completion / 1000
    ) * price.completion_per_1k
