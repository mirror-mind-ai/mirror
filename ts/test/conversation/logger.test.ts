// CV22.DS7.US5 slice A — deterministic conversation-logger core.
//
// Characterization tests against the Python oracle semantics in
// `src/memory/cli/conversation_logger.py` (log_user_message,
// log_assistant_message, _generate_title) and
// `src/memory/services/runtime_session.py` (get_or_create_conversation) and
// `src/memory/services/conversation.py` (set_provisional_title/_clean_title).
// No LLM anywhere on these paths; byte-shapes (metadata JSON, title
// truncation) follow Python exactly.

import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  cleanTitle,
  generateTitle,
  getOrCreateSessionConversation,
  isMuted,
  logAssistantMessage,
  logUserMessage,
  setMute,
} from "#conversation/logger.ts";
import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import { createRuntimeTables } from "#helpers/runtimeSchema.ts";

const NOW = "2026-09-02T12:00:00.000000Z";

function fixture(): { db: WritableDatabase; dir: string } {
  const dir = mkdtempSync("/tmp/conversation-logger-");
  const db = openDatabaseCopyForWrite(join(dir, "copy.db"));
  createRuntimeTables(db);
  return { db, dir };
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `id${String(idCounter).padStart(6, "0")}`;
}
const deps = { newId: nextId, nowIso: () => NOW };

function conversationRows(db: WritableDatabase): Record<string, unknown>[] {
  return db.prepare("SELECT * FROM conversations ORDER BY rowid").all() as Record<
    string,
    unknown
  >[];
}
function messageRows(db: WritableDatabase): Record<string, unknown>[] {
  return db.prepare("SELECT * FROM messages ORDER BY rowid").all() as Record<string, unknown>[];
}
function sessionRow(db: WritableDatabase, id: string): Record<string, unknown> | undefined {
  return db.prepare("SELECT * FROM runtime_sessions WHERE session_id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
}

// --- _generate_title parity ---

test("generateTitle takes the first line; only outer strip, inner trailing spaces survive", () => {
  // Python oracle: strip() touches the whole string's edges, not the first
  // line's — `'  hello world  \nsecond line'` → `'hello world  '`.
  assert.equal(generateTitle("  hello world  \nsecond line"), "hello world  ");
});

test("generateTitle passes short titles through unchanged", () => {
  assert.equal(generateTitle("short title"), "short title");
});

test("generateTitle cuts >60 chars at a word boundary and appends ellipsis", () => {
  const content = "aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj kkkk llll mmmm";
  // Python oracle: text[:60] ends on the space after 'llll', so rsplit keeps
  // 'llll' as the boundary word.
  assert.equal(
    generateTitle(content),
    "aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj kkkk llll...",
  );
});

test("generateTitle without a space in the first 60 chars keeps the whole slice", () => {
  const content = "x".repeat(70);
  assert.equal(generateTitle(content), `${"x".repeat(60)}...`);
});

test("generateTitle hard-caps the first line at 80 chars before the 60 rule", () => {
  const longWord = "y".repeat(100);
  assert.equal(generateTitle(longWord), `${"y".repeat(60)}...`);
});

// --- _clean_title parity ---

test("cleanTitle collapses internal whitespace runs like ' '.join(split())", () => {
  assert.equal(cleanTitle("  a\t b\n\nc  "), "a b c");
});

test("cleanTitle rejects empty titles with the released message", () => {
  assert.throws(() => cleanTitle("   "), /title is required/);
});

test("cleanTitle rejects >160 chars with the released message", () => {
  assert.throws(() => cleanTitle("z".repeat(161)), /title must be at most 160 characters/);
});

// --- runtime_session.get_or_create_conversation parity ---

test("getOrCreateSessionConversation creates conversation and binds session atomically", () => {
  const { db } = fixture();
  const id = getOrCreateSessionConversation(db, "sess-1", { interface: "pi" }, deps);

  const convs = conversationRows(db);
  assert.equal(convs.length, 1);
  assert.equal(convs[0].id, id);
  assert.equal(convs[0].interface, "pi");
  assert.equal(convs[0].persona, null); // service uses passed persona, not session's
  assert.equal(convs[0].journey, null);
  assert.equal(convs[0].title, null);
  assert.equal(convs[0].started_at, NOW);

  const session = sessionRow(db, "sess-1");
  assert.ok(session);
  assert.equal(session.conversation_id, id);
  assert.equal(session.interface, "pi");
  assert.equal(session.active, 1);
  assert.equal(session.mirror_active, 0);
  assert.equal(session.hook_injected, 0);
  assert.equal(session.closed_at, null);
  assert.equal(session.started_at, NOW);
  db.close();
});

test("getOrCreateSessionConversation returns the bound live conversation untouched", () => {
  const { db } = fixture();
  const first = getOrCreateSessionConversation(db, "sess-1", { interface: "pi" }, deps);
  const second = getOrCreateSessionConversation(db, "sess-1", { interface: "pi" }, deps);
  assert.equal(second, first);
  assert.equal(conversationRows(db).length, 1);
  db.close();
});

test("getOrCreateSessionConversation replaces a dangling conversation binding", () => {
  const { db } = fixture();
  const first = getOrCreateSessionConversation(db, "sess-1", { interface: "pi" }, deps);
  db.prepare("DELETE FROM conversations WHERE id = ?").run(first);
  const second = getOrCreateSessionConversation(db, "sess-1", { interface: "pi" }, deps);
  assert.notEqual(second, first);
  assert.equal(sessionRow(db, "sess-1")?.conversation_id, second);
  db.close();
});

// --- log_user_message parity ---

test("logUserMessage on a fresh session creates conversation, provisional title, and message", () => {
  const { db } = fixture();
  logUserMessage(db, "sess-1", "hello world\nmore detail", { interface: "pi" }, deps);

  const convs = conversationRows(db);
  assert.equal(convs.length, 1);
  assert.equal(convs[0].title, "hello world");
  // Python json.dumps byte-shape: {"title_source": "first_user", "title_status": "provisional"}
  assert.equal(convs[0].metadata, '{"title_source": "first_user", "title_status": "provisional"}');

  const messages = messageRows(db);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].role, "user");
  assert.equal(messages[0].content, "hello world\nmore detail");
  assert.equal(messages[0].token_count, null);
  assert.equal(messages[0].metadata, null);
  db.close();
});

test("logUserMessage on an existing bound session appends without touching the title", () => {
  const { db } = fixture();
  logUserMessage(db, "sess-1", "first message", { interface: "pi" }, deps);
  logUserMessage(db, "sess-1", "second message", { interface: "pi" }, deps);

  const convs = conversationRows(db);
  assert.equal(convs.length, 1);
  assert.equal(convs[0].title, "first message");
  assert.equal(messageRows(db).length, 2);
  db.close();
});

test("logUserMessage clears an active discard marker and starts a fresh conversation", () => {
  const { db } = fixture();
  logUserMessage(db, "sess-1", "before discard", { interface: "pi" }, deps);
  db.prepare(
    "UPDATE runtime_sessions SET conversation_id = NULL, active = 0, metadata = ? WHERE session_id = ?",
  ).run('{"discard_current_conversation": true}', "sess-1");

  logUserMessage(db, "sess-1", "after discard", { interface: "pi" }, deps);

  const session = sessionRow(db, "sess-1");
  assert.ok(session);
  assert.equal(session.metadata, null);
  assert.equal(session.active, 1);
  const convs = conversationRows(db);
  assert.equal(convs.length, 2);
  assert.equal(convs[1].title, "after discard");
  db.close();
});

// --- log_assistant_message parity ---

test("logAssistantMessage appends to the bound conversation without titling", () => {
  const { db } = fixture();
  logUserMessage(db, "sess-1", "user text", { interface: "pi" }, deps);
  logAssistantMessage(db, "sess-1", "assistant text", { interface: "pi" }, deps);

  const messages = messageRows(db);
  assert.equal(messages.length, 2);
  assert.equal(messages[1].role, "assistant");
  assert.equal(messages[1].content, "assistant text");
  db.close();
});

test("logAssistantMessage creates the conversation when none is bound, with no title", () => {
  const { db } = fixture();
  logAssistantMessage(db, "sess-1", "assistant first", { interface: "pi" }, deps);
  const convs = conversationRows(db);
  assert.equal(convs.length, 1);
  assert.equal(convs[0].title, null);
  assert.equal(messageRows(db).length, 1);
  db.close();
});

test("logAssistantMessage is a complete no-op while the discard marker is active", () => {
  const { db } = fixture();
  db.prepare(
    `INSERT INTO runtime_sessions (session_id, interface, active, started_at, updated_at, metadata)
     VALUES (?, ?, 0, ?, ?, ?)`,
  ).run("sess-1", "pi", NOW, NOW, '{"discard_current_conversation": true}');

  logAssistantMessage(db, "sess-1", "should vanish", { interface: "pi" }, deps);

  assert.equal(conversationRows(db).length, 0);
  assert.equal(messageRows(db).length, 0);
  db.close();
});

// --- mute flag parity ---

test("setMute and isMuted use the mute flag file under the mirror home", () => {
  const home = mkdtempSync("/tmp/logger-mute-");
  assert.equal(isMuted(home), false);
  setMute(true, home);
  assert.equal(isMuted(home), true);
  assert.ok(existsSync(join(home, "mute")));
  setMute(false, home);
  assert.equal(isMuted(home), false);
  setMute(false, home); // idempotent unlink, like Python missing_ok=True
  assert.equal(isMuted(home), false);
});
