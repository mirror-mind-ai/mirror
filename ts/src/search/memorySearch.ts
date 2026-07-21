import type { SqlValue, WritableDatabase } from "../db/database.ts";
import { optionalNumber, optionalString, requireString } from "../db/rowDecode.ts";
import { logAccess } from "../memory/reinforcement.ts";
import { logLlmCall } from "../observability/llmCalls.ts";
import { resolveEmbeddingModel } from "../providers/config.ts";
import {
  type EmbeddingAttemptInfo,
  type EmbeddingProvider,
  generateEmbeddingSafely,
} from "../providers/embedding.ts";
import { nowIso } from "../util/pyGenerators.ts";
import {
  type RankableMemory,
  type RankedMemory,
  type RankerConfig,
  rankMemories,
} from "./ranker.ts";

export interface FreshSearchFilters {
  memoryType?: string | null;
  layer?: string | null;
  journey?: string | null;
}

export interface FreshSearchOptions extends FreshSearchFilters {
  query: string;
  limit?: number;
  frozenNowMs?: number;
  now?: string;
  provider: EmbeddingProvider;
  /** Test-injectable override for generateEmbeddingSafely's retry backoff
   * (real timers by default) -- avoids paying real backoff wait time in tests
   * that exercise the transient-retry path. */
  embeddingRetrySleep?: (ms: number) => Promise<void>;
}

export interface FreshSearchResult extends RankedMemory {}

export interface FreshSearchOutcome {
  results: FreshSearchResult[];
  degraded: boolean;
}

export const DEFAULT_SEARCH_RANKER_CONFIG = {
  weights: { semantic: 0.5, recency: 0.15, reinforcement: 0.1, relevance: 0.1, lexical: 0.15 },
  mmrThreshold: 0.92,
  recencyHalfLifeDays: 90,
  reinforcementDecayDays: 180,
  reinforcementUseWeight: 0.7,
  reinforcementRetrievalWeight: 0.3,
} satisfies Omit<RankerConfig, "queryEmbedding" | "frozenNowMs" | "limit">;

interface MemoryRow {
  id: string;
  created_at: string;
  last_accessed_at: string | null;
  use_count: number;
  relevance_score: number;
  embedding_b64: string;
}

/**
 * Hybrid search that also reports whether it ran degraded (lexical-only),
 * mirroring Python's `search_with_status` (AI-04, CV9.E2.S10).
 *
 * When the query embedding cannot be generated (offline, missing key,
 * timeout) the search falls back to the local FTS5 index: the semantic term
 * is dropped (an empty `queryEmbedding` makes `cosineSimilarity`'s zero-norm
 * path return 0 for every candidate, so `ranker.ts` needs no change) and only
 * FTS-matched memories are ranked -- a hard filter, not just a lower score,
 * matching Python's `mem.id not in fts_lookup: continue`. MMR dedup is
 * unaffected -- it ranks on the stored memory embeddings, not the query.
 */
export async function searchMemoriesWithStatus(
  db: WritableDatabase,
  options: FreshSearchOptions,
): Promise<FreshSearchOutcome> {
  const limit = options.limit ?? 5;
  let queryEmbedding: readonly number[] = [];
  let degraded = false;
  try {
    // generateEmbeddingSafely (CR043) retries a transient empty response up to
    // its default budget before giving up -- matching Python's search, which
    // calls the same generate_embedding used everywhere else, not a bespoke
    // single-shot attempt. Any exhausted/permanent/provider-exception failure
    // still maps to degraded=true here, preserving CR037's contract exactly.
    queryEmbedding = await generateEmbeddingSafely(options.provider, options.query, {
      onAttempt: logQueryEmbeddingAttempt(db),
      sleep: options.embeddingRetrySleep,
    });
  } catch {
    degraded = true;
  }

  const memories = listSearchMemoryRows(db, options);
  const accessCounts = accessCountsByMemoryId(
    db,
    memories.map((memory) => memory.id),
  );
  const lexicalScores = ftsLexicalScores(db, options.query, options);

  const candidateMemories = degraded
    ? memories.filter((memory) => lexicalScores.has(memory.id))
    : memories;
  const rankable = candidateMemories.map(
    (memory): RankableMemory => ({
      ...memory,
      access_count: accessCounts.get(memory.id) ?? 0,
      lexical_score: lexicalScores.get(memory.id) ?? 0,
    }),
  );
  const ranked = rankMemories(rankable, {
    ...DEFAULT_SEARCH_RANKER_CONFIG,
    queryEmbedding,
    frozenNowMs: options.frozenNowMs ?? Date.now(),
    limit,
  });

  // Reinforce only on genuine context loads. This mirrors Python's log_access
  // param (AI-12) firing regardless of degraded status -- the two concerns are
  // orthogonal and intentionally not coupled; do not make this conditional.
  const accessNow = options.now ?? nowIso();
  for (const result of ranked) {
    logAccess(db, result.id, accessNow, options.query.slice(0, 200));
  }
  return { results: ranked, degraded };
}

/** Thin, non-breaking wrapper over `searchMemoriesWithStatus`, mirroring
 * Python's `search()` over `search_with_status()`: existing callers keep the
 * plain-array shape, and an embedding failure no longer propagates uncaught. */
export async function searchMemories(
  db: WritableDatabase,
  options: FreshSearchOptions,
): Promise<FreshSearchResult[]> {
  return (await searchMemoriesWithStatus(db, options)).results;
}

export function listSearchMemoryRows(
  db: WritableDatabase,
  filters: FreshSearchFilters = {},
): MemoryRow[] {
  const conditions = ["embedding IS NOT NULL"];
  const params: SqlValue[] = [];
  if (filters.memoryType) {
    conditions.push("memory_type = ?");
    params.push(filters.memoryType);
  }
  if (filters.layer) {
    conditions.push("layer = ?");
    params.push(filters.layer);
  }
  if (filters.journey) {
    conditions.push("journey = ?");
    params.push(filters.journey);
  }

  return db
    .prepare(
      `SELECT id, created_at, last_accessed_at, use_count, relevance_score, embedding ` +
        `FROM memories WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`,
    )
    .all(...params)
    .map(toMemoryRow);
}

export function accessCountsByMemoryId(
  db: WritableDatabase,
  memoryIds: readonly string[],
): Map<string, number> {
  if (memoryIds.length === 0) return new Map();
  const placeholders = memoryIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT memory_id, COUNT(*) AS count FROM memory_access_log ` +
        `WHERE memory_id IN (${placeholders}) GROUP BY memory_id`,
    )
    .all(...memoryIds);
  const counts = new Map(memoryIds.map((id): [string, number] => [id, 0]));
  for (const row of rows) {
    counts.set(requireString(row, "memory_id"), Number(row.count));
  }
  return counts;
}

export function ftsLexicalScores(
  db: WritableDatabase,
  query: string,
  filters: FreshSearchFilters = {},
  limit = 100,
): Map<string, number> {
  const safeQuery = ftsQuery(query);
  if (!safeQuery) return new Map();
  const conditions: string[] = [];
  const params: SqlValue[] = [safeQuery];
  if (filters.memoryType) {
    conditions.push("m.memory_type = ?");
    params.push(filters.memoryType);
  }
  if (filters.layer) {
    conditions.push("m.layer = ?");
    params.push(filters.layer);
  }
  if (filters.journey) {
    conditions.push("m.journey = ?");
    params.push(filters.journey);
  }
  params.push(limit);
  const whereExtra = conditions.length > 0 ? ` AND ${conditions.join(" AND ")}` : "";
  try {
    const rows = db
      .prepare(
        `SELECT m.id FROM memories_fts f ` +
          `JOIN memories m ON m.rowid = f.rowid ` +
          `WHERE memories_fts MATCH ?${whereExtra} ` +
          `ORDER BY bm25(memories_fts) LIMIT ?`,
      )
      .all(...params);
    return new Map(rows.map((row, index) => [requireString(row, "id"), 1 / (1 + index)]));
  } catch {
    return new Map();
  }
}

export function ftsQuery(query: string): string {
  const words = query
    .split(/\s+/)
    .map((word) => word.replaceAll('"', ""))
    .filter((word) => word.length > 0);
  return words.map((word) => `"${word}"`).join(" ");
}

/** Wires generateEmbeddingSafely's onAttempt hook to the llm_calls ledger
 * (AI-09/D-003), reusing CR040's fail-soft logLlmCall unchanged. The query
 * text is not stored (not tied to a conversation), so no conversationId. */
function logQueryEmbeddingAttempt(db: WritableDatabase): (info: EmbeddingAttemptInfo) => void {
  return (info) => {
    logLlmCall(db, {
      role: "embedding",
      model: resolveEmbeddingModel(),
      prompt: info.text,
      response: "",
      latencyMs: info.latencyMs,
    });
  };
}

function toMemoryRow(row: Record<string, unknown>): MemoryRow {
  const embedding = row.embedding;
  if (!(embedding instanceof Uint8Array)) {
    throw new Error("memory embedding must be a BLOB/Uint8Array");
  }
  return {
    id: requireString(row, "id"),
    created_at: requireString(row, "created_at"),
    last_accessed_at: optionalString(row, "last_accessed_at"),
    use_count: optionalNumber(row, "use_count") ?? 0,
    relevance_score: optionalNumber(row, "relevance_score") ?? 0,
    embedding_b64: Buffer.from(embedding).toString("base64"),
  };
}
