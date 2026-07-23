// Port of `cluster_memories` (`src/memory/intelligence/consolidate.py`,
// CV22.DS7.US3). Pure function, no DB/clock/provider dependency -- graded
// against the Python oracle by a committed synthetic-embedding golden
// (`ts/parity/generate_cluster_golden.py`).
//
// Greedy single-linkage: a memory joins an existing cluster when its cosine
// similarity to the cluster SEED (the first member, never re-derived as a
// centroid) meets the threshold. A memory can only belong to one cluster
// (first match wins). Memories with no embedding or in a terminal readiness
// state are skipped up front; singleton groups (clusters of one) are dropped.

import { blobToFloat32 } from "../db/decode.ts";
import { cosineSimilarity } from "../search/ranker.ts";
import type { CultivationMemory } from "./consolidationStore.ts";

/** Mirrors Python's `DEFAULT_CLUSTER_THRESHOLD`. */
export const DEFAULT_CLUSTER_THRESHOLD = 0.75;

/** Mirrors Python's `MAX_CLUSTER_SIZE` -- caps memories per cluster (prevents unwieldy LLM prompts). */
export const MAX_CLUSTER_SIZE = 5;

/** Mirrors Python's `_TERMINAL_STATES` -- readiness states already "done", skipped for clustering. */
const TERMINAL_READINESS_STATES: ReadonlySet<string> = new Set(["integrated"]);

/**
 * The input shape `clusterMemories` needs: a cultivation memory whose
 * embedding MAY be absent (`null`), mirroring Python's `Memory.embedding:
 * bytes | None`. `CultivationMemoryWithEmbedding` (embedding always present,
 * guaranteed by the `embedding IS NOT NULL` SQL filter) is structurally
 * assignable here -- the real `consolidate scan` read path never actually
 * exercises the null branch, but the defensive skip is still a faithful part
 * of the ported function and is proven directly by the golden/unit tests.
 */
export interface ClusterableMemory extends CultivationMemory {
  embedding_b64: string | null;
}

/**
 * Group semantically similar memories into clusters, byte-for-byte matching
 * Python's `cluster_memories` algorithm and iteration order (both the outer
 * seed scan and the inner candidate scan iterate the SAME `eligible` array in
 * its original order -- not a shrinking remainder -- with `assigned` doing
 * the exclusion).
 */
export function clusterMemories<T extends ClusterableMemory>(
  memories: readonly T[],
  threshold: number = DEFAULT_CLUSTER_THRESHOLD,
): T[][] {
  const eligible = memories.filter(
    (memory) =>
      memory.embedding_b64 !== null && !TERMINAL_READINESS_STATES.has(memory.readiness_state),
  );
  if (eligible.length < 2) return [];

  const embeddings = new Map<string, Float32Array>();
  for (const memory of eligible) {
    embeddings.set(memory.id, blobToFloat32(Buffer.from(memory.embedding_b64 as string, "base64")));
  }

  const assigned = new Set<string>();
  const clusters: T[][] = [];

  for (const seed of eligible) {
    if (assigned.has(seed.id)) continue;
    const cluster: T[] = [seed];
    assigned.add(seed.id);
    const seedEmbedding = embeddings.get(seed.id) as Float32Array;

    for (const candidate of eligible) {
      if (assigned.has(candidate.id)) continue;
      if (cluster.length >= MAX_CLUSTER_SIZE) break;
      const similarity = cosineSimilarity(
        seedEmbedding,
        embeddings.get(candidate.id) as Float32Array,
      );
      if (similarity >= threshold) {
        cluster.push(candidate);
        assigned.add(candidate.id);
      }
    }

    if (cluster.length >= 2) clusters.push(cluster);
  }

  return clusters;
}
