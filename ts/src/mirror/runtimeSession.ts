import type { Database, WritableDatabase } from "#db/database.ts";

export const GLOBAL_STICKY_DEFAULTS_SESSION_ID = "__global_sticky_defaults__";
export const GLOBAL_OPERATING_MODE_SESSION_ID = "__global_operating_mode__";

export interface RuntimeSessionRow {
  sessionId: string;
  conversationId: string | null;
  interface: string | null;
  mirrorActive: boolean;
  persona: string | null;
  journey: string | null;
  hookInjected: boolean;
  active: boolean;
  startedAt: string;
  updatedAt: string;
  closedAt: string | null;
  metadata: string | null;
}

export interface RuntimeSessionPatch {
  conversationId?: string | null;
  interface?: string | null;
  mirrorActive?: boolean;
  persona?: string | null;
  journey?: string | null;
  hookInjected?: boolean;
  active?: boolean;
  closedAt?: string | null;
  metadata?: string | null;
}

export function getRuntimeSession(db: Database, sessionId: string): RuntimeSessionRow | null {
  const row = db.prepare("SELECT * FROM runtime_sessions WHERE session_id = ?").get(sessionId);
  if (!row) return null;
  return {
    sessionId: String(row.session_id),
    conversationId: nullableString(row.conversation_id),
    interface: nullableString(row.interface),
    mirrorActive: Boolean(row.mirror_active),
    persona: nullableString(row.persona),
    journey: nullableString(row.journey),
    hookInjected: Boolean(row.hook_injected),
    active: Boolean(row.active),
    startedAt: String(row.started_at),
    updatedAt: String(row.updated_at),
    closedAt: nullableString(row.closed_at),
    metadata: nullableString(row.metadata),
  };
}

export function upsertRuntimeSession(
  db: WritableDatabase,
  sessionId: string,
  patch: RuntimeSessionPatch,
  nowIso: string,
): RuntimeSessionRow {
  const existing = getRuntimeSession(db, sessionId);
  const value = <K extends keyof RuntimeSessionPatch>(
    key: K,
    fallback: RuntimeSessionRow[keyof RuntimeSessionRow],
  ) => (patch[key] === undefined ? fallback : patch[key]);
  const row: RuntimeSessionRow = {
    sessionId,
    conversationId: value("conversationId", existing?.conversationId ?? null) as string | null,
    interface: value("interface", existing?.interface ?? null) as string | null,
    mirrorActive: value("mirrorActive", existing?.mirrorActive ?? false) as boolean,
    persona: value("persona", existing?.persona ?? null) as string | null,
    journey: value("journey", existing?.journey ?? null) as string | null,
    hookInjected: value("hookInjected", existing?.hookInjected ?? false) as boolean,
    active: value("active", existing?.active ?? true) as boolean,
    startedAt: existing?.startedAt ?? nowIso,
    updatedAt: nowIso,
    closedAt: value("closedAt", existing?.closedAt ?? null) as string | null,
    metadata: value("metadata", existing?.metadata ?? null) as string | null,
  };
  db.prepare(
    `INSERT INTO runtime_sessions
       (session_id, conversation_id, interface, mirror_active, persona, journey,
        hook_injected, active, started_at, updated_at, closed_at, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       conversation_id = excluded.conversation_id,
       interface = excluded.interface,
       mirror_active = excluded.mirror_active,
       persona = excluded.persona,
       journey = excluded.journey,
       hook_injected = excluded.hook_injected,
       active = excluded.active,
       updated_at = excluded.updated_at,
       closed_at = excluded.closed_at,
       metadata = excluded.metadata`,
  ).run(
    row.sessionId,
    row.conversationId,
    row.interface,
    Number(row.mirrorActive),
    row.persona,
    row.journey,
    Number(row.hookInjected),
    Number(row.active),
    row.startedAt,
    row.updatedAt,
    row.closedAt,
    row.metadata,
  );
  return row;
}

/**
 * Python `compare_and_swap_runtime_session_metadata` (CV22.DS7.US8 plateau 2).
 *
 * Replace `metadata` only while it still equals the caller's observed value, and
 * report whether the swap happened. The match is STRING EQUALITY on the stored
 * metadata, which is what makes the delivery cursor's serialization a contract
 * rather than a detail: a cursor written with different bytes for the same state
 * cannot be swapped, so a cursor the Python engine wrote -- every database from
 * before CV22.DS10.TS5 carries them -- would fail its first TypeScript write.
 *
 * The WHERE clause also requires `active = 1`, so a cleared row can never be
 * swapped back into place.
 */
export function compareAndSwapRuntimeSessionMetadata(
  db: WritableDatabase,
  sessionId: string,
  options: { expectedMetadata: string; metadata: string },
  nowIso: string,
): boolean {
  const result = db
    .prepare(
      `UPDATE runtime_sessions
          SET metadata = ?, updated_at = ?
        WHERE session_id = ? AND active = 1 AND metadata = ?`,
    )
    .run(options.metadata, nowIso, sessionId, options.expectedMetadata);
  return Number(result.changes) === 1;
}

/**
 * The session a caller was TOLD about: `--session-id`, else `MIRROR_SESSION_ID`.
 * `null` means nobody named one. It never guesses, so it is the only resolver a
 * caller may bind a journey or write project state on (CR008).
 */
export function resolveNamedRuntimeSessionId(
  explicitSessionId: string | null,
  environmentSessionId: string | null = null,
): string | null {
  if (explicitSessionId?.trim()) return explicitSessionId;
  if (environmentSessionId?.trim()) return environmentSessionId.trim();
  return null;
}

/**
 * A named session if there is one, else a GUESS: the most recently updated active
 * row that is not a global pseudo-session.
 *
 * The guess is usually the active window, because the Pi extension logs each
 * prompt under its own session id before any tool runs. It is wrong under
 * interleaving (another window's prompt in between), and delivery-cursor rows
 * qualify, so a lifecycle write can make a cursor "the session". Builder binding
 * stopped using it in CR008; the callers that still do are CR100's.
 */
export function resolveRuntimeSessionId(
  db: Database,
  explicitSessionId: string | null,
  environmentSessionId: string | null = null,
): string | null {
  return (
    resolveNamedRuntimeSessionId(explicitSessionId, environmentSessionId) ??
    guessRuntimeSessionId(db)
  );
}

function guessRuntimeSessionId(db: Database): string | null {
  const row = db
    .prepare(
      `SELECT session_id FROM runtime_sessions
       WHERE active = 1
         AND session_id NOT IN (?, ?)
         AND interface IS NOT NULL
         AND interface != 'global_defaults'
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
    .get(GLOBAL_OPERATING_MODE_SESSION_ID, GLOBAL_STICKY_DEFAULTS_SESSION_ID);
  return row ? String(row.session_id) : null;
}

export function decodeMetadata(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
