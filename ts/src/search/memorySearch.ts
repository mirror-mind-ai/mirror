import type { Database, SqlValue, WritableDatabase } from "#db/database.ts";
import { optionalNumber, optionalString, requireString } from "#db/rowDecode.ts";
import { logAccess } from "#memory/reinforcement.ts";
import { embeddingLedgerHook } from "#observability/ledgerHooks.ts";
import { ProviderConfigError } from "#providers/config.ts";
import {
  type EmbeddingAttemptInfo,
  EmbeddingError,
  type EmbeddingProvider,
  generateEmbeddingSafely,
} from "#providers/embedding.ts";
import { LlmTransportError } from "#providers/openrouter.ts";
import { nowIso } from "#util/pyGenerators.ts";
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
  /**
   * Reinforce retrieval for the returned memories. Default `true`, mirroring
   * Python's `log_access: bool = True`.
   *
   * `access_count` feeds `reinforcement_score` and the hybrid ranker, so a
   * caller that searches on the system's behalf rather than the user's must opt
   * out -- otherwise the ranker learns from its own exhaust (AI-12). Python's
   * non-genuine callers pass `log_access=False`: the curation pass, the MCP
   * agent search, and `memories --search`. Builder context load keeps the
   * default and still reinforces, because that one is a genuine load.
   */
  logAccess?: boolean;
  /**
   * Record each embedding attempt in the `llm_calls` ledger (AI-09/D-003).
   * Default `true`.
   *
   * - `true`/unset -- write through `db`, which must be writable.
   * - `false` -- record nothing.
   * - a function -- record through that sink, leaving `db` untouched.
   *
   * The sink exists for the MCP server (CV22.DS9.TS2 D1), whose tools hold a
   * driver-level READ-ONLY handle while its single sanctioned write goes to a
   * separate `llm_calls`-only connection. Passing a function rather than a
   * second handle keeps that connection out of this module and out of every
   * tool: search never learns it exists.
   */
  recordEmbeddingLedger?: boolean | ((info: EmbeddingAttemptInfo) => void);
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
  /**
   * Metadata-only cause of a degraded search: the transport taxonomy kind, or
   * `config` when no key is set. Never a message, never the query -- this is
   * written to the front-door log, which forbids payloads (RS005/CR026).
   */
  degradedKind?: string;
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
  db: Database,
  options: FreshSearchOptions,
): Promise<FreshSearchOutcome> {
  const limit = options.limit ?? 5;
  let queryEmbedding: readonly number[] = [];
  let degraded = false;
  let degradedKind: string | undefined;
  try {
    // generateEmbeddingSafely (CR043) retries a transient empty response up to
    // its default budget before giving up -- matching Python's search, which
    // calls the same generate_embedding used everywhere else, not a bespoke
    // single-shot attempt. Any exhausted/permanent/provider-exception failure
    // still maps to degraded=true here, preserving CR037's contract exactly.
    queryEmbedding = await generateEmbeddingSafely(options.provider, options.query, {
      onAttempt: resolveLedgerSink(db, options.recordEmbeddingLedger),
      sleep: options.embeddingRetrySleep,
    });
  } catch (error) {
    degraded = true;
    // Keep the CLASS of failure (AI-18 taxonomy) so an operator can tell an
    // expired key from a timeout from a rate limit. Without this the front
    // door only ever says "offline or no API key", which is a guess -- and
    // the taxonomy the live transport builds would die here unseen.
    degradedKind = classifyDegradedCause(error);
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
  if (options.logAccess ?? true) {
    const writable = asWritable(db, "logAccess");
    const accessNow = options.now ?? nowIso();
    for (const result of ranked) {
      logAccess(writable, result.id, accessNow, options.query.slice(0, 200));
    }
  }
  return { results: ranked, degraded, degradedKind };
}

/** Thin, non-breaking wrapper over `searchMemoriesWithStatus`, mirroring
 * Python's `search()` over `search_with_status()`: existing callers keep the
 * plain-array shape, and an embedding failure no longer propagates uncaught. */
export async function searchMemories(
  db: Database,
  options: FreshSearchOptions,
): Promise<FreshSearchResult[]> {
  return (await searchMemoriesWithStatus(db, options)).results;
}

export function listSearchMemoryRows(db: Database, filters: FreshSearchFilters = {}): MemoryRow[] {
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
  db: Database,
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
  db: Database,
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

/**
 * Narrow a handle to a writable one, or fail with the option that asked for it.
 *
 * Search reads through a plain `Database` so a read-only caller (the MCP
 * server) can use it. The two paths that WRITE -- reinforcement and the
 * embedding ledger -- are opt-in, and asking for either with a read-only handle
 * is a caller bug worth naming rather than a SQLite error to decode.
 */
function asWritable(db: Database, requestedBy: string): WritableDatabase {
  if (typeof (db as WritableDatabase).exec !== "function") {
    throw new Error(`${requestedBy} requires a writable database handle; this one is read-only`);
  }
  return db as WritableDatabase;
}

/** The query embedding's ledger row (AI-09/D-003). The query text is not tied
 * to a conversation, so no conversationId travels with it. */
function logQueryEmbeddingAttempt(db: WritableDatabase): (info: EmbeddingAttemptInfo) => void {
  return embeddingLedgerHook(db);
}

/**
 * Resolve where an embedding attempt is recorded: `db` by default, nowhere when
 * disabled, or a caller-supplied sink. Only the default narrows `db` to a
 * writable handle -- a caller passing a sink may hold a read-only one.
 */
function resolveLedgerSink(
  db: Database,
  record: boolean | ((info: EmbeddingAttemptInfo) => void) | undefined,
): ((info: EmbeddingAttemptInfo) => void) | undefined {
  if (typeof record === "function") return record;
  if (record === false) return undefined;
  return logQueryEmbeddingAttempt(asWritable(db, "recordEmbeddingLedger"));
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

/**
 * Reduce a degraded-search cause to a short, content-free category
 * (CV22.DS8.US1). Only the CLASS travels: provider messages can echo request
 * content, and the front-door log forbids payloads.
 */
function classifyDegradedCause(error: unknown): string {
  if (error instanceof ProviderConfigError) return "config";
  if (error instanceof LlmTransportError) return error.kind;
  if (error instanceof EmbeddingError) {
    // generateEmbeddingSafely wraps a provider exception; the inner kind is
    // gone by then, so the honest answer is the layer that failed.
    return error.permanent ? "embedding_permanent" : "embedding_exhausted";
  }
  return "unknown";
}
