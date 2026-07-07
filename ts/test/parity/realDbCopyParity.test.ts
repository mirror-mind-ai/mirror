import assert from "node:assert/strict";
import { test } from "node:test";
import {
  evaluatePersonaProbes,
  orderedIdsHash,
  type RealDbCopyFixture,
  renderRedactedReport,
} from "../../src/parity/realDbCopyParity.ts";

test("orderedIdsHash is stable and order-sensitive", () => {
  assert.equal(orderedIdsHash(["a", "b"]), orderedIdsHash(["a", "b"]));
  assert.notEqual(orderedIdsHash(["a", "b"]), orderedIdsHash(["b", "a"]));
});

test("renderRedactedReport omits raw ids and sensitive content", () => {
  const rawIds = ["memory-secret-1", "memory-secret-2"];
  const report = renderRedactedReport([
    {
      label: "search_demo_1",
      resultCount: rawIds.length,
      pythonOrderHash: orderedIdsHash(rawIds),
      tsOrderHash: orderedIdsHash(rawIds),
      match: true,
    },
  ]);

  assert.match(report, /probe: search_demo_1/);
  assert.match(report, /result_count: 2/);
  assert.match(report, /match: true/);
  assert.doesNotMatch(report, /memory-secret-1/);
  assert.doesNotMatch(report, /memory-secret-2/);
  assert.doesNotMatch(report, /private memory content/i);
});

const personaFixture: RealDbCopyFixture = {
  frozen_now_ms: 0,
  limit: 5,
  weights: { semantic: 1, recency: 0, reinforcement: 0, relevance: 0 },
  mmr_threshold: 1,
  recency_half_life_days: 1,
  reinforcement_decay_days: 1,
  reinforcement_use_weight: 1,
  reinforcement_retrieval_weight: 1,
  probes: [],
  persona_threshold: 1.0,
  persona_rows: [
    { key: "code-reviewer", routing_keywords: ["code", "pull request"] },
    { key: "garden-planner", routing_keywords: ["garden"] },
  ],
  persona_probes: [
    { label: "persona_derived_1", query: "read the code", expected_order: ["code-reviewer"] },
    {
      label: "persona_tie",
      query: "code and garden",
      expected_order: ["code-reviewer", "garden-planner"],
    },
    { label: "persona_no_match", query: "quiet ocean", expected_order: [] },
  ],
};

test("evaluatePersonaProbes replays the router and matches the oracle order", () => {
  const results = evaluatePersonaProbes(personaFixture);
  assert.equal(results.length, 3);
  assert.ok(
    results.every((result) => result.match),
    "every persona probe reproduces the oracle order",
  );
  assert.deepEqual(
    results.map((result) => result.label),
    ["persona_derived_1", "persona_tie", "persona_no_match"],
  );
});

test("evaluatePersonaProbes flags a divergence and keeps evidence redacted by default", () => {
  const broken: RealDbCopyFixture = {
    ...personaFixture,
    persona_probes: [
      { label: "persona_wrong", query: "read the code", expected_order: ["garden-planner"] },
    ],
  };
  const [result] = evaluatePersonaProbes(broken);
  assert.equal(result.match, false);
  assert.equal(result.expectedOrder, undefined);
  assert.equal(result.actualOrder, undefined);
  const report = renderRedactedReport([result]);
  assert.match(report, /overall_match: false/);
  assert.doesNotMatch(report, /code-reviewer/);
});

test("evaluatePersonaProbes returns nothing on a search-only fixture", () => {
  const searchOnly: RealDbCopyFixture = { ...personaFixture };
  searchOnly.persona_rows = undefined;
  searchOnly.persona_probes = undefined;
  searchOnly.persona_threshold = undefined;
  assert.deepEqual(evaluatePersonaProbes(searchOnly), []);
});
