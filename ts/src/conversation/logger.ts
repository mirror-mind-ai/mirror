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
import { type WritableDatabase, withTransaction } from "#db/database.ts";
import {
  decodeMetadata,
  getRuntimeSession,
  type RuntimeSessionRow,
  resolveRuntimeSessionId,
  upsertRuntimeSession,
} from "#mirror/runtimeSession.ts";
import { expandHome } from "#util/paths.ts";
import { pythonJsonDumps } from "#util/pyGenerators.ts";

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
  runExtraction?: (db: WritableDatabase, conversationId: string) => void;
  finalizeMetadata?: (db: WritableDatabase, conversationId: string) => void;
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

/** Python `_generate_title`: first line, hard 80 cap, word-boundary 60 cut. */
export function generateTitle(content: string): string {
  const text = (content.trim().split("\n")[0] ?? "").slice(0, 80);
  if (text.length <= 60) return text;
  const cut = text.slice(0, 60);
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

function addMessage(
  db: WritableDatabase,
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  deps: LoggerDeps,
): void {
  db.prepare(
    `INSERT INTO messages (id, conversation_id, role, content, created_at, token_count, metadata)
     VALUES (?, ?, ?, ?, ?, NULL, NULL)`,
  ).run(deps.newId(), conversationId, role, content, deps.nowIso());
}

/** Python `log_user_message`: discard-marker reset, bind, title-on-first, append. */
export function logUserMessage(
  db: WritableDatabase,
  sessionId: string,
  content: string,
  options: { interface: string },
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
  addMessage(db, conversationId, "user", content, deps);
}

/** Python `log_assistant_message`: silent no-op while the discard marker holds. */
export function logAssistantMessage(
  db: WritableDatabase,
  sessionId: string,
  content: string,
  options: { interface: string },
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
  addMessage(db, conversationId, "assistant", content, deps);
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

/** Python `ConversationService.end_conversation`: deterministic close + tails. */
export function endConversation(
  db: WritableDatabase,
  conversationId: string,
  options: { extract: boolean },
  deps: LoggerDeps,
  hooks: CloseHooks = {},
): void {
  db.prepare("UPDATE conversations SET ended_at = ? WHERE id = ?").run(
    deps.nowIso(),
    conversationId,
  );
  try {
    if (options.extract) hooks.runExtraction?.(db, conversationId);
  } finally {
    // Python finalizes in a `finally`: the orphan is closed and non-manual
    // metadata finalized even when extraction fails.
    hooks.finalizeMetadata?.(db, conversationId);
  }
}

/** Python `switch_conversation`: close the old conversation, bind a new one. */
export function switchConversation(
  db: WritableDatabase,
  sessionId: string | null,
  options: { persona?: string | null; journey?: string | null; envSessionId?: string | null },
  deps: LoggerDeps,
  hooks: CloseHooks = {},
): string | null {
  const resolved = resolveRuntimeSessionId(db, sessionId, options.envSessionId ?? null);
  if (!resolved) return null;

  const runtimeSession = getRuntimeSession(db, resolved);
  const oldConversationId = runtimeSession?.conversationId ?? null;
  if (oldConversationId) {
    endConversation(db, oldConversationId, { extract: true }, deps, hooks);
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

/** Python `end_session`: close the bound conversation and deactivate. */
export function endSession(
  db: WritableDatabase,
  sessionId: string,
  options: { extract: boolean },
  deps: LoggerDeps,
  hooks: CloseHooks = {},
): void {
  const runtimeSession = getRuntimeSession(db, sessionId);
  const conversationId = runtimeSession?.conversationId ?? null;
  if (!conversationId) return;
  endConversation(db, conversationId, { extract: options.extract }, deps, hooks);
  upsertRuntimeSession(db, sessionId, { active: false, closedAt: deps.nowIso() }, deps.nowIso());
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
      reason: "malformed_payload" | "missing_session" | "missing_prompt" | "slash_command";
    }
  | { action: "logged"; sessionId: string }
  | { action: "failed"; error: string };

export type SessionEndHookOutcome =
  | { action: "skipped"; reason: "malformed_payload" | "missing_session" }
  | { action: "ended"; sessionId: string; transcriptPath: string | null }
  | { action: "failed"; error: string };

function parsePayload(raw: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

function payloadString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === "string" ? value : "";
}

/** Python `hook_user_prompt`: mute gate, slash-command skip, never throw. */
export function handleUserPromptHook(
  db: WritableDatabase,
  rawPayload: string,
  options: { mirrorHome: string; interface?: string },
  deps: LoggerDeps,
): UserPromptHookOutcome {
  try {
    if (isMuted(options.mirrorHome)) return { action: "muted" };

    const payload = parsePayload(rawPayload);
    if (!payload) return { action: "skipped", reason: "malformed_payload" };

    const sessionId = payloadString(payload, "session_id");
    const prompt = payloadString(payload, "prompt");
    if (!sessionId) return { action: "skipped", reason: "missing_session" };
    if (!prompt) return { action: "skipped", reason: "missing_prompt" };
    // Slash commands never enter conversation history.
    if (prompt.startsWith("/")) return { action: "skipped", reason: "slash_command" };

    logUserMessage(db, sessionId, prompt, { interface: options.interface ?? "claude_code" }, deps);
    return { action: "logged", sessionId };
  } catch (error) {
    // Python swallows everything here; the runtime must survive a logging fault.
    return { action: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Python `hook_session_end`. Resolves the transcript path but does not
 * backfill: `backfill_assistant_messages` (and Python's session-less
 * backfill-only path) is slice E scope, so this port reports the resolved
 * path and leaves dispatch to that slice.
 */
export function handleSessionEndHook(
  db: WritableDatabase,
  rawPayload: string,
  options: { mirrorHome: string; claudeProjectDir: string | null; homeDir: string },
  deps: LoggerDeps,
  hooks: CloseHooks = {},
): SessionEndHookOutcome {
  try {
    const payload = parsePayload(rawPayload);
    if (!payload) return { action: "skipped", reason: "malformed_payload" };

    const sessionId = payloadString(payload, "session_id");
    if (!sessionId) return { action: "skipped", reason: "missing_session" };

    endSession(db, sessionId, { extract: true }, deps, hooks);
    const transcriptPath = resolveTranscriptPath(
      payloadString(payload, "transcript_path"),
      sessionId,
      options.claudeProjectDir,
      options.homeDir,
    );
    return { action: "ended", sessionId, transcriptPath };
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
