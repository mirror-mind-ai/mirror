// CV22.DS7.US6 plateau 2 — Soul Mode provisional session state, ported from
// `src/memory/services/soul.py`.
//
// The ritual's fruit lives in `runtime_sessions.metadata`, a JSON TEXT column
// both cores read and write while the strangler runs, so the contract graded by
// `soul-state.golden.json` is the column's exact BYTES:
//
//   * Python serializes with `json.dumps(..., ensure_ascii=False)`, whose
//     separators are `", "` and `": "`. `JSON.stringify` writes neither, so
//     every write here goes through `pythonJsonDumps`.
//   * Clearing the last soul key writes SQL NULL, not `"{}"`.
//   * Clearing against a MISSING session row writes nothing at all -- it must
//     not create the row on the way past.
//   * `harvestFruit` with no argument promotes the maturation fruit and deletes
//     it in the same write; both keys are never present afterwards.
//
// Known limit, inherited and not introduced here: JavaScript objects reorder
// integer-like keys ahead of string keys, while Python dicts preserve insertion
// order for all of them. Mirror's own metadata keys (`soul`, `operating_mode`)
// are unaffected; a column carrying a numeric top-level key -- only reachable
// through corruption or a foreign writer -- would round-trip in a different
// order than Python's. Reproducing that would require an order-preserving JSON
// model across the whole port, which is not this story's scope.

import type { Database, WritableDatabase } from "#db/database.ts";
import {
  decodeMetadata,
  getRuntimeSession,
  resolveRuntimeSessionId,
  upsertRuntimeSession,
} from "#mirror/runtimeSession.ts";
import { pythonJsonDumps } from "#util/pyGenerators.ts";
import { pyStrip } from "#util/pythonText.ts";

export const SOUL_STATE_SESSION_ID = "__global_soul_mode__";
export const SOUL_METADATA_KEY = "soul";
export const FRUIT_METADATA_KEY = "fruit_in_maturation";
export const HARVEST_METADATA_KEY = "harvested_fruit";

export interface SoulFruitState {
  sessionId: string;
  fruit: string | null;
}

/**
 * Port of `resolve_soul_session_id`: explicit (stripped) → `MIRROR_SESSION_ID`
 * (stripped) → the global Soul constant. Always returns an id.
 */
export function resolveSoulSessionId(
  explicitSessionId: string | null = null,
  environmentSessionId: string | null = null,
): string {
  const explicit = pyStrip(explicitSessionId ?? "");
  if (explicit) return explicit;
  return pyStrip(environmentSessionId ?? "") || SOUL_STATE_SESSION_ID;
}

/**
 * Port of `_resolve_cli_soul_session_id`: the operating-mode resolver first,
 * the Soul resolver as the fallback.
 *
 * The two disagree on purpose and the golden pins it. The operating-mode
 * resolver returns an explicit id VERBATIM, so `--session-id "  "` resolves to
 * `"  "`, while the Soul resolver would have stripped it to the global
 * constant. Composing them the other way round would silently retarget a
 * session.
 */
export function resolveCliSoulSessionId(
  db: Database,
  explicitSessionId: string | null = null,
  environmentSessionId: string | null = null,
): string {
  return (
    resolveRuntimeSessionId(db, explicitSessionId, environmentSessionId) ??
    resolveSoulSessionId(explicitSessionId, environmentSessionId)
  );
}

export function getFruitInMaturation(
  db: Database,
  sessionId: string | null = null,
): SoulFruitState {
  return readSoulKey(db, FRUIT_METADATA_KEY, sessionId);
}

export function getHarvestedFruit(db: Database, sessionId: string | null = null): SoulFruitState {
  return readSoulKey(db, HARVEST_METADATA_KEY, sessionId);
}

function readSoulKey(db: Database, key: string, sessionId: string | null): SoulFruitState {
  const resolvedSessionId = resolveSoulSessionId(sessionId);
  const session = getRuntimeSession(db, resolvedSessionId);
  const soul = decodeMetadata(session?.metadata ?? null)[SOUL_METADATA_KEY];
  const value = isRecord(soul) ? soul[key] : undefined;
  const fruit = typeof value === "string" && pyStrip(value) ? pyStrip(value) : null;
  return { sessionId: resolvedSessionId, fruit };
}

export function setFruitInMaturation(
  db: WritableDatabase,
  fruit: string,
  sessionId: string | null,
  nowIso: string,
): SoulFruitState {
  const normalizedFruit = pyStrip(fruit);
  if (!normalizedFruit) throw new SoulStateError("fruit must not be empty");

  const resolvedSessionId = resolveSoulSessionId(sessionId);
  const metadata = readMetadata(db, resolvedSessionId);
  const soul = soulObject(metadata);
  soul[FRUIT_METADATA_KEY] = normalizedFruit;
  metadata[SOUL_METADATA_KEY] = soul;
  upsertRuntimeSession(
    db,
    resolvedSessionId,
    { metadata: pythonJsonDumps(metadata), active: true },
    nowIso,
  );
  return { sessionId: resolvedSessionId, fruit: normalizedFruit };
}

export function harvestFruit(
  db: WritableDatabase,
  input: { fruit?: string | null; sessionId?: string | null },
  nowIso: string,
): SoulFruitState {
  const resolvedSessionId = resolveSoulSessionId(input.sessionId ?? null);
  let finalFruit =
    typeof input.fruit === "string" && pyStrip(input.fruit) ? pyStrip(input.fruit) : null;
  if (finalFruit === null) {
    finalFruit = getFruitInMaturation(db, resolvedSessionId).fruit;
  }
  if (!finalFruit) throw new SoulStateError("harvested fruit must not be empty");

  const metadata = readMetadata(db, resolvedSessionId);
  const soul = soulObject(metadata);
  soul[HARVEST_METADATA_KEY] = finalFruit;
  delete soul[FRUIT_METADATA_KEY];
  metadata[SOUL_METADATA_KEY] = soul;
  upsertRuntimeSession(
    db,
    resolvedSessionId,
    { metadata: pythonJsonDumps(metadata), active: true },
    nowIso,
  );
  return { sessionId: resolvedSessionId, fruit: finalFruit };
}

export function clearFruitInMaturation(
  db: WritableDatabase,
  sessionId: string | null,
  nowIso: string,
): void {
  clearSoulKey(db, FRUIT_METADATA_KEY, sessionId, nowIso);
}

export function clearHarvestedFruit(
  db: WritableDatabase,
  sessionId: string | null,
  nowIso: string,
): void {
  clearSoulKey(db, HARVEST_METADATA_KEY, sessionId, nowIso);
}

/** Port of `_clear_soul_key`, including its two silences. */
function clearSoulKey(
  db: WritableDatabase,
  key: string,
  sessionId: string | null,
  nowIso: string,
): void {
  const resolvedSessionId = resolveSoulSessionId(sessionId);
  const session = getRuntimeSession(db, resolvedSessionId);
  // No row: Python returns before touching the database, so clearing a fruit
  // that was never set must not conjure a session row.
  if (!session) return;

  const metadata = decodeMetadata(session.metadata);
  const soul = metadata[SOUL_METADATA_KEY];
  if (isRecord(soul)) {
    delete soul[key];
    if (Object.keys(soul).length > 0) {
      metadata[SOUL_METADATA_KEY] = soul;
    } else {
      delete metadata[SOUL_METADATA_KEY];
    }
  }
  upsertRuntimeSession(
    db,
    resolvedSessionId,
    { metadata: Object.keys(metadata).length > 0 ? pythonJsonDumps(metadata) : null },
    nowIso,
  );
}

function readMetadata(db: Database, sessionId: string): Record<string, unknown> {
  const session = getRuntimeSession(db, sessionId);
  return decodeMetadata(session?.metadata ?? null);
}

/** Python replaces a non-dict `soul` value with a fresh dict rather than raising. */
function soulObject(metadata: Record<string, unknown>): Record<string, unknown> {
  const existing = metadata[SOUL_METADATA_KEY];
  return isRecord(existing) ? existing : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Python raises `ValueError`; the CLI renders it as `Error: <message>`. */
export class SoulStateError extends Error {}
