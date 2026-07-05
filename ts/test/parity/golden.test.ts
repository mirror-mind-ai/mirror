import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { blobToFloat32, parseUtcMs } from "../../src/parity/decode.ts";
import { loadGolden, orderedIdsMatch } from "../../src/parity/golden.ts";
import { rankMemories } from "../../src/search/ranker.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = join(HERE, "..", "goldens", "hybrid-search.golden.json");
const golden = loadGolden(GOLDEN_PATH);

test("golden corpus is well-formed and self-consistent", () => {
  assert.ok(golden.memories.length > 0, "corpus is non-empty");
  assert.ok(golden.expected_order.length > 0, "expected order is non-empty");
  const ids = new Set(golden.memories.map((m) => m.id));
  assert.equal(ids.size, golden.memories.length, "memory ids are unique");
  assert.ok(
    golden.expected_order.every((id) => ids.has(id)),
    "every expected id refers to a corpus memory",
  );
});

test("blobToFloat32 reproduces the Python-decoded embedding for every memory", () => {
  for (const mem of golden.memories) {
    const decoded = Array.from(blobToFloat32(Buffer.from(mem.embedding_b64, "base64")));
    assert.equal(decoded.length, mem.embedding.length, `length for ${mem.id}`);
    decoded.forEach((value, index) => {
      assert.ok(
        Math.abs(value - mem.embedding[index]) <= 1e-6,
        `embedding mismatch for ${mem.id}[${index}]: ${value} vs ${mem.embedding[index]}`,
      );
    });
  }
});

test("parseUtcMs reproduces the Python epoch-ms for every timestamp", () => {
  for (const mem of golden.memories) {
    assert.equal(parseUtcMs(mem.created_at), mem.created_at_ms, `created_at for ${mem.id}`);
    assert.equal(
      parseUtcMs(mem.last_accessed_at),
      mem.last_accessed_at_ms,
      `last_accessed_at for ${mem.id}`,
    );
  }
  assert.equal(parseUtcMs(golden.meta.frozen_now), golden.meta.frozen_now_ms, "frozen_now");
});

test("TS ranker reproduces the Python oracle ordered ids", () => {
  const ranked = rankMemories(golden.memories, {
    queryEmbedding: golden.meta.query_embedding,
    frozenNowMs: golden.meta.frozen_now_ms,
    limit: golden.meta.limit,
    weights: {
      semantic: golden.meta.weights.semantic,
      recency: golden.meta.weights.recency,
      reinforcement: golden.meta.weights.reinforcement,
      relevance: golden.meta.weights.relevance,
      lexical: golden.meta.weights.lexical,
    },
    mmrThreshold: golden.meta.mmr_threshold,
    recencyHalfLifeDays: golden.meta.recency_half_life_days,
    reinforcementDecayDays: golden.meta.reinforcement_decay_days,
    reinforcementUseWeight: golden.meta.reinforcement_use_weight,
    reinforcementRetrievalWeight: golden.meta.reinforcement_retrieval_weight,
  });
  assert.deepEqual(
    ranked.map((memory) => memory.id),
    golden.expected_order,
  );
});

test("orderedIdsMatch grades the oracle's own order as a pass", () => {
  assert.equal(orderedIdsMatch(golden.expected_order, golden.expected_order), true);
});

test("orderedIdsMatch catches a flipped pair and a length difference (the grader is real)", () => {
  const permuted = [...golden.expected_order];
  assert.ok(permuted.length >= 2, "need at least two ids to permute");
  const first = permuted[0];
  permuted[0] = permuted[1];
  permuted[1] = first;
  assert.equal(orderedIdsMatch(permuted, golden.expected_order), false, "flipped pair fails");
  assert.equal(
    orderedIdsMatch(golden.expected_order.slice(1), golden.expected_order),
    false,
    "length difference fails",
  );
});
