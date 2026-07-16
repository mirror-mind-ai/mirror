"""CV9.E2.S10 (AI-04) — search degrades to lexical-only instead of crashing.

When the query embedding cannot be generated (offline, no API key, timeout),
search must fall back to the local FTS5 index and flag the result as degraded,
rather than raising a hard network error.
"""

import numpy as np
import pytest

_UNIT = np.ones(1536, dtype=np.float32) / np.sqrt(1536)


def _seed(memory_service, mocker):
    """Store memories with a working (fake) embedding so they have vectors."""
    mocker.patch("memory.services.memory.generate_embedding", return_value=_UNIT)
    memory_service.add_memory(
        title="Nomad freedom", content="digital nomad lifestyle", memory_type="insight"
    )
    memory_service.add_memory(
        title="Pasta recipe", content="italian cooking", memory_type="insight"
    )


def _fail_query_embedding(mocker):
    mocker.patch(
        "memory.intelligence.search.generate_embedding",
        side_effect=RuntimeError("embedding provider unreachable"),
    )


class TestDegradedSearch:
    def test_embedding_failure_degrades_to_lexical_only(self, memory_service, mocker):
        _seed(memory_service, mocker)
        _fail_query_embedding(mocker)

        outcome = memory_service.search_engine.search_with_status("nomad")

        assert outcome.degraded is True
        titles = [r.memory.title for r in outcome.results]
        assert "Nomad freedom" in titles
        assert "Pasta recipe" not in titles  # not an FTS match for "nomad"

    def test_legacy_search_returns_results_instead_of_raising(self, memory_service, mocker):
        _seed(memory_service, mocker)
        _fail_query_embedding(mocker)

        results = memory_service.search("nomad")  # must not raise

        assert any(r.memory.title == "Nomad freedom" for r in results)

    def test_service_search_with_status_delegates(self, memory_service, mocker):
        _seed(memory_service, mocker)
        _fail_query_embedding(mocker)

        outcome = memory_service.search_with_status("nomad")

        assert outcome.degraded is True
        assert any(r.memory.title == "Nomad freedom" for r in outcome.results)


class TestNormalModeUnchanged:
    def test_normal_search_is_not_degraded(self, memory_service, mocker):
        _seed(memory_service, mocker)
        mocker.patch("memory.intelligence.search.generate_embedding", return_value=_UNIT)

        outcome = memory_service.search_engine.search_with_status("nomad")

        assert outcome.degraded is False
        assert len(outcome.results) >= 1


class TestNoKeyGuard:
    def test_generate_embedding_requires_api_key(self, mocker):
        mocker.patch("memory.intelligence.embeddings.OPENROUTER_API_KEY", "")
        from memory.intelligence.embeddings import generate_embedding

        with pytest.raises(RuntimeError):
            generate_embedding("anything")
