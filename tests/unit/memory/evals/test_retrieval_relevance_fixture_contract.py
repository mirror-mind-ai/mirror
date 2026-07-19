"""Unit tests for evals.retrieval_relevance (CV9.E2.S28 / AI-14).

Unlike scene/shadow/consolidate's fixture-contract tests, this eval is fully
deterministic (frozen embeddings + frozen clock, no live LLM call at all) —
so its own probes can be exercised directly here as genuine, reproducible
regression tests, not merely structural/shape checks. No network, no API key.
"""

import evals.retrieval_relevance as rr
import pytest

import memory.intelligence.search as search_mod

pytestmark = pytest.mark.unit


class TestFixtureIntegrity:
    """The committed corpus.json/queries.json fixtures are internally
    consistent \u2014 a typo in authoring.py would make a query un-hittable
    without ever raising an error, so this is asserted explicitly.
    """

    def test_corpus_has_thirty_memories(self):
        assert len(rr._CORPUS["memories"]) == 30

    def test_queries_within_confirmed_range(self):
        # CV9.E2.S28 plan: 15-25 labeled queries.
        assert 15 <= len(rr._QUERIES_DATA["queries"]) <= 25

    def test_every_relevant_id_references_a_real_corpus_memory(self):
        corpus_ids = {m["id"] for m in rr._CORPUS["memories"]}
        for q in rr._QUERIES_DATA["queries"]:
            for rid in q["relevant_ids"]:
                assert rid in corpus_ids, f"{q['id']} references unknown memory {rid!r}"

    def test_every_memory_and_query_embedding_is_1536_dim(self):
        for m in rr._CORPUS["memories"]:
            assert len(m["embedding"]) == 1536, m["id"]
        for q in rr._QUERIES_DATA["queries"]:
            assert len(q["embedding"]) == 1536, q["id"]

    def test_provenance_records_the_embedding_model(self):
        assert rr._CORPUS["provenance"]["embedding_model"]
        assert rr._CORPUS["provenance"] == rr._QUERIES_DATA["provenance"]

    def test_every_query_has_at_least_one_relevant_id(self):
        for q in rr._QUERIES_DATA["queries"]:
            assert len(q["relevant_ids"]) >= 1, q["id"]


class TestFrozenClockAndEmbeddingRestore:
    """The freeze/restore context manager must not leak into other eval
    modules sharing a process under `eval --all` \u2014 verified directly, not
    just asserted in a docstring.
    """

    def test_restores_datetime_after_use(self):
        original = search_mod.datetime
        with rr._frozen_clock_and_embedding(rr._QUERIES_DATA["queries"][0]["embedding"]):
            assert search_mod.datetime is not original
        assert search_mod.datetime is original

    def test_restores_generate_embedding_after_use(self):
        original = search_mod.generate_embedding
        with rr._frozen_clock_and_embedding(rr._QUERIES_DATA["queries"][0]["embedding"]):
            assert search_mod.generate_embedding is not original
        assert search_mod.generate_embedding is original

    def test_restores_even_when_the_block_raises(self):
        original_dt = search_mod.datetime
        original_embed = search_mod.generate_embedding
        with pytest.raises(RuntimeError):
            with rr._frozen_clock_and_embedding([0.0] * 1536):
                raise RuntimeError("boom")
        assert search_mod.datetime is original_dt
        assert search_mod.generate_embedding is original_embed


class TestReciprocalRank:
    def test_first_position_hit_scores_one(self):
        assert rr._reciprocal_rank(["a", "b", "c"], ["a"]) == 1.0

    def test_third_position_hit_scores_one_third(self):
        assert rr._reciprocal_rank(["x", "y", "a"], ["a"]) == pytest.approx(1 / 3)

    def test_no_hit_scores_zero(self):
        assert rr._reciprocal_rank(["x", "y", "z"], ["a"]) == 0.0

    def test_first_matching_of_multiple_relevant_ids_wins(self):
        assert rr._reciprocal_rank(["x", "b", "a"], ["a", "b"]) == pytest.approx(0.5)


class TestProbeCount:
    def test_one_probe_per_query_plus_the_mrr_aggregate(self):
        assert len(rr.PROBES) == len(rr._QUERIES_DATA["queries"]) + 1

    def test_mrr_aggregate_is_the_last_probe(self):
        assert rr.PROBES[-1].id == "mrr-aggregate"


class TestMeasuredBaseline:
    """Locks in the measured baseline (CV9.E2.S28 as-built) as a genuine
    regression test \u2014 this eval is fully deterministic, so unlike the live
    evals, a baseline number IS reproducible and gate-worthy here.
    """

    def test_every_labeled_query_hits_at_current_weights(self):
        # 18/18 hit@k measured at authoring time (frozen corpus, current
        # SEARCH_WEIGHTS). A regression here means a real ranking change.
        for probe in rr.PROBES:
            if probe.id == "mrr-aggregate":
                continue
            passed, notes = probe.run()
            assert passed, f"{probe.id} missed: {notes}"

    def test_mrr_aggregate_always_passes_and_reports_a_number(self):
        passed, notes = rr.PROBES[-1].run()
        assert passed is True
        assert "MRR=" in notes
