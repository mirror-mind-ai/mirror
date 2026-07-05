import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cosineSimilarity,
  rankMemories,
  recencyScore,
  reinforcementScore,
} from "../../src/search/ranker.ts";

const frozenNowMs = Date.parse("2026-06-23T12:00:00Z");

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
