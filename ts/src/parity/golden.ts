// Golden-corpus loader and the ordered-id grader (CV22.DS2.TS2).
//
// The golden is produced by `ts/parity/generate_golden.py`, which drives the
// real Python ranker over a synthetic corpus with a frozen clock and frozen
// query embedding. This module is the TS side of that contract: it loads the
// committed fixture and provides the success metric (ordered-id equality).
//
// The ranker that regenerates `expected_order` from the corpus is DS2.US1; this
// harness proves the mechanism (load, decode, compare) is in place and correct.

import { readFileSync } from "node:fs";

/** One synthetic memory in the golden corpus. */
export interface GoldenMemory {
  id: string;
  /** Lexical surface indexed by Python FTS. */
  content: string;
  /** ISO timestamp as written by the Python core. */
  created_at: string;
  /** Python-computed epoch milliseconds for `created_at` (the parity reference). */
  created_at_ms: number | null;
  /** Cached last access timestamp as written by the Python core. */
  last_accessed_at: string | null;
  /** Python-computed epoch milliseconds for `last_accessed_at` (the parity reference). */
  last_accessed_at_ms: number | null;
  /** Honest-reinforcement explicit use count. */
  use_count: number;
  /** Manual relevance signal. */
  relevance_score: number;
  /** Retrieval/access count from `memory_access_log`. */
  access_count: number;
  /** Ordinal lexical score returned by Python `Store.fts_search`. */
  lexical_score: number;
  /** Base64 of the raw little-endian float32 embedding BLOB. */
  embedding_b64: string;
  /** Python-decoded embedding (`np.frombuffer`) — the parity reference for `blobToFloat32`. */
  embedding: number[];
}

/** Frozen inputs and ranker configuration the oracle scored under. */
export interface GoldenMeta {
  query: string;
  query_embedding: number[];
  frozen_now: string;
  frozen_now_ms: number;
  limit: number;
  weights: Record<string, number>;
  mmr_threshold: number;
  recency_half_life_days: number;
  reinforcement_decay_days: number;
  reinforcement_use_weight: number;
  reinforcement_retrieval_weight: number;
}

/** A committed golden fixture: inputs, corpus, and the oracle's ordered answer. */
export interface Golden {
  meta: GoldenMeta;
  memories: GoldenMemory[];
  expected_order: string[];
}

/** Load and minimally validate a committed golden fixture. */
export function loadGolden(path: string): Golden {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Golden;
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    !Array.isArray(parsed.memories) ||
    !Array.isArray(parsed.expected_order) ||
    typeof parsed.meta !== "object"
  ) {
    throw new Error(`malformed golden at ${path}: expected meta, memories[], expected_order[]`);
  }
  return parsed;
}

/**
 * The parity success metric: exact ordered-id equality.
 *
 * Ranked ids, not scores, are compared — Python accumulates in float32 and JS in
 * float64, so scores diverge in the far decimals while the ordering is stable
 * (proven in the DS1 spike). A single flipped pair or a length difference fails.
 */
export function orderedIdsMatch(actual: readonly string[], expected: readonly string[]): boolean {
  if (actual.length !== expected.length) return false;
  return actual.every((id, index) => id === expected[index]);
}
