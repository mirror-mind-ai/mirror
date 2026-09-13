// CV22.DS7.US8 plateau 1 — which Builder method a journey has adopted.
//
// Port of `src/memory/builder/method_adoption.py`. All of Builder's state lives
// in `runtime_sessions` rows keyed by a prefix, and this is the simplest one: a
// single-field JSON payload under `__builder_method_adoption__:<journey>`.
//
// Reader, writer, and clear land TOGETHER even though plateau 1 only needs the
// read. The rule that keeps D2's revert honest is that a TS write must produce
// the bytes Python would write for the same state, and splitting a serializer
// from its parser across plateaus is how that stops being checkable. The
// delivery cursor stays in plateau 2 because it carries compare-and-swap,
// generations, and the preauthorization receipt; this row carries one key.
//
// Python writes `json.dumps({"method": ...}, ensure_ascii=False)`, which for a
// single ASCII key is `{"method": "ariad"}` — note the space after the colon,
// Python's default separator and NOT `JSON.stringify`'s output.

import type { Database, WritableDatabase } from "#db/database.ts";
import { getRuntimeSession, upsertRuntimeSession } from "#mirror/runtimeSession.ts";
import { pythonJsonDumps } from "#util/pyGenerators.ts";

const ADOPTION_SESSION_PREFIX = "__builder_method_adoption__:";

/** Python `_session_id`. */
export function adoptionSessionId(journey: string): string {
  return `${ADOPTION_SESSION_PREFIX}${journey}`;
}

/** Python `_normalize_journey`: strip, and refuse empty. */
function normalizeJourney(journey: string): string {
  const normalized = typeof journey === "string" ? journey.trim() : "";
  if (!normalized) throw new Error("journey must not be empty");
  return normalized;
}

/** Python `_normalize_method`: strip, and refuse empty. */
function normalizeMethod(method: string): string {
  const normalized = typeof method === "string" ? method.trim() : "";
  if (!normalized) throw new Error("method must not be empty");
  return normalized;
}

export interface BuilderMethodAdoption {
  readonly journey: string;
  readonly method: string;
}

/**
 * Python `get_adopted_method`: `None` unless the row exists, is active, has
 * metadata, parses as a JSON object, and carries a non-empty string `method`.
 *
 * Every one of those is a silent `None` rather than an error, so a corrupted row
 * reads as "not adopted" instead of failing Builder activation.
 */
export function getAdoptedMethod(db: Database, journey: string): string | null {
  const normalizedJourney = normalizeJourney(journey);
  const session = getRuntimeSession(db, adoptionSessionId(normalizedJourney));
  if (!session?.active || !session.metadata) return null;
  let data: unknown;
  try {
    data = JSON.parse(session.metadata);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const method = (data as Record<string, unknown>).method;
  if (typeof method !== "string") return null;
  const normalized = method.trim();
  return normalized || null;
}

/** Python `set_adopted_method`. */
export function setAdoptedMethod(
  db: WritableDatabase,
  journey: string,
  method: string,
  nowIso: () => string,
): BuilderMethodAdoption {
  const normalizedJourney = normalizeJourney(journey);
  const normalizedMethod = normalizeMethod(method);
  upsertRuntimeSession(
    db,
    adoptionSessionId(normalizedJourney),
    {
      interface: "builder_method_adoption",
      journey: normalizedJourney,
      active: true,
      metadata: pythonJsonDumps({ method: normalizedMethod }),
    },
    nowIso(),
  );
  return { journey: normalizedJourney, method: normalizedMethod };
}

/** Python `clear_adopted_method`: deactivate the row and null its metadata. */
export function clearAdoptedMethod(
  db: WritableDatabase,
  journey: string,
  nowIso: () => string,
): void {
  const normalizedJourney = normalizeJourney(journey);
  upsertRuntimeSession(
    db,
    adoptionSessionId(normalizedJourney),
    {
      interface: "builder_method_adoption",
      journey: normalizedJourney,
      active: false,
      metadata: null,
    },
    nowIso(),
  );
}
