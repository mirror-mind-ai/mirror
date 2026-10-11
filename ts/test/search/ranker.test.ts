import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SEARCH_RANKER_CONFIG } from "#search/memorySearch.ts";
import {
  cosineSimilarity,
  hybridScore,
  rankMemories,
  recencyScore,
  reinforcementScore,
} from "#search/ranker.ts";

const frozenNowMs = Date.parse("2026-06-23T12:00:00Z");

// --- Reinforcement scoring contracts (CV22.DS10.TS3) -----------------------
//
// These eight tests were `evals/retrieval.py`, a keyless eval module whose
// THRESHOLD was 1.0: deterministic math contracts wearing an eval's costume.
// An eval is for behavior that drifts under a non-deterministic dependency;
// this math drifts only when someone edits it, which is what CI is for. They
// keep their Python probe ids so the history in eval-history/retrieval.jsonl
// stays traceable to the tests that replaced it.
//
// The two remaining probes -- `readiness-default` and `use-count-default-zero`
// -- are not ported here: `ts/test/memory/memoryWrite.test.ts` already asserts
// both defaults against a real insert, which is stronger than the dataclass
// default the Python probes read.

const REINFORCEMENT = {
  frozenNowMs,
  reinforcementDecayDays: DEFAULT_SEARCH_RANKER_CONFIG.reinforcementDecayDays,
  reinforcementUseWeight: DEFAULT_SEARCH_RANKER_CONFIG.reinforcementUseWeight,
  reinforcementRetrievalWeight: DEFAULT_SEARCH_RANKER_CONFIG.reinforcementRetrievalWeight,
};

/** ISO timestamp `days` before the frozen clock, in UTC. */
function daysAgoIso(days: number): string {
  return new Date(frozenNowMs - days * 86_400_000).toISOString();
}

test("retrieval/no-access-baseline: never retrieved or used has zero reinforcement", () => {
  assert.equal(reinforcementScore(0, 0, null, REINFORCEMENT), 0);
});

test("retrieval/recent-beats-stale: same access count, fresher access scores higher", () => {
  const recent = reinforcementScore(3, 0, daysAgoIso(1), REINFORCEMENT);
  const stale = reinforcementScore(
    3,
    0,
    daysAgoIso(REINFORCEMENT.reinforcementDecayDays * 5),
    REINFORCEMENT,
  );
  assert.ok(recent > stale, `recent=${recent} stale=${stale}`);
});

test("retrieval/decay-halves-at-half-life: signal is ~50% of fresh at the decay half-life", () => {
  const fresh = reinforcementScore(5, 0, daysAgoIso(0), REINFORCEMENT);
  const halfLife = reinforcementScore(
    5,
    0,
    daysAgoIso(REINFORCEMENT.reinforcementDecayDays),
    REINFORCEMENT,
  );
  const ratio = halfLife / fresh;
  // The Python probe allowed 0.45-0.55 to absorb "today" drift against a live
  // clock. The clock is frozen here, so the contract can be exact.
  assert.ok(Math.abs(ratio - 0.5) < 1e-9, `ratio=${ratio}`);
});

test("retrieval/use-beats-retrieval-only: use outweighs many retrievals at equal recency", () => {
  const last = daysAgoIso(10);
  const highUse = reinforcementScore(1, 10, last, REINFORCEMENT);
  const manyRetrievals = reinforcementScore(50, 0, last, REINFORCEMENT);
  assert.ok(highUse > manyRetrievals, `use=${highUse} retrievals=${manyRetrievals}`);
});

test("retrieval/use-weight-is-dominant: saturated use signal equals the use weight", () => {
  const maxUse = reinforcementScore(0, 100, null, REINFORCEMENT);
  assert.ok(Math.abs(maxUse - REINFORCEMENT.reinforcementUseWeight) < 1e-9, `${maxUse}`);
});

test("retrieval/retrieval-weight-caps: pure retrieval signal ceils at the retrieval weight", () => {
  const maxRetrieval = reinforcementScore(10_000, 0, daysAgoIso(0), REINFORCEMENT);
  assert.ok(
    Math.abs(maxRetrieval - REINFORCEMENT.reinforcementRetrievalWeight) < 0.01,
    `${maxRetrieval}`,
  );
});

test("retrieval/hybrid-score-incorporates-reinforcement: more reinforcement, higher total", () => {
  const weights = DEFAULT_SEARCH_RANKER_CONFIG.weights;
  // Python's hybrid_score has no lexical term; TS added one in DS2. Holding it
  // at 0 keeps this the same contract the Python probe asserted.
  const base = hybridScore({
    semantic: 0.6,
    recency: 0.5,
    reinforcement: 0,
    relevance: 1,
    lexical: 0,
    weights,
  });
  const withReinforcement = hybridScore({
    semantic: 0.6,
    recency: 0.5,
    reinforcement: 0.5,
    relevance: 1,
    lexical: 0,
    weights,
  });
  assert.ok(withReinforcement > base, `with=${withReinforcement} base=${base}`);
});

test("retrieval/no-last-accessed-no-decay: no access and no timestamp yields no signal", () => {
  assert.equal(reinforcementScore(0, 0, null, REINFORCEMENT), 0);
});

function b64(values: readonly number[]): string {
  const buffer = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => {
    buffer.writeFloatLE(value, index * 4);
  });
  return buffer.toString("base64");
}

test("cosineSimilarity returns zero for zero vectors", () => {
  assert.equal(cosineSimilarity([0, 0], [1, 0]), 0);
  assert.equal(cosineSimilarity([0, 0], [0, 0]), 0);
});

test("recencyScore treats invalid timestamps as neutral", () => {
  assert.equal(recencyScore("not-a-date", { frozenNowMs, recencyHalfLifeDays: 30 }), 0.5);
});

test("reinforcementScore decays retrieval signal when last access is present", () => {
  const recent = reinforcementScore(10, 0, "2026-06-23T12:00:00Z", {
    frozenNowMs,
    reinforcementDecayDays: 30,
    reinforcementUseWeight: 0.7,
    reinforcementRetrievalWeight: 0.3,
  });
  const old = reinforcementScore(10, 0, "2026-03-23T12:00:00Z", {
    frozenNowMs,
    reinforcementDecayDays: 30,
    reinforcementUseWeight: 0.7,
    reinforcementRetrievalWeight: 0.3,
  });
  assert.ok(recent > old);
});

test("rankMemories applies lexical score and MMR deduplication", () => {
  const ranked = rankMemories(
    [
      {
        id: "a",
        created_at: "2026-06-23T12:00:00Z",
        last_accessed_at: null,
        use_count: 0,
        relevance_score: 0,
        access_count: 0,
        lexical_score: 1,
        embedding_b64: b64([1, 0]),
      },
      {
        id: "near-duplicate",
        created_at: "2026-06-23T12:00:00Z",
        last_accessed_at: null,
        use_count: 0,
        relevance_score: 0,
        access_count: 0,
        lexical_score: 0,
        embedding_b64: b64([0.99, 0.01]),
      },
      {
        id: "b",
        created_at: "2026-06-23T12:00:00Z",
        last_accessed_at: null,
        use_count: 0,
        relevance_score: 0,
        access_count: 0,
        lexical_score: 0,
        embedding_b64: b64([0, 1]),
      },
    ],
    {
      queryEmbedding: [1, 0],
      frozenNowMs,
      limit: 2,
      weights: { semantic: 1, recency: 0, reinforcement: 0, relevance: 0, lexical: 1 },
      mmrThreshold: 0.95,
      recencyHalfLifeDays: 30,
      reinforcementDecayDays: 30,
      reinforcementUseWeight: 0.7,
      reinforcementRetrievalWeight: 0.3,
    },
  );

  assert.deepEqual(
    ranked.map((memory) => memory.id),
    ["a", "b"],
  );
});
