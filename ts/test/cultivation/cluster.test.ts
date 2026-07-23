import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  type ClusterableMemory,
  clusterMemories,
  DEFAULT_CLUSTER_THRESHOLD,
  MAX_CLUSTER_SIZE,
} from "../../src/cultivation/cluster.ts";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const GOLDEN_PATH = join(HERE, "..", "goldens", "cluster.golden.json");

interface GoldenMemory {
  id: string;
  embedding: number[] | null;
  readiness_state: string;
}

interface Golden {
  meta: { threshold: number };
  memories: GoldenMemory[];
  expected_clusters: string[][];
}

function floatsToBase64(values: readonly number[]): string {
  const buffer = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => {
    buffer.writeFloatLE(value, index * 4);
  });
  return buffer.toString("base64");
}

function toClusterable(memory: GoldenMemory): ClusterableMemory {
  return {
    id: memory.id,
    memory_type: "insight",
    layer: "ego",
    title: `Memory ${memory.id}`,
    content: `Synthetic content for ${memory.id}.`,
    context: null,
    journey: null,
    created_at: "2026-01-01T00:00:00.000000Z",
    readiness_state: memory.readiness_state,
    embedding_b64: memory.embedding === null ? null : floatsToBase64(memory.embedding),
  };
}

function loadGolden(): Golden {
  return JSON.parse(readFileSync(GOLDEN_PATH, "utf8")) as Golden;
}

test("clusterMemories matches the Python oracle golden: cluster ids, order, and count", () => {
  const golden = loadGolden();
  assert.equal(golden.meta.threshold, DEFAULT_CLUSTER_THRESHOLD);

  const memories = golden.memories.map(toClusterable);
  const clusters = clusterMemories(memories, golden.meta.threshold);

  assert.deepEqual(
    clusters.map((cluster) => cluster.map((memory) => memory.id)),
    golden.expected_clusters,
  );
});

test("clustering is seed-relative, not transitive: m3 joins m1's cluster without being close to m2", () => {
  const golden = loadGolden();
  const memories = golden.memories.map(toClusterable);
  const clusters = clusterMemories(memories, golden.meta.threshold);
  const firstCluster = clusters.find((cluster) => cluster.some((m) => m.id === "m1"));
  assert.deepEqual(
    firstCluster?.map((m) => m.id),
    ["m1", "m2", "m3"],
  );
});

test("a terminal readiness_state ('integrated') is excluded even when embedding-close to a live cluster", () => {
  const golden = loadGolden();
  const memories = golden.memories.map(toClusterable);
  const clusters = clusterMemories(memories, golden.meta.threshold);
  for (const cluster of clusters) {
    assert.ok(
      !cluster.some((m) => m.id === "m7"),
      "m7 (integrated) must never appear in a cluster",
    );
  }
});

test("a memory with no embedding is excluded defensively, matching Python's `embedding is not None` check", () => {
  const golden = loadGolden();
  const memories = golden.memories.map(toClusterable);
  const m8 = memories.find((m) => m.id === "m8");
  assert.equal(m8?.embedding_b64, null);
  const clusters = clusterMemories(memories, golden.meta.threshold);
  for (const cluster of clusters) {
    assert.ok(!cluster.some((m) => m.id === "m8"));
  }
});

test("a singleton with no close seed is dropped, not returned as a cluster of one", () => {
  const golden = loadGolden();
  const memories = golden.memories.map(toClusterable);
  const clusters = clusterMemories(memories, golden.meta.threshold);
  for (const cluster of clusters) {
    assert.ok(!cluster.some((m) => m.id === "m6"));
    assert.ok(cluster.length >= 2);
  }
});

test("MAX_CLUSTER_SIZE caps a saturated seed's cluster and leaves the overflow as a dropped singleton", () => {
  const golden = loadGolden();
  const memories = golden.memories.map(toClusterable);
  const clusters = clusterMemories(memories, golden.meta.threshold);
  const saturated = clusters.find((cluster) => cluster.some((m) => m.id === "m9"));
  assert.equal(saturated?.length, MAX_CLUSTER_SIZE);
  assert.ok(!saturated?.some((m) => m.id === "m14"), "m14 must overflow out of the capped cluster");
  for (const cluster of clusters) {
    assert.ok(!cluster.some((m) => m.id === "m14"));
  }
});

test("fewer than two eligible memories returns no clusters at all", () => {
  const only = [
    toClusterable({ id: "solo", embedding: [1, 0, 0, 0], readiness_state: "observed" }),
  ];
  assert.deepEqual(clusterMemories(only), []);
  assert.deepEqual(clusterMemories([]), []);
});
