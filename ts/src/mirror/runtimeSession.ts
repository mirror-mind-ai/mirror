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
    active: value("active", existing?.active ?? true) as boolean,
    startedAt: existing?.startedAt ?? nowIso,
    updatedAt: nowIso,
    closedAt: value("closedAt", existing?.closedAt ?? null) as string | null,
    metadata: value("metadata", existing?.metadata ?? null) as string | null,
  };
  db.prepare(
    `INSERT INTO runtime_sessions
       (session_id, conversation_id, interface, mirror_active, persona, journey,
        active, started_at, updated_at, closed_at, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       conversation_id = excluded.conversation_id,
       interface = excluded.interface,
       mirror_active = excluded.mirror_active,
       persona = excluded.persona,
       journey = excluded.journey,
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
 * Columns the doorman moves one at a time (CV9.DS8.TS2).
 *
 * `upsertRuntimeSession` reads the row, rebuilds it, and writes every column
 * back, with no transaction around the read and the write. Two writers on the
 * same turn -- the prompt logger setting `conversation_id`/`active`, the doorman
 * setting `persona` -- would each overwrite the other's column with the stale
 * copy it read. A single-column UPDATE touches nothing it was not asked to.
 */
export interface RuntimeSessionColumnPatch {
  persona?: string | null;
  /** The whole metadata JSON, as the caller re-dumped it after its own read. */
  metadata?: string | null;
}

/** Set only the named columns on an existing row; false when there is no row. */
export function updateRuntimeSessionColumns(
  db: WritableDatabase,
  sessionId: string,
  patch: RuntimeSessionColumnPatch,
  nowIso: string,
): boolean {
  const assignments: string[] = [];
  const params: (string | number | null)[] = [];
  if (patch.persona !== undefined) {
    assignments.push("persona = ?");
    params.push(patch.persona);
  }
  if (patch.metadata !== undefined) {
    assignments.push("metadata = ?");
    params.push(patch.metadata);
  }
  if (assignments.length === 0) return false;
  assignments.push("updated_at = ?");
  params.push(nowIso, sessionId);
  const result = db
    .prepare(`UPDATE runtime_sessions SET ${assignments.join(", ")} WHERE session_id = ?`)
    .run(...params);
  return Number(result.changes) === 1;
}

/**
 * The session the harness named in the environment (CV9.DS8.TS1, measured
 * 2026-10-24): `MIRROR_SESSION_ID`, which the Pi extension sets at
 * `session_start`; else `CLAUDE_CODE_SESSION_ID` (Claude Code 2.1.310) or
 * `CODEX_SESSION_ID` (Codex 0.164.0), both undocumented, both equal to the
 * session row the runtime's hooks write, both present in the model's own shell
 * -- so a `mirror mirror load` the model runs by itself names the same session
 * the hooks do. One reader, as `runtimeDetection` reads Grok's variables.
 *
 * Read by the mirror load route and the doorman only (TS2): widening it to the
 * Builder, Soul, and Explorer routes would bind those sessions on Claude Code
 * and Codex too, a CR008 question a later story may open.
 */
export function environmentSessionId(
  env: Readonly<Record<string, string | undefined>>,
): string | null {
  for (const name of ["MIRROR_SESSION_ID", "CLAUDE_CODE_SESSION_ID", "CODEX_SESSION_ID"]) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  return null;
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
