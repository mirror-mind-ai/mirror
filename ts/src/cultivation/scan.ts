// `consolidate scan` / `shadow scan` orchestration (CV22.DS7.US3 Slice B):
// cluster (deterministic) -> propose (LLM call, replay-gated) -> store.
// Ports `cli/consolidate_cmd.py:cmd_scan` and `cli/shadow_cmd.py:cmd_scan`'s
// non-printing logic -- rendering is the front door's concern.

import type { WritableDatabase } from "../db/database.ts";
import { listIdentityByLayer } from "../identity/identityRead.ts";
import type { LlmProvider } from "../providers/llm.ts";
import { clusterMemories, DEFAULT_CLUSTER_THRESHOLD } from "./cluster.ts";
import {
  type ConsolidationRow,
  type CultivationMemoryWithEmbedding,
  createConsolidation,
  getMemoriesWithEmbeddingsForCultivation,
  getShadowCandidateMemories,
} from "./consolidationStore.ts";
import { proposeConsolidation, proposeShadowObservations } from "./propose.ts";

/** Mirrors `consolidate scan`'s `--limit` default (max proposals per run). */
export const DEFAULT_CONSOLIDATE_SCAN_LIMIT = 5;

/** Mirrors `shadow scan`'s `--limit` default (max shadow-candidate memories considered). */
export const DEFAULT_SHADOW_SCAN_LIMIT = 50;

export interface ConsolidateScanOptions {
  journey?: string | null;
  layer?: string | null;
  /** Max proposals to generate (caps the cluster list before proposing, matching Python). */
  limit?: number;
  threshold?: number;
  provider: LlmProvider;
  /** Called once per cluster considered, matching Python's per-Consolidation `_uuid()`/`_now()`. */
  id: () => string;
  nowIso: () => string;
}

export interface ConsolidateScanResult {
  memoriesScanned: number;
  clusters: CultivationMemoryWithEmbedding[][];
  proposalsCreated: ConsolidationRow[];
}

/**
 * Port of `consolidate_cmd.cmd_scan`'s non-printing logic: read
 * embedded memories (filtered), cluster them, cap at `limit`, propose one
 * Consolidation per cluster, and persist every non-null proposal. A cluster
 * whose proposal comes back `null` (LLM failure, unparsable JSON, disallowed
 * action, or empty content) is silently skipped -- exactly like Python's
 * "LLM returned no valid proposal" branch, which does not store anything for
 * that cluster and moves on.
 */
export async function consolidateScan(
  db: WritableDatabase,
  options: ConsolidateScanOptions,
): Promise<ConsolidateScanResult> {
  const memories = getMemoriesWithEmbeddingsForCultivation(db, {
    journey: options.journey,
    layer: options.layer,
  });
  if (memories.length === 0) {
    return { memoriesScanned: 0, clusters: [], proposalsCreated: [] };
  }

  const allClusters = clusterMemories(memories, options.threshold ?? DEFAULT_CLUSTER_THRESHOLD);
  const clusters = allClusters.slice(0, options.limit ?? DEFAULT_CONSOLIDATE_SCAN_LIMIT);

  const proposalsCreated: ConsolidationRow[] = [];
  for (const cluster of clusters) {
    const proposal = await proposeConsolidation(options.provider, cluster, {
      id: options.id(),
      nowIso: options.nowIso(),
    });
    if (proposal === null) continue;
    proposalsCreated.push(createConsolidation(db, proposal));
  }

  return { memoriesScanned: memories.length, clusters, proposalsCreated };
}

export interface ShadowScanOptions {
  limit?: number;
  provider: LlmProvider;
  /** Called once per emitted observation, matching Python's per-item `_uuid()`/`_now()`. */
  id: () => string;
  nowIso: () => string;
}

export interface ShadowScanResult {
  candidatesConsidered: number;
  proposalsCreated: ConsolidationRow[];
}

/**
 * Port of `shadow_cmd.cmd_scan`'s non-printing logic: read shadow-candidate
 * memories and the current structural shadow layer, propose observations over
 * the FULL pool in one call, and persist every emitted proposal.
 */
export async function shadowScan(
  db: WritableDatabase,
  options: ShadowScanOptions,
): Promise<ShadowScanResult> {
  const memories = getShadowCandidateMemories(db, {
    limit: options.limit ?? DEFAULT_SHADOW_SCAN_LIMIT,
  });
  const shadowEntries = listIdentityByLayer(db, "shadow").map((row) => ({
    key: row.key,
    content: row.content,
  }));

  const proposals = await proposeShadowObservations(options.provider, memories, shadowEntries, {
    id: options.id,
    nowIso: options.nowIso,
  });

  const proposalsCreated = proposals.map((proposal) => createConsolidation(db, proposal));
  return { candidatesConsidered: memories.length, proposalsCreated };
}
