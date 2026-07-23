// Consolidation persistence + cultivation memory reads (CV22.DS7.US3).
//
// A faithful TypeScript port of `ConsolidationStore`
// (`src/memory/storage/consolidations.py`) plus the two `Store` memory reads
// `consolidate`/`shadow` depend on: `get_all_memories_with_embeddings` (used by
// `consolidate scan`, filtered client-side in Python -- pushed down to SQL here,
// same database-seam philosophy as DS2/US2) and `get_shadow_candidate_memories`
// (used by `shadow scan`). The `consolidations` table and `memories.readiness_state`
// column already exist in the TS-authored schema (DS6) -- no new migration here.

import type { Database, SqlValue, WritableDatabase } from "../db/database.ts";
import { optionalString, requireString } from "../db/rowDecode.ts";

/** A consolidation row, mirroring the Python `Consolidation` model exactly. */
export interface ConsolidationRow {
  id: string;
  action: string; // 'merge' | 'identity_update' | 'shadow_candidate' | 'shadow_observation'
  proposal: string;
  result: string | null;
  source_memory_ids: string; // JSON-encoded array of Memory.id values
  target_layer: string | null;
  target_key: string | null;
  rationale: string | null;
  status: string; // 'pending' | 'accepted' | 'rejected'
  created_at: string;
  reviewed_at: string | null;
}

const CONSOLIDATION_COLUMNS =
  "id, action, proposal, result, source_memory_ids, target_layer, target_key, " +
  "rationale, status, created_at, reviewed_at";

function toConsolidation(row: Record<string, unknown>): ConsolidationRow {
  return {
    id: requireString(row, "id"),
    action: requireString(row, "action"),
    proposal: requireString(row, "proposal"),
    result: optionalString(row, "result"),
    source_memory_ids: requireString(row, "source_memory_ids"),
    target_layer: optionalString(row, "target_layer"),
    target_key: optionalString(row, "target_key"),
    rationale: optionalString(row, "rationale"),
    status: requireString(row, "status"),
    created_at: requireString(row, "created_at"),
    reviewed_at: optionalString(row, "reviewed_at"),
  };
}

// --- Consolidations ----------------------------------------------------------

/** Port of `ConsolidationStore.create_consolidation`. Returns the row as-is. */
export function createConsolidation(
  db: WritableDatabase,
  consolidation: ConsolidationRow,
): ConsolidationRow {
  db.prepare(
    `INSERT INTO consolidations (${CONSOLIDATION_COLUMNS}) ` +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(
    consolidation.id,
    consolidation.action,
    consolidation.proposal,
    consolidation.result,
    consolidation.source_memory_ids,
    consolidation.target_layer,
    consolidation.target_key,
    consolidation.rationale,
    consolidation.status,
    consolidation.created_at,
    consolidation.reviewed_at,
  );
  return consolidation;
}

/** Port of `ConsolidationStore.get_consolidation`. */
export function getConsolidation(db: Database, id: string): ConsolidationRow | null {
  const row = db
    .prepare(`SELECT ${CONSOLIDATION_COLUMNS} FROM consolidations WHERE id = ?`)
    .get(id);
  return row === undefined ? null : toConsolidation(row);
}

/**
 * Port of `ConsolidationStore.update_consolidation_status`: `result` is
 * `COALESCE(?, result)` -- passing `null` preserves the existing `result`
 * (Python's default `result: str | None = None` parameter), matching a
 * `reject` call (no result) leaving `result` untouched.
 */
export function updateConsolidationStatus(
  db: WritableDatabase,
  id: string,
  status: string,
  result: string | null,
  nowIso: string,
): void {
  db.prepare(
    "UPDATE consolidations SET status = ?, result = COALESCE(?, result), reviewed_at = ? WHERE id = ?",
  ).run(status, result, nowIso, id);
}

/** Filters for `listConsolidations`, mirroring the Python signature. */
export interface ListConsolidationsFilters {
  status?: string | null;
  limit?: number;
}

/**
 * Port of `ConsolidationStore.list_consolidations`: a `1=1` seed, an optional
 * `status = ?` clause, `ORDER BY created_at DESC`, trailing `LIMIT ?`.
 */
export function listConsolidations(
  db: Database,
  filters: ListConsolidationsFilters = {},
): ConsolidationRow[] {
  const { status = null, limit = 20 } = filters;
  const conditions = ["1=1"];
  const params: SqlValue[] = [];
  if (status) {
    conditions.push("status = ?");
    params.push(status);
  }
  params.push(limit);
  return db
    .prepare(
      `SELECT ${CONSOLIDATION_COLUMNS} FROM consolidations WHERE ${conditions.join(" AND ")} ` +
        "ORDER BY created_at DESC LIMIT ?",
    )
    .all(...params)
    .map(toConsolidation);
}

/**
 * Port of the `_resolve_proposal` helper duplicated in both
 * `cli/consolidate_cmd.py` and `cli/shadow_cmd.py`: exact id first, else a
 * first-match-wins scan (by `created_at DESC` order) over the most recent 200
 * consolidations. Deliberately kept SEPARATE from `resolveTaskByIdOrPrefix`
 * (US2): Python itself has no ambiguous-match branch here (unlike tasks) --
 * the first prefix hit in listing order simply wins, so unifying the two
 * resolvers would invent a branch Python does not have.
 */
export function resolveProposalByIdOrPrefix(
  db: Database,
  idOrPrefix: string,
): ConsolidationRow | null {
  const exact = getConsolidation(db, idOrPrefix);
  if (exact) return exact;
  const recent = listConsolidations(db, { limit: 200 });
  return recent.find((item) => item.id.startsWith(idOrPrefix)) ?? null;
}

// --- Memory readiness ---------------------------------------------------------

/**
 * Port of `ConsolidationStore.update_memory_readiness_state`. Valid states:
 * observed | candidate | surfaced | acknowledged | integrated. One statement,
 * one implicit commit -- callers must NOT wrap a sequence of these (plus a
 * sibling write) in an explicit transaction; Python commits each call
 * separately and the port preserves that commit boundary exactly.
 */
export function updateMemoryReadinessState(
  db: WritableDatabase,
  memoryId: string,
  state: string,
): void {
  db.prepare("UPDATE memories SET readiness_state = ? WHERE id = ?").run(state, memoryId);
}

// --- Cultivation memory reads --------------------------------------------------

/** The memory projection cultivation formatting needs, shared by both scans. */
export interface CultivationMemory {
  id: string;
  memory_type: string;
  layer: string;
  title: string;
  content: string;
  context: string | null;
  journey: string | null;
  created_at: string;
  readiness_state: string;
}

/** A cultivation memory with its embedding, for clustering (`consolidate scan`). */
export interface CultivationMemoryWithEmbedding extends CultivationMemory {
  embedding_b64: string;
}

const CULTIVATION_COLUMNS_BASE =
  "id, memory_type, layer, title, content, context, journey, created_at, readiness_state";

function toCultivationMemory(row: Record<string, unknown>): CultivationMemory {
  return {
    id: requireString(row, "id"),
    memory_type: requireString(row, "memory_type"),
    layer: requireString(row, "layer"),
    title: requireString(row, "title"),
    content: requireString(row, "content"),
    context: optionalString(row, "context"),
    journey: optionalString(row, "journey"),
    created_at: requireString(row, "created_at"),
    readiness_state: requireString(row, "readiness_state"),
  };
}

/** Optional equality filters for the cultivation memory reads. */
export interface CultivationMemoryFilters {
  journey?: string | null;
  layer?: string | null;
}

/**
 * Port of `Store.get_all_memories_with_embeddings`, plus the `--journey`/
 * `--layer` filters `consolidate_cmd.cmd_scan` applies client-side in Python
 * -- pushed down into the SQL `WHERE` here (same result set, DS2/US2's
 * query-builder philosophy). `ORDER BY created_at DESC`, matching Python.
 */
export function getMemoriesWithEmbeddingsForCultivation(
  db: Database,
  filters: CultivationMemoryFilters = {},
): CultivationMemoryWithEmbedding[] {
  const conditions = ["embedding IS NOT NULL"];
  const params: SqlValue[] = [];
  if (filters.journey) {
    conditions.push("journey = ?");
    params.push(filters.journey);
  }
  if (filters.layer) {
    conditions.push("layer = ?");
    params.push(filters.layer);
  }
  return db
    .prepare(
      `SELECT ${CULTIVATION_COLUMNS_BASE}, embedding FROM memories ` +
        `WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`,
    )
    .all(...params)
    .map((row) => {
      const embedding = row.embedding;
      if (!(embedding instanceof Uint8Array)) {
        throw new Error("memory embedding must be a BLOB/Uint8Array");
      }
      return {
        ...toCultivationMemory(row),
        embedding_b64: Buffer.from(embedding).toString("base64"),
      };
    });
}

/** Filters for `getShadowCandidateMemories`, mirroring the Python signature. */
export interface ShadowCandidateFilters {
  readinessStates?: readonly string[];
  limit?: number;
}

const DEFAULT_SHADOW_READINESS_STATES: readonly string[] = ["observed", "candidate"];

/**
 * Port of `Store.get_shadow_candidate_memories`: memories with `layer =
 * 'shadow'` OR `memory_type IN ('tension', 'pattern')`, restricted to the
 * given readiness states (default `observed`/`candidate`), `ORDER BY
 * created_at DESC LIMIT ?`. No embedding requirement -- shadow candidates need
 * not have been embedded.
 */
export function getShadowCandidateMemories(
  db: Database,
  filters: ShadowCandidateFilters = {},
): CultivationMemory[] {
  const readinessStates = filters.readinessStates ?? DEFAULT_SHADOW_READINESS_STATES;
  const limit = filters.limit ?? 100;
  const placeholders = readinessStates.map(() => "?").join(", ");
  const params: SqlValue[] = [...readinessStates, limit];
  return db
    .prepare(
      `SELECT ${CULTIVATION_COLUMNS_BASE} FROM memories ` +
        "WHERE (layer = 'shadow' OR memory_type IN ('tension', 'pattern')) " +
        `AND readiness_state IN (${placeholders}) ` +
        "ORDER BY created_at DESC LIMIT ?",
    )
    .all(...params)
    .map(toCultivationMemory);
}
