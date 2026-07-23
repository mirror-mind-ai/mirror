import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite } from "../../src/db/database.ts";
import {
  evaluateCultivationProbes,
  evaluateJourneyProbes,
  evaluatePersonaProbes,
  orderedIdsHash,
  type RealDbCopyFixture,
  renderRedactedReport,
  toProbeResult,
} from "../../src/parity/realDbCopyParity.ts";
import { createConsolidationsTable, createMemoriesTable } from "../helpers/cultivationSchema.ts";

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

test("toProbeResult redacts by default and exposes orders only under debug", () => {
  const redacted = toProbeResult("p", ["a", "b"], ["a", "b"]);
  assert.equal(redacted.match, true);
  assert.equal(redacted.expectedOrder, undefined);
  const debug = toProbeResult("p", ["a", "b"], ["b", "a"], { includeSensitiveDebug: true });
  assert.equal(debug.match, false);
  assert.deepEqual(debug.actualOrder, ["b", "a"]);
});

test("evaluateJourneyProbes replays the pure listing logic against the oracle order", () => {
  const fixture: RealDbCopyFixture = {
    ...personaFixture,
    journey_rows: [
      { key: "root", content: "# Root\n**Status:** active" },
      {
        key: "child",
        content: "# Child\n**Status:** active",
        metadata: JSON.stringify({ parent_journey: "root" }),
      },
      { key: "done", content: "# Done\n**Status:** completed" },
    ],
    journey_probes: [{ label: "journeys_all", expected_order: ["root", "child", "done"] }],
  };
  const [result] = evaluateJourneyProbes(fixture);
  assert.equal(result.label, "journeys_all");
  assert.equal(result.match, true);
});

test("evaluateJourneyProbes flags a divergent oracle order, redacted", () => {
  const fixture: RealDbCopyFixture = {
    ...personaFixture,
    journey_rows: [{ key: "a", content: "# A\n**Status:** active" }],
    journey_probes: [{ label: "journeys_all", expected_order: ["wrong"] }],
  };
  const [result] = evaluateJourneyProbes(fixture);
  assert.equal(result.match, false);
  const report = renderRedactedReport([result]);
  assert.doesNotMatch(report, /wrong/);
});

function tempCultivationDb() {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-cultivation-parity-"));
  const tmp = join(dir, "tmp");
  mkdirSync(tmp);
  const db = openDatabaseCopyForWrite(join(tmp, "copy.db"));
  createMemoriesTable(db);
  createConsolidationsTable(db);
  return { db, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("evaluateCultivationProbes: cluster probe replays clusterMemories and grades cluster+member order together", () => {
  const { db, cleanup } = tempCultivationDb();
  try {
    const fixture: RealDbCopyFixture = {
      ...personaFixture,
      cultivation_cluster_probe: {
        label: "cultivation_cluster_order",
        threshold: 0.75,
        memories: [
          {
            id: "m1",
            memory_type: "insight",
            layer: "ego",
            title: "T1",
            content: "C1",
            context: null,
            journey: null,
            created_at: "2026-01-01T00:00:00.000000Z",
            readiness_state: "observed",
            embedding_b64: Buffer.from(new Float32Array([1, 0, 0, 0]).buffer).toString("base64"),
          },
          {
            id: "m2",
            memory_type: "insight",
            layer: "ego",
            title: "T2",
            content: "C2",
            context: null,
            journey: null,
            created_at: "2026-01-02T00:00:00.000000Z",
            readiness_state: "observed",
            embedding_b64: Buffer.from(new Float32Array([0.95, 0.05, 0, 0]).buffer).toString(
              "base64",
            ),
          },
        ],
        expected_clusters: [["m1", "m2"]],
      },
    };
    const results = evaluateCultivationProbes(fixture, db);
    assert.equal(results.length, 1);
    assert.equal(results[0]?.label, "cultivation_cluster_order");
    assert.equal(results[0]?.match, true);
  } finally {
    db.close();
    cleanup();
  }
});

test("evaluateCultivationProbes: cluster probe flags a divergent oracle order", () => {
  const { db, cleanup } = tempCultivationDb();
  try {
    const fixture: RealDbCopyFixture = {
      ...personaFixture,
      cultivation_cluster_probe: {
        label: "cultivation_cluster_order",
        threshold: 0.75,
        memories: [
          {
            id: "m1",
            memory_type: "insight",
            layer: "ego",
            title: "T1",
            content: "C1",
            context: null,
            journey: null,
            created_at: "2026-01-01T00:00:00.000000Z",
            readiness_state: "observed",
            embedding_b64: Buffer.from(new Float32Array([1, 0, 0, 0]).buffer).toString("base64"),
          },
        ],
        expected_clusters: [["m1", "m2"]],
      },
    };
    const [result] = evaluateCultivationProbes(fixture, db);
    assert.equal(result?.match, false);
  } finally {
    db.close();
    cleanup();
  }
});

test("evaluateCultivationProbes: consolidation-listing probes replay listConsolidations over the copied DB", () => {
  const { db, cleanup } = tempCultivationDb();
  try {
    db.prepare(
      "INSERT INTO consolidations (id, action, proposal, source_memory_ids, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run("c1", "identity_update", "p", "[]", "pending", "2026-01-02T00:00:00.000000Z");
    db.prepare(
      "INSERT INTO consolidations (id, action, proposal, source_memory_ids, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run("c2", "merge", "p", "[]", "accepted", "2026-01-01T00:00:00.000000Z");

    const fixture: RealDbCopyFixture = {
      ...personaFixture,
      cultivation_consolidation_probes: [
        {
          label: "cultivation_consolidation_list_all",
          status: null,
          limit: 50,
          expected_order: ["c1", "c2"],
        },
        {
          label: "cultivation_consolidation_list_by_status",
          status: "pending",
          limit: 50,
          expected_order: ["c1"],
        },
      ],
    };
    const results = evaluateCultivationProbes(fixture, db);
    assert.equal(results.length, 2);
    assert.ok(results.every((result) => result.match));
  } finally {
    db.close();
    cleanup();
  }
});

test("evaluateCultivationProbes returns [] on a fixture with neither cultivation probe present", () => {
  const { db, cleanup } = tempCultivationDb();
  try {
    assert.deepEqual(evaluateCultivationProbes(personaFixture, db), []);
  } finally {
    db.close();
    cleanup();
  }
});
