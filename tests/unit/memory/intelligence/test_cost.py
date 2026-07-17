"""Unit tests for the LLM cost authority (AI-09 / CV9.E2.S13)."""

import pytest

from memory.intelligence.cost import MODEL_PRICES, compute_cost

pytestmark = pytest.mark.unit

EXTRACTION_MODEL = "google/gemini-2.5-flash-lite"
EMBEDDING_MODEL = "openai/text-embedding-3-small"


class TestComputeCost:
    def test_known_model_sums_prompt_and_completion(self):
        price = MODEL_PRICES[EXTRACTION_MODEL]
        # 1000 prompt + 1000 completion tokens == one unit of each per-1K rate.
        cost = compute_cost(EXTRACTION_MODEL, 1000, 1000)
        assert cost == pytest.approx(price.prompt_per_1k + price.completion_per_1k)

    def test_scales_linearly_with_tokens(self):
        price = MODEL_PRICES[EXTRACTION_MODEL]
        cost = compute_cost(EXTRACTION_MODEL, 500, 250)
        expected = 0.5 * price.prompt_per_1k + 0.25 * price.completion_per_1k
        assert cost == pytest.approx(expected)

    def test_zero_tokens_is_zero_cost_for_known_model(self):
        assert compute_cost(EXTRACTION_MODEL, 0, 0) == pytest.approx(0.0)

    def test_unknown_model_returns_none(self):
        assert compute_cost("vendor/not-in-table", 1000, 1000) is None

    def test_missing_prompt_tokens_returns_none(self):
        # Usage absent on the response → cost is unknown, never a silent 0.
        assert compute_cost(EXTRACTION_MODEL, None, None) is None

    def test_missing_completion_tokens_counts_as_zero_completion(self):
        price = MODEL_PRICES[EXTRACTION_MODEL]
        cost = compute_cost(EXTRACTION_MODEL, 1000, None)
        assert cost == pytest.approx(price.prompt_per_1k)

    def test_embedding_model_has_no_completion_cost(self):
        price = MODEL_PRICES[EMBEDDING_MODEL]
        assert price.completion_per_1k == 0.0
        # Even if a completion count is passed, it contributes nothing.
        cost = compute_cost(EMBEDDING_MODEL, 1000, 1000)
        assert cost == pytest.approx(price.prompt_per_1k)
