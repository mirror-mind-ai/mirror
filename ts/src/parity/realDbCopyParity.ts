import { createHash } from "node:crypto";
import { clusterMemories } from "../cultivation/cluster.ts";
import {
  type CultivationMemoryWithEmbedding,
  listConsolidations,
} from "../cultivation/consolidationStore.ts";
import type { Database } from "../db/database.ts";
import { type JourneyIdentityRow, listJourneyOptions } from "../journey/journeyOptions.ts";
import { countMemoriesByType, listRecentMemorySummaries } from "../memory/listing.ts";
import { detectPersona, type PersonaRoutingRow } from "../persona/detectPersona.ts";
import {
  type RankableMemory,
  type RankerConfig,
  rankMemories,
  type SearchWeights,
} from "../search/ranker.ts";
import { getTasksForWeek, listTasks } from "../tasks/taskStore.ts";
import { orderedIdsMatch } from "./golden.ts";

export interface RealDbCopyProbe {
  label: string;
  query_embedding: number[];
  expected_order: string[];
  memories: RankableMemory[];
}

/**
 * A `detect-persona` probe over the copied DB's real routing metadata. The
 * ordered persona keys the Python oracle returned are compared against the TS
 * router replaying the same `persona_rows` and threshold.
 */
export interface PersonaProbe {
  label: string;
  query: string;
  expected_order: string[];
}

/** A journey-listing probe: the ordered journey ids the Python oracle returned. */
export interface JourneyProbe {
  label: string;
  expected_order: string[];
}

/** A memory-listing probe: filter inputs and the ordered ids the oracle returned. */
export interface ListingProbe {
  label: string;
  memory_type?: string | null;
  layer?: string | null;
  journey?: string | null;
  limit: number;
  expected_order: string[];
}

export interface RealDbCopyFixture {
  source_label?: string;
  frozen_now_ms: number;
  limit: number;
  weights: SearchWeights;
  mmr_threshold: number;
  recency_half_life_days: number;
  reinforcement_decay_days: number;
  reinforcement_use_weight: number;
  reinforcement_retrieval_weight: number;
  probes: RealDbCopyProbe[];
  /** The copied DB's persona routing table (optional; absent on search-only fixtures). */
  persona_rows?: PersonaRoutingRow[];
  persona_threshold?: number;
  persona_probes?: PersonaProbe[];
  /** The copied DB's journey routing rows and the oracle's ordered options. */
  journey_rows?: JourneyIdentityRow[];
  journey_probes?: JourneyProbe[];
  /** Absolute path to the copied DB, so the listing read model runs over the seam. */
  copied_db_path?: string;
  listing_probes?: ListingProbe[];
  /** Sorted `type=count` tokens for the `count_by_type` cross-check. */
  count_by_type_expected?: string[];
  /** `tasks list` filter/order probes (CV22.DS7.US2), replayed over `copied_db_path`. */
  tasks_probes?: TasksProbe[];
  /** `week view`'s current-range probe (CV22.DS7.US2), replayed over `copied_db_path`. */
  week_probes?: WeekProbe[];
  /** `cluster_memories` ordering probe (CV22.DS7.US3) -- carries its own memory pool, no DB round-trip. */
  cultivation_cluster_probe?: CultivationClusterProbe;
  /** `consolidate`/`shadow list` ordering probes (CV22.DS7.US3), replayed over `copied_db_path`. */
  cultivation_consolidation_probes?: CultivationConsolidationProbe[];
}

/** The cluster-ordering probe: the full embedded-memory pool plus the oracle's ordered clusters. */
export interface CultivationClusterProbe {
  label: string;
  threshold: number;
  memories: CultivationMemoryWithEmbedding[];
  expected_clusters: string[][];
}

/** A consolidation-listing probe: the filter inputs and the ordered ids the oracle returned. */
export interface CultivationConsolidationProbe {
  label: string;
  status: string | null;
  limit: number;
  expected_order: string[];
}

/** A `tasks list` probe: the filters applied and the ordered ids the oracle returned. */
export interface TasksProbe {
  label: string;
  open_only: boolean;
  journey: string | null;
  status: string | null;
  expected_order: string[];
}

/** `week view`'s probe: the real current week's range and the ordered ids the oracle returned. */
export interface WeekProbe {
  label: string;
  start_date: string;
  end_date: string;
  expected_order: string[];
}

export interface ProbeParityResult {
  label: string;
  resultCount: number;
  pythonOrderHash: string;
  tsOrderHash: string;
  match: boolean;
  expectedOrder?: string[];
  actualOrder?: string[];
}

export function orderedIdsHash(ids: readonly string[]): string {
  return createHash("sha256").update(ids.join("\u001f"), "utf8").digest("hex");
}

/** Grade the search probes: replay the ranker on each probe's memories. */
export function evaluateSearchProbes(
  fixture: RealDbCopyFixture,
  options: { includeSensitiveDebug?: boolean } = {},
): ProbeParityResult[] {
  return fixture.probes.map((probe) => {
    const config: RankerConfig = {
      queryEmbedding: probe.query_embedding,
      frozenNowMs: fixture.frozen_now_ms,
      limit: fixture.limit,
      weights: fixture.weights,
      mmrThreshold: fixture.mmr_threshold,
      recencyHalfLifeDays: fixture.recency_half_life_days,
      reinforcementDecayDays: fixture.reinforcement_decay_days,
      reinforcementUseWeight: fixture.reinforcement_use_weight,
      reinforcementRetrievalWeight: fixture.reinforcement_retrieval_weight,
    };
    const actualOrder = rankMemories(probe.memories, config).map((memory) => memory.id);
    return toProbeResult(probe.label, probe.expected_order, actualOrder, options);
  });
}

/**
 * Build a redacted probe result from an expected/actual ordered-id pair. The
 * PASS/FAIL verdict uses the canonical `orderedIdsMatch` metric so every
 * evaluator grades ordering identically.
 */
export function toProbeResult(
  label: string,
  expectedOrder: readonly string[],
  actualOrder: readonly string[],
  options: { includeSensitiveDebug?: boolean } = {},
): ProbeParityResult {
  const match = orderedIdsMatch(actualOrder, expectedOrder);
  return {
    label,
    resultCount: expectedOrder.length,
    pythonOrderHash: orderedIdsHash(expectedOrder),
    tsOrderHash: orderedIdsHash(actualOrder),
    match,
    ...(options.includeSensitiveDebug
      ? { expectedOrder: [...expectedOrder], actualOrder: [...actualOrder] }
      : {}),
  };
}

export function evaluateJourneyProbes(
  fixture: RealDbCopyFixture,
  options: { includeSensitiveDebug?: boolean } = {},
): ProbeParityResult[] {
  const rows = fixture.journey_rows ?? [];
  const actualOrder = listJourneyOptions(rows).map((option) => option.id);
  return (fixture.journey_probes ?? []).map((probe) =>
    toProbeResult(probe.label, probe.expected_order, actualOrder, options),
  );
}

/**
 * Replay the memory-listing read model against the copied DB through the seam.
 * The ordering is SQLite's (`ORDER BY created_at DESC`), so this is where listing
 * order parity is proven (US3 option B); the CI unit suite covers the query
 * builder and mapper without a DB.
 */
export function evaluateListingProbes(
  fixture: RealDbCopyFixture,
  db: Database,
  options: { includeSensitiveDebug?: boolean } = {},
): ProbeParityResult[] {
  const results = (fixture.listing_probes ?? []).map((probe) => {
    const actualOrder = listRecentMemorySummaries(db, {
      limit: probe.limit,
      memoryType: probe.memory_type ?? null,
      layer: probe.layer ?? null,
      journey: probe.journey ?? null,
    }).map((summary) => summary.id);
    return toProbeResult(probe.label, probe.expected_order, actualOrder, options);
  });
  if (fixture.count_by_type_expected) {
    const actual = countMemoriesByType(db)
      .map(([type, count]) => `${type}=${count}`)
      .sort();
    results.push(
      toProbeResult("listing_count_by_type", fixture.count_by_type_expected, actual, options),
    );
  }
  return results;
}

/**
 * Replay `tasks list`'s filter/order logic against the copied DB through the
 * seam. Field names match the Python side's emitted JSON exactly
 * (`open_only`/`journey`/`status`), the same flat-field convention
 * `ListingProbe` already uses. A nested `filters: {...}` bag was tried first;
 * a snake_case/camelCase mismatch inside it silently defaulted every field via
 * `??`, so the harness reported PASS-shaped structure while actually replaying
 * the wrong query -- flat, Python-matching field names close that gap by
 * construction (there is no default to silently fall back to).
 */
export function evaluateTasksProbes(
  fixture: RealDbCopyFixture,
  db: Database,
  options: { includeSensitiveDebug?: boolean } = {},
): ProbeParityResult[] {
  return (fixture.tasks_probes ?? []).map((probe) => {
    const actualOrder = listTasks(db, {
      openOnly: probe.open_only,
      journey: probe.journey,
      status: probe.status,
    }).map((task) => task.id);
    return toProbeResult(probe.label, probe.expected_order, actualOrder, options);
  });
}

/**
 * Replay `week view`'s underlying `getTasksForWeek` read against the copied
 * DB for the SAME real current-week range the Python oracle computed --
 * `generate_demo_memory_db.py`'s demo tasks use dates relative to "today" for
 * exactly this reason (a static historical date would drift out of range).
 */
export function evaluateWeekProbes(
  fixture: RealDbCopyFixture,
  db: Database,
  options: { includeSensitiveDebug?: boolean } = {},
): ProbeParityResult[] {
  return (fixture.week_probes ?? []).map((probe) => {
    const actualOrder = getTasksForWeek(db, probe.start_date, probe.end_date).map(
      (task) => task.id,
    );
    return toProbeResult(probe.label, probe.expected_order, actualOrder, options);
  });
}

/**
 * Replay the cultivation cluster/listing probes (CV22.DS7.US3): the cluster
 * probe carries its own memory pool (no DB read, matching the search probe's
 * `_memory_entry` precedent), grading the ordered-cluster-membership shape by
 * flattening each cluster into a comma-joined "id" so the existing flat
 * `orderedIdsMatch`/hash machinery grades BOTH cluster order and
 * within-cluster member order without inventing a second comparison metric.
 * The consolidation-listing probes replay `listConsolidations` over
 * `copied_db_path`, the same seam `evaluateTasksProbes` already reads.
 */
export function evaluateCultivationProbes(
  fixture: RealDbCopyFixture,
  db: Database,
  options: { includeSensitiveDebug?: boolean } = {},
): ProbeParityResult[] {
  const results: ProbeParityResult[] = [];
  const clusterProbe = fixture.cultivation_cluster_probe;
  if (clusterProbe) {
    const clusters = clusterMemories(clusterProbe.memories, clusterProbe.threshold);
    const actualOrder = clusters.map((cluster) => cluster.map((memory) => memory.id).join(","));
    const expectedOrder = clusterProbe.expected_clusters.map((ids) => ids.join(","));
    results.push(toProbeResult(clusterProbe.label, expectedOrder, actualOrder, options));
  }
  for (const probe of fixture.cultivation_consolidation_probes ?? []) {
    const actualOrder = listConsolidations(db, { status: probe.status, limit: probe.limit }).map(
      (consolidation) => consolidation.id,
    );
    results.push(toProbeResult(probe.label, probe.expected_order, actualOrder, options));
  }
  return results;
}

export function evaluatePersonaProbes(
  fixture: RealDbCopyFixture,
  options: { includeSensitiveDebug?: boolean } = {},
): ProbeParityResult[] {
  const personas = fixture.persona_rows ?? [];
  const threshold = fixture.persona_threshold ?? 1.0;
  return (fixture.persona_probes ?? []).map((probe) => {
    const actualOrder = detectPersona(probe.query, personas, threshold).map((hit) => hit.key);
    return toProbeResult(probe.label, probe.expected_order, actualOrder, options);
  });
}

export function renderRedactedReport(results: readonly ProbeParityResult[]): string {
  const lines: string[] = [];
  for (const result of results) {
    lines.push(`probe: ${result.label}`);
    lines.push(`result_count: ${result.resultCount}`);
    lines.push(`python_order_hash: ${result.pythonOrderHash}`);
    lines.push(`ts_order_hash: ${result.tsOrderHash}`);
    lines.push(`match: ${result.match ? "true" : "false"}`);
    lines.push("");
  }
  const passed = results.every((result) => result.match);
  lines.push(`overall_match: ${passed ? "true" : "false"}`);
  return `${lines.join("\n")}\n`;
}
