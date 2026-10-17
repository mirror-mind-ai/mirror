// CV22.DS7.US5 slice A — deterministic conversation-logger core.
//
// Ports the no-LLM paths of `src/memory/cli/conversation_logger.py`
// (log_user_message, log_assistant_message, _generate_title, mute flag) and
// the transactional `runtime_session.get_or_create_conversation` service.
// Byte-shapes follow Python exactly: title truncation, whitespace collapse,
// and `json.dumps`-style metadata separators (see `pythonJsonDumps`).
//
// The LLM-backed tails of this family (extraction, close-time metadata
// finalization) are slice C/D scope behind the replay transport; nothing in
// this module may call a provider.

import { closeSync, existsSync, mkdirSync, openSync, rmSync } from "node:fs";
import { join } from "node:path";
import { markCloseTailPending, sessionEndRunsLlmTail } from "#conversation/deferredCloseTail.ts";
import {
  lastAssistantMessageOf,
  parseHookPayloadObject,
  promptOf,
  sessionIdOf,
  subagentTypeOf,
  turnIdOf,
} from "#conversation/hookPayload.ts";
import { backfillAssistantMessages } from "#conversation/transcriptBackfill.ts";
import { type WritableDatabase, withTransaction } from "#db/database.ts";
import { mirrorForm } from "#mirror/mirrorForm.ts";
import {
  decodeMetadata,
  getRuntimeSession,
  type RuntimeSessionRow,
  resolveRuntimeSessionId,
  upsertRuntimeSession,
} from "#mirror/runtimeSession.ts";
import { expandHome } from "#util/paths.ts";
import { pythonJsonDumps } from "#util/pyGenerators.ts";
import { codePointLength, sliceCodePoints } from "#util/pythonText.ts";

export interface LoggerDeps {
  newId: () => string;
  nowIso: () => string;
}

/**
 * The DS7/DS8 close seam. Python's `end_conversation` writes `ended_at`
 * deterministically, then runs two LLM-backed tails: extraction (conditional)
 * and close-time metadata finalization (always, in a `finally`). Both are
 * injected so slice A stays provider-free; slice C/D supply the real
 * implementations behind the replay transport.
 */
export interface CloseHooks {
  runExtraction?: (db: WritableDatabase, conversationId: string) => Promise<void> | void;
  finalizeMetadata?: (db: WritableDatabase, conversationId: string) => Promise<void> | void;
}

// PARITY NOTE for every call site below: Python's store upsert is asymmetric.
// `closed_at`/`metadata` use an `_UNSET` sentinel, so passing None means SET
// NULL. `conversation_id`/`interface`/`persona`/`journey`/`active` default to
// None meaning PRESERVE. The TS helper uses undefined=preserve, null=clear, so
// a Python `persona=None` maps to `persona: undefined` here — never `null`.

export interface SessionConversationOptions {
  interface: string;
  persona?: string | null;
  journey?: string | null;
  title?: string | null;
}

/**
 * Python `_generate_title`: first line, hard 80 cap, word-boundary 60 cut.
 * Both cuts are by code point (Python slicing), so an emoji counts once.
 */
export function generateTitle(content: string): string {
  const text = sliceCodePoints(content.trim().split("\n")[0] ?? "", 80);
  if (codePointLength(text) <= 60) return text;
  const cut = sliceCodePoints(text, 60);
  const boundary = cut.lastIndexOf(" ");
  return `${boundary === -1 ? cut : cut.slice(0, boundary)}...`;
}

/** Python `ConversationService._clean_title`: collapse whitespace, bound length. */
export function cleanTitle(title: string): string {
  const clean = title.trim().split(/\s+/).filter(Boolean).join(" ");
  if (!clean) throw new Error("title is required");
  if (clean.length > 160) throw new Error("title must be at most 160 characters");
  return clean;
}

function titleMetadata(
  rawMetadata: string | null,
  source: string,
  status: string,
  previousTitle: string | null,
): Record<string, unknown> {
  const metadata = decodeMetadata(rawMetadata);
  if (previousTitle && previousTitle !== metadata.previous_title) {
    metadata.previous_title = previousTitle;
  }
  metadata.title_source = source;
  metadata.title_status = status;
  return metadata;
}

/**
 * Python `ConversationService.set_provisional_title` for an exact id.
 * (The Python service also resolves id prefixes; that fallback belongs to the
 * title CLI operations and is not reachable from the logger paths, so it is
 * deliberately not ported here.)
 */
export function setProvisionalTitle(
  db: WritableDatabase,
  conversationId: string,
  title: string,
): void {
  const clean = cleanTitle(title);
  const row = db
    .prepare("SELECT title, metadata FROM conversations WHERE id = ?")
    .get(conversationId);
  if (!row) throw new Error(`Conversation '${conversationId}' not found`);
  const metadata = titleMetadata(
    typeof row.metadata === "string" ? row.metadata : null,
    "first_user",
    "provisional",
    typeof row.title === "string" ? row.title : null,
  );
  db.prepare("UPDATE conversations SET title = ?, metadata = ? WHERE id = ?").run(
    clean,
    pythonJsonDumps(metadata),
    conversationId,
  );
}

/**
 * Python `RuntimeSessionService.get_or_create_conversation`: return the bound
 * live conversation or create-and-bind atomically under BEGIN IMMEDIATE.
 * Persona/journey come from the caller only — never from the session row.
 */
export function getOrCreateSessionConversation(
  db: WritableDatabase,
  sessionId: string,
  options: SessionConversationOptions,
  deps: LoggerDeps,
): string {
  return withTransaction(db, () => {
    const bound = db
      .prepare("SELECT conversation_id FROM runtime_sessions WHERE session_id = ?")
      .get(sessionId);
    const boundId =
      bound && typeof bound.conversation_id === "string" ? bound.conversation_id : null;
    if (boundId) {
      const existing = db.prepare("SELECT id FROM conversations WHERE id = ?").get(boundId);
      if (existing) return boundId;
    }

    const id = deps.newId();
    const startedAt = deps.nowIso();
    db.prepare(
      `INSERT INTO conversations
         (id, title, started_at, ended_at, interface, persona, journey, summary, tags, metadata)
       VALUES (?, ?, ?, NULL, ?, ?, ?, NULL, NULL, NULL)`,
    ).run(
      id,
      options.title ?? null,
      startedAt,
      options.interface,
      options.persona ?? null,
      options.journey ?? null,
    );
    // Mirrors the service's conflict clause exactly: it does NOT touch
    // mirror_active, hook_injected, started_at, or metadata on update.
    db.prepare(
      `INSERT INTO runtime_sessions
         (session_id, conversation_id, interface, mirror_active, persona, journey,
          hook_injected, active, started_at, updated_at, closed_at, metadata)
       VALUES (?, ?, ?, 0, ?, ?, 0, 1, ?, ?, NULL, NULL)
       ON CONFLICT(session_id) DO UPDATE SET
         conversation_id = excluded.conversation_id,
         interface = excluded.interface,
         persona = excluded.persona,
         journey = excluded.journey,
         active = 1,
         closed_at = NULL,
         updated_at = excluded.updated_at`,
    ).run(
      sessionId,
      id,
      options.interface,
      options.persona ?? null,
      options.journey ?? null,
      startedAt,
      startedAt,
    );
    return id;
  });
}

function discardMarkerActive(session: RuntimeSessionRow | null): boolean {
  return Boolean(decodeMetadata(session?.metadata ?? null).discard_current_conversation);
}

/**
 * What a message row may carry beside its text. The runtime's turn id (US8)
 * is the one field today: written by the prompt and Stop hooks, read by the
 * reply rule, and NULL for every message logged another way, as before.
 */
export interface MessageMetadata {
  readonly turn_id?: string;
}

export interface LogMessageOptions {
  interface: string;
  metadata?: MessageMetadata | null;
}

function addMessage(
  db: WritableDatabase,
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  deps: LoggerDeps,
  metadata: MessageMetadata | null = null,
): void {
  db.prepare(
    `INSERT INTO messages (id, conversation_id, role, content, created_at, token_count, metadata)
     VALUES (?, ?, ?, ?, ?, NULL, ?)`,
  ).run(
    deps.newId(),
    conversationId,
    role,
    content,
    deps.nowIso(),
    metadata ? pythonJsonDumps(metadata) : null,
  );
}

/** Python `log_user_message`: discard-marker reset, bind, title-on-first, append. */
export function logUserMessage(
  db: WritableDatabase,
  sessionId: string,
  content: string,
  options: LogMessageOptions,
  deps: LoggerDeps,
): void {
  let existing = getRuntimeSession(db, sessionId);
  if (discardMarkerActive(existing)) {
    upsertRuntimeSession(
      db,
      sessionId,
      { metadata: null, active: true, closedAt: null },
      deps.nowIso(),
    );
    existing = getRuntimeSession(db, sessionId);
  }
  const isNew = existing === null || existing.conversationId === null;
  const conversationId = getOrCreateSessionConversation(
    db,
    sessionId,
    { interface: options.interface },
    deps,
  );
  upsertRuntimeSession(
    db,
    sessionId,
    { interface: options.interface, active: true, closedAt: null },
    deps.nowIso(),
  );
  if (isNew) {
    setProvisionalTitle(db, conversationId, generateTitle(content));
  }
  addMessage(db, conversationId, "user", content, deps, options.metadata ?? null);
}

/** Python `log_assistant_message`: silent no-op while the discard marker holds. */
export function logAssistantMessage(
  db: WritableDatabase,
  sessionId: string,
  content: string,
  options: LogMessageOptions,
  deps: LoggerDeps,
): void {
  const existing = getRuntimeSession(db, sessionId);
  if (discardMarkerActive(existing)) return;
  const conversationId = getOrCreateSessionConversation(
    db,
    sessionId,
    { interface: options.interface },
    deps,
  );
  addMessage(db, conversationId, "assistant", content, deps, options.metadata ?? null);
}

/** Python `ConversationService.start_conversation`: always a fresh row. */
function startConversation(
  db: WritableDatabase,
  options: SessionConversationOptions,
  deps: LoggerDeps,
): string {
  const id = deps.newId();
  db.prepare(
    `INSERT INTO conversations
       (id, title, started_at, ended_at, interface, persona, journey, summary, tags, metadata)
     VALUES (?, ?, ?, NULL, ?, ?, ?, NULL, NULL, NULL)`,
  ).run(
    id,
    options.title ?? null,
    deps.nowIso(),
    options.interface,
    options.persona ?? null,
    options.journey ?? null,
  );
  return id;
}

/**
 * Python `ConversationService.end_conversation`: deterministic close + tails.
 *
 * Async since CV22.DS7.US10 slice C′: both tails are genuinely asynchronous in
 * TypeScript (they reach the LLM transport), and awaiting them here keeps ONE
 * authority for the ordering contract — `ended_at` first, extraction second,
 * finalization in a `finally`. Duplicating that contract in a second async
 * close path would let the two drift on exactly the property that must not.
 */
export interface CloseTailOptions {
  extract: boolean;
  /**
   * Run the close-time metadata finalization (title, summary, tags). Off, there
   * is no LLM work at all: the conversation is flagged as owing it, immediately
   * before `ended_at` so the window against a still-running async Stop logger's
   * metadata write is microseconds, and the next session start's maintenance
   * finishes it (CV21.DS4.TS2, `deferredCloseTail.ts`). Default on.
   */
  finalize?: boolean;
  /**
   * Runs after the state writes and before any LLM work: where `endSession`
   * deactivates the session and `handleSessionEndHook` backfills the
   * transcript, which the close bounds and extraction should see.
   */
  beforeTail?: () => void;
}

export async function endConversation(
  db: WritableDatabase,
  conversationId: string,
  options: CloseTailOptions,
  deps: LoggerDeps,
  hooks: CloseHooks = {},
): Promise<void> {
  const finalize = options.finalize ?? true;
  if (!finalize) markCloseTailPending(db, conversationId);
  db.prepare("UPDATE conversations SET ended_at = ? WHERE id = ?").run(
    deps.nowIso(),
    conversationId,
  );
  options.beforeTail?.();
  if (!finalize) return;
  try {
    if (options.extract) await hooks.runExtraction?.(db, conversationId);
  } finally {
    // Python finalizes in a `finally`: the orphan is closed and non-manual
    // metadata finalized even when extraction fails.
    await hooks.finalizeMetadata?.(db, conversationId);
  }
}

/** Python `switch_conversation`: close the old conversation, bind a new one. */
export async function switchConversation(
  db: WritableDatabase,
  sessionId: string | null,
  options: { persona?: string | null; journey?: string | null; envSessionId?: string | null },
  deps: LoggerDeps,
  hooks: CloseHooks = {},
): Promise<string | null> {
  const resolved = resolveRuntimeSessionId(db, sessionId, options.envSessionId ?? null);
  if (!resolved) return null;

  const runtimeSession = getRuntimeSession(db, resolved);
  const oldConversationId = runtimeSession?.conversationId ?? null;
  if (oldConversationId) {
    await endConversation(db, oldConversationId, { extract: true }, deps, hooks);
  }

  // Python truthiness: an empty interface also falls back to claude_code.
  const existingInterface = runtimeSession?.interface;
  const interfaceName = existingInterface ? existingInterface : "claude_code";
  const newConversationId = startConversation(
    db,
    {
      interface: interfaceName,
      persona: options.persona ?? null,
      journey: options.journey ?? null,
    },
    deps,
  );
  upsertRuntimeSession(
    db,
    resolved,
    {
      conversationId: newConversationId,
      interface: interfaceName,
      persona: options.persona ?? undefined,
      journey: options.journey ?? undefined,
      active: true,
      closedAt: null,
    },
    deps.nowIso(),
  );
  return newConversationId;
}

/**
 * Python `end_session`: close the bound conversation and deactivate.
 *
 * The session is deactivated BEFORE the tail, not after (CV21.DS4.TS2). A tail
 * cut by the runtime's bound (Codex 1 s, Grok 1.5 s, Gemini CLI 30 s) or a
 * background hook that dies used to leave the session `active = 1`: the row
 * `guessRuntimeSessionId` reads as "the session", which is how another
 * runtime's agent wrote into a Codex conversation (DS12.TS2 L9).
 */
export async function endSession(
  db: WritableDatabase,
  sessionId: string,
  options: CloseTailOptions,
  deps: LoggerDeps,
  hooks: CloseHooks = {},
): Promise<boolean> {
  const runtimeSession = getRuntimeSession(db, sessionId);
  const conversationId = runtimeSession?.conversationId ?? null;
  if (!conversationId) return false;
  const deactivate = () => {
    upsertRuntimeSession(db, sessionId, { active: false, closedAt: deps.nowIso() }, deps.nowIso());
    options.beforeTail?.();
  };
  await endConversation(db, conversationId, { ...options, beforeTail: deactivate }, deps, hooks);
  return true;
}

/**
 * Python `ConversationService.delete_conversations` for one resolved id:
 * extracted memories survive with a nulled FK rather than cascading away.
 */
function deleteConversation(db: WritableDatabase, conversationId: string): void {
  db.prepare("DELETE FROM messages WHERE conversation_id = ?").run(conversationId);
  db.prepare("DELETE FROM conversation_embeddings WHERE conversation_id = ?").run(conversationId);
  db.prepare("UPDATE memories SET conversation_id = NULL WHERE conversation_id = ?").run(
    conversationId,
  );
  db.prepare("UPDATE llm_calls SET conversation_id = NULL WHERE conversation_id = ?").run(
    conversationId,
  );
  db.prepare("UPDATE runtime_sessions SET conversation_id = NULL WHERE conversation_id = ?").run(
    conversationId,
  );
  db.prepare("DELETE FROM conversations WHERE id = ?").run(conversationId);
}

/** Python `discard_current_conversation`: delete and mark the session discarded. */
export function discardCurrentConversation(
  db: WritableDatabase,
  sessionId: string | null,
  options: { interface: string },
  deps: LoggerDeps,
): string | null {
  let resolved = sessionId;
  if (resolved === null) {
    const row = db
      .prepare(
        `SELECT session_id FROM runtime_sessions
         WHERE active = 1 AND interface = ?
         ORDER BY updated_at DESC`,
      )
      .get(options.interface);
    resolved = row ? String(row.session_id) : null;
  }
  if (resolved === null) return null;

  const runtimeSession = getRuntimeSession(db, resolved);
  if (!runtimeSession || runtimeSession.conversationId === null) return null;
  const conversationId = runtimeSession.conversationId;

  withTransaction(db, () => {
    deleteConversation(db, conversationId);
    return null;
  });

  const existingInterface = runtimeSession.interface;
  upsertRuntimeSession(
    db,
    resolved,
    {
      // Python passes conversation_id=None, which the store PRESERVES; the
      // delete above already nulled it, so preserve and clear coincide here.
      interface: existingInterface ? existingInterface : options.interface,
      active: false,
      metadata: pythonJsonDumps({ discard_current_conversation: true }),
    },
    deps.nowIso(),
  );
  return conversationId;
}

// --- Runtime hook entries -------------------------------------------------
//
// `hook_user_prompt` and `hook_session_end` are the hot path: they run on
// every message and every session close. Python wraps both in
// `except Exception: pass` and always exits 0, so a logging failure can never
// take down the runtime. These ports return a described outcome instead of
// exiting, keeping stdin/env at the CLI edge and the behavior testable; the
// CLI maps every outcome to exit code 0.

export type UserPromptHookOutcome =
  | { action: "muted" }
  | {
      action: "skipped";
      reason:
        | "malformed_payload"
        | "missing_session"
        | "missing_prompt"
        | "slash_command"
        | "bare_mirror_form";
    }
  | { action: "logged"; sessionId: string }
  | { action: "failed"; error: string };

export type StopHookOutcome =
  | { action: "muted" }
  | {
      action: "skipped";
      reason:
        | "malformed_payload"
        | "missing_session"
        | "subagent"
        | "empty_message"
        | "discarded"
        | "already_answered"
        // Expected: the turn's prompt was a command, which history skips.
        | "command_turn"
        // Expected: the Stop names no turn (Grok's at session end).
        | "session_event"
        // Unexplained: the turn's prompt was neither logged nor skipped as a
        // command -- the reply is lost. The only skip the caller reports.
        | "nothing_waiting";
    }
  | { action: "logged"; sessionId: string; pairedBy: "turn_id" | "last_message" }
  | { action: "failed"; error: string };

export interface HookLoggingOptions {
  mirrorHome: string;
  /** The runtime the hook detected (`claude_code`, `codex`, `grok_build`). */
  interface?: string;
}

export type SessionEndHookOutcome =
  | { action: "skipped"; reason: "malformed_payload" | "nothing_to_do" }
  | { action: "ended"; sessionId: string; transcriptPath: string | null; backfilled: boolean }
  | { action: "backfilled"; transcriptPath: string }
  | { action: "failed"; error: string };

const parsePayload = parseHookPayloadObject;

function payloadString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === "string" ? value : "";
}

function turnMetadata(turnId: string): MessageMetadata | null {
  return turnId ? { turn_id: turnId } : null;
}

/**
 * The session-metadata key that names the last turn the prompt hook skipped as a
 * command, so the Stop hook can tell that turn's reply -- expected to go
 * unrecorded -- from a reply lost because its prompt never reached Mirror.
 */
const SKIPPED_TURN_KEY = "skipped_turn_id";

/**
 * Record the turn a command prompt occupied. `runtime_sessions.metadata` is a
 * shared JSON object (the discard marker, the operating mode, Soul, Explorer,
 * and Builder keep keys there), so the key is merged in, never written over.
 */
function recordSkippedTurn(
  db: WritableDatabase,
  sessionId: string,
  turnId: string,
  deps: LoggerDeps,
): void {
  if (!turnId) return;
  const metadata = decodeMetadata(getRuntimeSession(db, sessionId)?.metadata ?? null);
  metadata[SKIPPED_TURN_KEY] = turnId;
  upsertRuntimeSession(db, sessionId, { metadata: pythonJsonDumps(metadata) }, deps.nowIso());
}

/**
 * Python `hook_user_prompt`: mute gate, slash-command skip, never throw.
 *
 * Two additions since CV21.DS2.US8. The session's label is stamped on every
 * prompt, skipped or not, before anything else can create the conversation:
 * the Mirror Mode path creates one with `session?.interface ?? "claude_code"`,
 * and `guessRuntimeSessionId` ignores a session row with no interface, so a
 * Grok session whose first turn was a Mirror turn used to be labelled
 * `claude_code` and bound to someone else's session (DS12.TS4 L7, TS2 L9).
 * And a Mirror turn is a conversation turn: its question is logged without
 * the form, where every other slash command stays a command.
 */
export function handleUserPromptHook(
  db: WritableDatabase,
  rawPayload: string,
  options: HookLoggingOptions,
  deps: LoggerDeps,
): UserPromptHookOutcome {
  try {
    const payload = parsePayload(rawPayload);
    if (!payload) return { action: "skipped", reason: "malformed_payload" };

    const sessionId = sessionIdOf(payload);
    const prompt = promptOf(payload);
    if (!sessionId) return { action: "skipped", reason: "missing_session" };

    const interfaceName = options.interface ?? "claude_code";
    upsertRuntimeSession(db, sessionId, { interface: interfaceName }, deps.nowIso());

    if (isMuted(options.mirrorHome)) return { action: "muted" };
    if (!prompt) return { action: "skipped", reason: "missing_prompt" };

    const mirror = mirrorForm(prompt);
    let content = prompt;
    if (mirror) {
      if (!mirror.query) {
        recordSkippedTurn(db, sessionId, turnIdOf(payload), deps);
        return { action: "skipped", reason: "bare_mirror_form" };
      }
      content = mirror.query;
    } else if (prompt.startsWith("/")) {
      // Slash commands never enter conversation history, and neither does
      // their reply: the turn is recorded so the Stop hook knows why.
      recordSkippedTurn(db, sessionId, turnIdOf(payload), deps);
      return { action: "skipped", reason: "slash_command" };
    }

    logUserMessage(
      db,
      sessionId,
      content,
      { interface: interfaceName, metadata: turnMetadata(turnIdOf(payload)) },
      deps,
    );
    return { action: "logged", sessionId };
  } catch (error) {
    // Python swallows everything here; the runtime must survive a logging fault.
    return { action: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

interface MessageRow {
  rowid: number;
  role: string;
  created_at: string;
  metadata: string | null;
}

/** The conversation's last message, in the order the rows were written. */
function lastMessage(db: WritableDatabase, conversationId: string): MessageRow | null {
  const row = db
    .prepare(
      `SELECT rowid, role, created_at, metadata FROM messages
       WHERE conversation_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    )
    .get(conversationId);
  return (row as MessageRow | undefined) ?? null;
}

/** The latest logged prompt of the turn, if the turn's prompt was logged. */
function promptOfTurn(
  db: WritableDatabase,
  conversationId: string,
  turnId: string,
): MessageRow | null {
  const row = db
    .prepare(
      `SELECT rowid, role, created_at, metadata FROM messages
       WHERE conversation_id = ? AND role = 'user' AND json_extract(metadata, '$.turn_id') = ?
       ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    )
    .get(conversationId, turnId);
  return (row as MessageRow | undefined) ?? null;
}

/**
 * Whether the turn already has its reply: an assistant row carrying the same
 * turn id, after the prompt. Only a Stop reply carries one, so an assistant row
 * written another way -- a summary `mirror mirror log` appended by hand, a
 * transcript backfill -- never stands in for the turn's answer.
 */
function answeredAfter(
  db: WritableDatabase,
  conversationId: string,
  prompt: MessageRow,
  turnId: string,
): boolean {
  const row = db
    .prepare(
      `SELECT 1 FROM messages
       WHERE conversation_id = ? AND role = 'assistant'
         AND json_extract(metadata, '$.turn_id') = ?
         AND (created_at > ? OR (created_at = ? AND rowid > ?)) LIMIT 1`,
    )
    .get(conversationId, turnId, prompt.created_at, prompt.created_at, prompt.rowid);
  return row !== undefined;
}

function turnIdOfRow(row: MessageRow): string {
  const value = decodeMetadata(row.metadata).turn_id;
  return typeof value === "string" ? value : "";
}

/**
 * The Stop hook (CV21.DS2.US8): log the turn's final answer beside its prompt.
 *
 * A reply is logged when it answers a logged prompt, and never otherwise:
 *
 *   * by turn id, when the payload carries one and a logged prompt carries the
 *     same -- unless a reply with that turn id already follows it, which is a
 *     repeat Stop (a Stop re-fired after another hook blocked). An assistant
 *     row without the turn id (a hand-logged summary) does not count;
 *   * else by position, when the conversation's last message is a logged
 *     prompt -- unless both sides carry a turn id and they differ, which means
 *     this turn's prompt was a command and an older prompt is waiting because
 *     its own Stop was lost; attaching the new answer to the old question
 *     would record a conversation that never happened.
 *
 * The handler never creates a conversation. When nothing is waiting, it says
 * why: `command_turn` when the prompt hook skipped this turn as a command,
 * `session_event` when the Stop names no turn (Grok's at session end), and
 * `nothing_waiting` only when nothing explains it -- the turn's prompt never
 * reached Mirror, the async race the plan names, a reply lost. The caller
 * writes a `hooks.log` line for that one alone: `runtime diagnose` reads every
 * line there as a failure, and an expected skip is not one (Debt Review,
 * 2026-10-13).
 */
export function handleStopHook(
  db: WritableDatabase,
  rawPayload: string,
  options: HookLoggingOptions,
  deps: LoggerDeps,
): StopHookOutcome {
  try {
    const payload = parsePayload(rawPayload);
    if (!payload) return { action: "skipped", reason: "malformed_payload" };

    const sessionId = sessionIdOf(payload);
    if (!sessionId) return { action: "skipped", reason: "missing_session" };
    if (isMuted(options.mirrorHome)) return { action: "muted" };
    if (subagentTypeOf(payload)) return { action: "skipped", reason: "subagent" };

    const message = lastAssistantMessageOf(payload);
    if (!message.trim()) return { action: "skipped", reason: "empty_message" };

    const session = getRuntimeSession(db, sessionId);
    if (discardMarkerActive(session)) return { action: "skipped", reason: "discarded" };
    const turnId = turnIdOf(payload);
    const nothingWaiting = (): StopHookOutcome => {
      if (!turnId) return { action: "skipped", reason: "session_event" };
      if (decodeMetadata(session?.metadata ?? null)[SKIPPED_TURN_KEY] === turnId) {
        return { action: "skipped", reason: "command_turn" };
      }
      return { action: "skipped", reason: "nothing_waiting" };
    };
    const conversationId = session?.conversationId ?? null;
    if (!conversationId) return nothingWaiting();

    const interfaceName = options.interface ?? session?.interface ?? "claude_code";
    const last = lastMessage(db, conversationId);

    if (turnId) {
      const prompt = promptOfTurn(db, conversationId, turnId);
      if (prompt) {
        if (answeredAfter(db, conversationId, prompt, turnId)) {
          return { action: "skipped", reason: "already_answered" };
        }
        logAssistantMessage(
          db,
          sessionId,
          message,
          { interface: interfaceName, metadata: turnMetadata(turnId) },
          deps,
        );
        return { action: "logged", sessionId, pairedBy: "turn_id" };
      }
      if (last && last.role === "user" && !turnIdOfRow(last)) {
        logAssistantMessage(
          db,
          sessionId,
          message,
          { interface: interfaceName, metadata: turnMetadata(turnId) },
          deps,
        );
        return { action: "logged", sessionId, pairedBy: "last_message" };
      }
      return nothingWaiting();
    }

    if (last && last.role === "user") {
      logAssistantMessage(db, sessionId, message, { interface: interfaceName }, deps);
      return { action: "logged", sessionId, pairedBy: "last_message" };
    }
    return nothingWaiting();
  } catch (error) {
    return { action: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Python `hook_session_end`: end the session when the payload names one, then
 * backfill assistant turns from the transcript when it exists -- in that
 * order, so the just-ended conversation's `ended_at` bounds the backfill.
 *
 * The two halves are independent: an empty `session_id` with a transcript
 * still backfills (the session-less route, slice E), and a session without a
 * transcript still ends. Everything is swallowed; the hook always exits 0.
 */
export async function handleSessionEndHook(
  db: WritableDatabase,
  rawPayload: string,
  options: {
    mirrorHome: string;
    claudeProjectDir: string | null;
    homeDir: string;
    /** The runtime the hook detected: the fallback when the session row has no label. */
    interface?: string;
  },
  deps: LoggerDeps,
  hooks: CloseHooks = {},
): Promise<SessionEndHookOutcome> {
  try {
    const payload = parsePayload(rawPayload);
    if (!payload) return { action: "skipped", reason: "malformed_payload" };

    const sessionId = payloadString(payload, "session_id");
    const transcriptPath = resolveTranscriptPath(
      payloadString(payload, "transcript_path"),
      sessionId,
      options.claudeProjectDir,
      options.homeDir,
    );
    let backfilled = false;
    // After the close, which bounds the backfill window, and before the tail,
    // which should see what the backfill adds (CV21.DS4.TS2).
    const backfill = () => {
      backfilled = transcriptPath !== null && existsSync(transcriptPath);
      if (backfilled && transcriptPath !== null)
        backfillAssistantMessages(db, transcriptPath, deps);
    };

    if (sessionId) {
      // The label US8 stamps on every prompt; the hook's own detection only when
      // the row carries none; today's behavior when neither names a runtime.
      const label = getRuntimeSession(db, sessionId)?.interface || options.interface || null;
      const finalize = sessionEndRunsLlmTail(label);
      const closed = await endSession(
        db,
        sessionId,
        { extract: finalize, finalize, beforeTail: backfill },
        deps,
        hooks,
      );
      // A session with no bound conversation closes nothing; the backfill still runs.
      if (!closed) backfill();
    } else {
      backfill();
    }

    if (sessionId) return { action: "ended", sessionId, transcriptPath, backfilled };
    if (backfilled && transcriptPath !== null) return { action: "backfilled", transcriptPath };
    return { action: "skipped", reason: "nothing_to_do" };
  } catch (error) {
    return { action: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Python's transcript fallback: an explicit payload path wins; otherwise
 * derive `~/.claude/projects/<project-hash>/<session>.jsonl`, where the hash
 * is the project dir with leading slashes stripped and `/` replaced by `-`.
 */
export function resolveTranscriptPath(
  payloadPath: string,
  sessionId: string,
  claudeProjectDir: string | null,
  homeDir: string,
): string | null {
  if (payloadPath) return payloadPath;
  if (!claudeProjectDir) return null;
  const projectHash = claudeProjectDir.replace(/^\/+/, "").replaceAll("/", "-");
  return join(homeDir, ".claude", "projects", projectHash, `${sessionId}.jsonl`);
}

function muteFlagPath(mirrorHome: string): string {
  return join(expandHome(mirrorHome), "mute");
}

/** Python `is_muted` with an explicit mirror home. */
export function isMuted(mirrorHome: string): boolean {
  return existsSync(muteFlagPath(mirrorHome));
}

/** Python `set_mute`: touch (no truncate) or unlink with missing_ok. */
export function setMute(on: boolean, mirrorHome: string): void {
  const path = muteFlagPath(mirrorHome);
  if (on) {
    mkdirSync(expandHome(mirrorHome), { recursive: true });
    closeSync(openSync(path, "a"));
    return;
  }
  rmSync(path, { force: true });
}
