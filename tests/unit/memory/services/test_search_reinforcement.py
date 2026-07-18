"""CV9.E2.S11 (AI-12) — only genuine context loads reinforce retrieval.

`search()` reinforces (`log_access`) every returned memory, and `access_count`
feeds the ranker. Internal machinery — the extraction curation pass, MCP agent
searches, exploratory CLI searches — must opt out so the ranker does not learn
from its own exhaust.
"""

import numpy as np

from memory.models import ExtractedMemory

_UNIT = np.ones(1536, dtype=np.float32) / np.sqrt(1536)


def _patch_search_embeddings(mocker):
    mocker.patch("memory.services.memory.generate_embedding", return_value=_UNIT)
    mocker.patch("memory.intelligence.search.generate_embedding", return_value=_UNIT)


class TestLogAccessFlag:
    def test_log_access_false_does_not_reinforce(self, memory_service, store, mocker):
        _patch_search_embeddings(mocker)
        memory_service.add_memory(title="Nomad", content="freedom", memory_type="insight")
        spy = mocker.spy(store, "log_access")

        memory_service.search_with_status("nomad freedom", log_access=False)

        spy.assert_not_called()

    def test_search_reinforces_by_default(self, memory_service, store, mocker):
        _patch_search_embeddings(mocker)
        memory_service.add_memory(title="Nomad", content="freedom", memory_type="insight")
        spy = mocker.spy(store, "log_access")

        outcome = memory_service.search_with_status("nomad freedom")

        assert len(outcome.results) >= 1
        assert spy.call_count == len(outcome.results)


class TestCurationDoesNotReinforce:
    def test_two_pass_extraction_reinforces_nothing(self, conversation_service, store, mocker):
        mocker.patch("memory.services.conversation.TWO_PASS_ENABLED", True)
        mocker.patch("memory.services.conversation.generate_embedding", return_value=_UNIT)
        _patch_search_embeddings(mocker)
        mocker.patch(
            "memory.services.conversation.extract_memories",
            return_value=[
                ExtractedMemory(title="New", content="c", memory_type="insight", layer="ego")
            ],
        )
        mocker.patch("memory.services.conversation.extract_tasks", return_value=[])
        mocker.patch(
            "memory.services.conversation.curate_against_existing",
            side_effect=lambda candidates, existing, **kwargs: candidates,
        )
        # A prior memory so the curation search has a candidate to (not) reinforce.
        conversation_service.memories.add_memory(
            title="Existing insight",
            content="nomad freedom prior",
            memory_type="insight",
            journey="mirror",
        )
        conv = conversation_service.start_conversation(interface="cli", journey="mirror")
        for i in range(4):
            conversation_service.add_message(conv.id, role="user", content=f"message {i}")

        spy = mocker.spy(store, "log_access")
        conversation_service.extract_conversation(conv.id)

        spy.assert_not_called()


class TestSearchQueryCount:
    """CV9.E2.S27 (AI-13) — search's access-count lookup must not scale with
    corpus size. Statement count (via set_trace_callback) is the deterministic,
    flake-proof invariant — wall-clock latency is not (a 10k benchmark exists
    separately, opt-in, informational only).
    """

    def _count_statements(self, store, fn):
        count = 0

        def _tracer(_sql):
            nonlocal count
            count += 1

        store.conn.set_trace_callback(_tracer)
        try:
            fn()
        finally:
            store.conn.set_trace_callback(None)
        return count

    def test_search_never_calls_the_per_memory_accessor(self, memory_service, store, mocker):
        # The precise, FTS5-noise-immune regression guard: search must call the
        # batched accessor, never the singular one, regardless of corpus size.
        # (SQLite FTS5's own BM25 internals legitimately scale with matching-row
        # count — an orthogonal, accepted cost this test does not measure.)
        _patch_search_embeddings(mocker)
        for i in range(5):
            memory_service.add_memory(
                title=f"Mem {i}", content=f"content {i}", memory_type="insight"
            )
        batched_spy = mocker.spy(store, "get_access_counts")
        singular_spy = mocker.spy(store, "get_access_count")

        memory_service.search_with_status("content", log_access=False)

        assert batched_spy.call_count == 1
        singular_spy.assert_not_called()

    def test_query_count_does_not_scale_with_corpus_size(self, memory_service, store, mocker):
        # Black-box confirmation at the DB level. Uses a query term that
        # matches NO memory content, so FTS5's own internal BM25 lookups (which
        # legitimately scale with matching-row count — not part of AI-13) stay
        # at zero/constant, isolating the measurement to the access-count path
        # this story actually changes.
        _patch_search_embeddings(mocker)
        for i in range(3):
            memory_service.add_memory(
                title=f"Small {i}", content=f"unrelated body {i}", memory_type="insight"
            )
        small_count = self._count_statements(
            store,
            lambda: memory_service.search_with_status("xyzzynomatch", log_access=False),
        )

        for i in range(30):
            memory_service.add_memory(
                title=f"Big {i}", content=f"unrelated body {i}", memory_type="insight"
            )
        big_count = self._count_statements(
            store,
            lambda: memory_service.search_with_status("xyzzynomatch", log_access=False),
        )

        # 3 memories vs 33 memories — the pre-fix N+1 scaled with corpus size;
        # the fix makes the access-count path constant.
        assert big_count == small_count


class TestSearchAccessCountParity:
    """CV9.E2.S27 (AI-13) — characterizes correct scoring behavior with known
    access patterns, as a regression guard through the N+1 collapse. Written to
    pass against the current (correct, unoptimized) implementation first, then
    used as a safety net through the refactor — the ranking must not change,
    only the query count.
    """

    def test_higher_access_count_ranks_above_lower_ranks_above_never_accessed(
        self, memory_service, store, mocker
    ):
        _patch_search_embeddings(mocker)
        # Identical content → identical embeddings → semantic/recency/relevance
        # pinned equal; reinforcement (access_count) is the sole differentiator.
        # Neutralize MMR dedup: with identical embeddings the three candidates
        # would otherwise collapse to one result (correct MMR behavior, but not
        # what this test isolates — reinforcement-driven ordering).
        mocker.patch("memory.intelligence.search.MMR_DEDUP_THRESHOLD", 2.0)
        high = memory_service.add_memory(
            title="High", content="shared topic", memory_type="insight"
        )
        low = memory_service.add_memory(title="Low", content="shared topic", memory_type="insight")
        zero = memory_service.add_memory(
            title="Zero", content="shared topic", memory_type="insight"
        )
        for _ in range(5):
            store.log_access(high.id)
        store.log_access(low.id)
        # zero: never accessed — the exact boundary the GROUP BY collapse omits
        # (absent from get_access_counts()'s dict, must default to 0 via .get).

        outcome = memory_service.search_with_status("shared topic", limit=3, log_access=False)

        ids_in_order = [r.memory.id for r in outcome.results]
        assert ids_in_order == [high.id, low.id, zero.id]
        # Sanity: three distinct, valid scores — zero-access did not raise, was
        # not dropped, and did not collapse to an identical or missing value.
        scores = [r.score for r in outcome.results]
        assert len(set(scores)) == 3
        assert all(isinstance(s, float) for s in scores)

    def test_reinforcement_score_formula_unaffected_by_the_query_shape_change(self):
        # The refactor touches how access_count reaches reinforcement_score, not
        # the formula itself. reinforcement_score's own contract (zero access →
        # zero retrieval signal, no decay without a last-access timestamp) is
        # already locked by evals/retrieval.py's deterministic math probes; this
        # is a narrow, local confirmation that access_count=0 (what a never-
        # accessed memory resolves to end to end) is a valid, non-raising input.
        from memory.intelligence.search import reinforcement_score

        assert reinforcement_score(0, 0, None) == 0.0
