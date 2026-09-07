// Shared scaffolding for the slice-E backfill goldens
// (`ts/parity/generate_backfill_golden.py`): the same fixture corpus, the
// same frozen clock, and the same state projection the generator records.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { LoggerDeps } from "#conversation/logger.ts";
import type { WritableDatabase } from "#db/database.ts";

export const BACKFILL_FIXTURES = join(import.meta.dirname, "..", "fixtures", "backfill");
export const PI_SESSIONS_DIR = join(BACKFILL_FIXTURES, "pi-sessions");
export const CODEX_DIR = join(BACKFILL_FIXTURES, "codex");
export const TRANSCRIPT_PATH = join(BACKFILL_FIXTURES, "transcript", "session.jsonl");

const GOLDEN_PATH = join(import.meta.dirname, "..", "goldens", "backfill.golden.json");
const SESSIONS_DIR_PLACEHOLDER = "<sessions_dir>";

export interface MessageState {
  role: string;
  content: string;
  created_at: string;
  token_count: number | null;
  metadata: string | null;
}

export interface ConversationState {
  id: string;
  title: string | null;
  started_at: string;
  ended_at: string | null;
  interface: string;
  persona: string | null;
  journey: string | null;
  summary: string | null;
  tags: string | null;
  metadata_raw: string | null;
  messages: MessageState[];
}

export interface RuntimeSessionState {
  session_id: string;
  conversation_id: string | null;
  interface: string | null;
  mirror_active: number;
  persona: string | null;
  journey: string | null;
  hook_injected: number;
  active: number;
  started_at: string;
  updated_at: string;
  closed_at: string | null;
  metadata: string | null;
}

export interface BackfillState {
  conversations: ConversationState[];
  runtime_sessions: RuntimeSessionState[];
}

export interface BackfillGolden {
  meta: { now: string };
  pi_sessions: {
    first_count: number;
    rerun_count: number;
    absent_dir_count: number;
    state: BackfillState;
  };
  codex: {
    cases: { label: string; file: string; interface: string; count: number }[];
    null_timestamp: { raises: boolean; error_type: string; rows_unchanged: boolean };
    state: BackfillState;
  };
  transcript: { state: BackfillState; rerun_state: BackfillState };
  hook_session_end: { label: string; state: BackfillState }[];
}

export const backfillGolden: BackfillGolden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8"));

/** Sequential ids plus the generator's frozen `_now()`. */
export function frozenDeps(): LoggerDeps {
  let counter = 0;
  return {
    newId: () => {
      counter += 1;
      return `id${String(counter).padStart(6, "0")}`;
    },
    nowIso: () => backfillGolden.meta.now,
  };
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * The generator's `_snapshot`: conversations and sessions in rowid (insertion)
 * order with ids aliased by that order, messages in rowid order within their
 * conversation, and Pi session ids made relative to the sessions directory.
 */
export function snapshotState(db: WritableDatabase, pathRoot?: string): BackfillState {
  const conversationRows = db
    .prepare(
      "SELECT id, title, started_at, ended_at, interface, persona, journey, summary, tags, " +
        "metadata FROM conversations ORDER BY rowid",
    )
    .all() as Record<string, unknown>[];
  const aliases = new Map<string, string>();
  conversationRows.forEach((row, index) => {
    aliases.set(String(row.id), `<conversation-${index + 1}>`);
  });
  const alias = (value: unknown): string | null =>
    typeof value === "string" ? (aliases.get(value) ?? value) : null;
  const relative = (value: string): string =>
    pathRoot && value.startsWith(`${pathRoot}/`)
      ? `${SESSIONS_DIR_PLACEHOLDER}/${value.slice(pathRoot.length + 1)}`
      : value;

  const conversations = conversationRows.map((row) => {
    const messages = db
      .prepare(
        "SELECT role, content, created_at, token_count, metadata FROM messages " +
          "WHERE conversation_id = ? ORDER BY rowid",
      )
      .all(String(row.id)) as Record<string, unknown>[];
    return {
      id: aliases.get(String(row.id)) as string,
      title: nullableString(row.title),
      started_at: String(row.started_at),
      ended_at: nullableString(row.ended_at),
      interface: String(row.interface),
      persona: nullableString(row.persona),
      journey: nullableString(row.journey),
      summary: nullableString(row.summary),
      tags: nullableString(row.tags),
      metadata_raw: nullableString(row.metadata),
      messages: messages.map((message) => ({
        role: String(message.role),
        content: String(message.content),
        created_at: String(message.created_at),
        token_count: typeof message.token_count === "number" ? message.token_count : null,
        metadata: nullableString(message.metadata),
      })),
    };
  });

  const sessionRows = db.prepare("SELECT * FROM runtime_sessions ORDER BY rowid").all() as Record<
    string,
    unknown
  >[];
  const runtimeSessions = sessionRows.map((row) => ({
    session_id: relative(String(row.session_id)),
    conversation_id: alias(row.conversation_id),
    interface: nullableString(row.interface),
    mirror_active: Number(row.mirror_active),
    persona: nullableString(row.persona),
    journey: nullableString(row.journey),
    hook_injected: Number(row.hook_injected),
    active: Number(row.active),
    started_at: String(row.started_at),
    updated_at: String(row.updated_at),
    closed_at: nullableString(row.closed_at),
    metadata: nullableString(row.metadata),
  }));

  return { conversations, runtime_sessions: runtimeSessions };
}

/**
 * The generator's `upsert_runtime_session(session_id, interface=...)` on a
 * fresh key under the frozen clock: an active, unbound session row.
 */
export function seedTrackedSession(db: WritableDatabase, sessionId: string, iface: string): void {
  const now = backfillGolden.meta.now;
  db.prepare(
    `INSERT INTO runtime_sessions
       (session_id, conversation_id, interface, mirror_active, persona, journey,
        hook_injected, active, started_at, updated_at, closed_at, metadata)
     VALUES (?, NULL, ?, 0, NULL, NULL, 0, 1, ?, ?, NULL, NULL)`,
  ).run(sessionId, iface, now, now);
}

/** The generator's `_seed_transcript_conversations`. */
export function seedTranscriptConversations(db: WritableDatabase): void {
  const seed = (id: string, startedAt: string, endedAt: string | null, roles: string[]) => {
    db.prepare(
      "INSERT INTO conversations (id, interface, journey, started_at, ended_at) " +
        "VALUES (?, 'claude_code', 'mirror-ts-core', ?, ?)",
    ).run(id, startedAt, endedAt);
    roles.forEach((role, index) => {
      db.prepare(
        "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      ).run(
        `${id}-m${String(index).padStart(2, "0")}`,
        id,
        role,
        `${role} line ${index}`,
        `${startedAt.slice(0, 17)}${String(30 + index).padStart(2, "0")}.000000Z`,
      );
    });
  };
  seed("conv-closed-empty", "2026-09-03T10:00:00.000000Z", "2026-09-03T10:10:00.000000Z", ["user"]);
  seed("conv-has-assistant", "2026-09-03T10:00:00.000000Z", "2026-09-03T10:10:00.000000Z", [
    "user",
    "assistant",
  ]);
  seed("conv-before", "2026-09-03T09:00:00.000000Z", "2026-09-03T09:30:00.000000Z", ["user"]);
  seed("conv-ends-at-window-start", "2026-09-03T09:50:00.000000Z", "2026-09-03T10:00:30.000Z", [
    "user",
  ]);
  seed("conv-open", "2026-09-03T10:05:00.000000Z", null, ["user"]);
  seed("conv-starts-at-window-end", "2026-09-03T13:00:00.000Z", null, ["user"]);
  seed("conv-after", "2026-09-03T14:00:00.000000Z", null, ["user"]);
}
