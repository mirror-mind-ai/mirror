import { createHash } from "node:crypto";
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
