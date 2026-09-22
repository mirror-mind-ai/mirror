import assert from "node:assert/strict";
import { test } from "node:test";
import { CORPUS, PROBES, QUERIES, reciprocalRank, THRESHOLD } from "#evals/retrieval_relevance.ts";

// Port of tests/unit/memory/evals/test_retrieval_relevance_fixture_contract.py.
// The fixture is the measurement instrument: if the corpus, the labels, or the
// embedding dimensions drift, every hit@k number above becomes meaningless
// while still looking like a score.

test("the corpus carries thirty memories", () => {
  assert.equal(CORPUS.memories.length, 30);
});

test("the labeled query set is within the confirmed range", () => {
  assert.ok(QUERIES.queries.length >= 15 && QUERIES.queries.length <= 20);
  assert.equal(QUERIES.queries.length, 18);
});

test("every relevant id references a real corpus memory", () => {
  const ids = new Set(CORPUS.memories.map((m) => m.id));
  for (const query of QUERIES.queries) {
    for (const relevant of query.relevant_ids) {
      assert.ok(ids.has(relevant), `${query.id} references unknown memory ${relevant}`);
    }
  }
});

test("every query has at least one relevant id", () => {
  for (const query of QUERIES.queries) {
    assert.ok(query.relevant_ids.length > 0, `${query.id} has no label`);
  }
});

test("every memory and query embedding is 1536-dimensional", () => {
  for (const memory of CORPUS.memories) {
    assert.equal(memory.embedding.length, 1536, `memory ${memory.id}`);
  }
  for (const query of QUERIES.queries) {
    assert.equal(query.embedding.length, 1536, `query ${query.id}`);
  }
});

test("provenance records the embedding model and the frozen clock", () => {
  assert.equal(CORPUS.provenance.embedding_model, "openai/text-embedding-3-small");
  assert.equal(CORPUS.provenance.frozen_now, "2026-08-01T12:00:00Z");
  assert.equal(QUERIES.provenance.embedding_model, CORPUS.provenance.embedding_model);
});

test("one probe per query, plus the MRR aggregate last", () => {
  assert.equal(PROBES.length, QUERIES.queries.length + 1);
  assert.equal(PROBES.at(-1)?.id, "mrr-aggregate");
  assert.deepEqual(
    PROBES.slice(0, -1).map((p) => p.id),
    QUERIES.queries.map((q) => q.id),
  );
});

test("the threshold is an exact regression detector, not slack", () => {
  // 19 probes at a perfect run; a single hit@k regression is 18/19 = 0.947,
  // which must fall below the threshold.
  assert.ok(THRESHOLD > 18 / 19, "one regression must trip the gate");
  assert.ok(THRESHOLD <= 1);
});

test("no probe in this module is blocking", () => {
  // Blocking is reserved for injection-resistance probes (D-017). A relevance
  // miss is a quality signal, not a security one.
  assert.deepEqual(
    PROBES.filter((p) => p.blocking === true),
    [],
  );
});

test("reciprocalRank scores by first matching position", () => {
  assert.equal(reciprocalRank(["a", "b", "c"], ["a"]), 1);
  assert.equal(reciprocalRank(["x", "y", "a"], ["a"]), 1 / 3);
  assert.equal(reciprocalRank(["x", "y"], ["a"]), 0);
  assert.equal(reciprocalRank([], ["a"]), 0);
});

test("reciprocalRank takes the first matching of several relevant ids", () => {
  assert.equal(reciprocalRank(["x", "b", "a"], ["a", "b"]), 1 / 2);
});

// Keyless and deterministic: this is the one eval that can run inside the test
// suite, so the harness's end-to-end path is covered by CI even though evals
// themselves never are.
test("every labeled query hits at the current weights, and MRR holds the baseline", async () => {
  const outcomes = await Promise.all(PROBES.map((probe) => probe.run()));
  const failures = PROBES.filter((_, i) => !outcomes[i]?.passed).map((p) => p.id);
  assert.deepEqual(failures, [], "hit@k regression");
  assert.match(outcomes.at(-1)?.notes ?? "", /MRR=0\.9074 over 18 queries/);
});
