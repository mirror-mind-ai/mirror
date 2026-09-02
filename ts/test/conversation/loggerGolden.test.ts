// CV22.DS7.US5 slice A — cross-language golden parity.
//
// Replays the scenarios from `ts/parity/generate_conversation_logger_golden.py`
// against the TS logger and grades the normalized end state after each step
// against the Python-generated golden. The LLM close tails are no-ops on both
// sides (the generator patches them; here they are simply not injected), so
// this proves the deterministic skeleton only — the tails belong to slices C/D.

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  discardCurrentConversation,
  endSession,
  logAssistantMessage,
  logUserMessage,
  switchConversation,
} from "#conversation/logger.ts";
import { runConversationLoggerCommand } from "#conversation/loggerCli.ts";
import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import { createRuntimeTables } from "#helpers/runtimeSchema.ts";
import { upsertRuntimeSession } from "#mirror/runtimeSession.ts";

const GOLDEN_PATH = new URL("../goldens/conversation-logger.golden.json", import.meta.url);

interface Golden {
  scenarios: {
    label: string;
    conversations: unknown[];
    sessions: unknown[];
    messages: unknown[];
    memories: unknown[];
  }[];
  cli: { argv: string[]; stdout: string[]; stderr: string[]; exit_code: number }[];
}

// Monotonic clock so started_at/created_at ordering matches the Python run,
// where wall-clock time separates each write.
let tick = 0;
function nowIso(): string {
  tick += 1;
  return `2026-09-02T12:00:${String(tick).padStart(2, "0")}.000000Z`;
}
let idCounter = 0;
const deps = {
  newId: () => {
    idCounter += 1;
    return `gid${String(idCounter).padStart(5, "0")}`;
  },
  nowIso,
};

function fixture(): WritableDatabase {
  const dir = mkdtempSync("/tmp/logger-golden-");
  const db = openDatabaseCopyForWrite(join(dir, "copy.db"));
  createRuntimeTables(db);
  db.exec(`
    CREATE TABLE memories (
      id TEXT PRIMARY KEY, memory_type TEXT, title TEXT, content TEXT,
      journey TEXT, conversation_id TEXT, created_at TEXT
    );
    CREATE TABLE conversation_embeddings (conversation_id TEXT, embedding BLOB);
    CREATE TABLE llm_calls (id TEXT PRIMARY KEY, conversation_id TEXT, role TEXT, called_at TEXT);
  `);
  return db;
}

function parseOrNull(raw: unknown): unknown {
  if (typeof raw !== "string" || !raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Mirrors `_snapshot` in the Python generator exactly. */
function snapshot(db: WritableDatabase, label: string) {
  const conversationRows = db
    .prepare(
      "SELECT id, title, started_at, ended_at, interface, persona, journey, metadata FROM conversations ORDER BY started_at, id",
    )
    .all();
  const alias = new Map<string, string>();
  conversationRows.forEach((row, index) => {
    alias.set(String(row.id), `<conversation-${index + 1}>`);
  });
  const normalize = (value: unknown) =>
    typeof value === "string" && alias.has(value) ? alias.get(value) : value;

  return {
    label,
    conversations: conversationRows.map((row) => ({
      id: alias.get(String(row.id)),
      title: row.title ?? null,
      ended: row.ended_at !== null,
      interface: row.interface,
      persona: row.persona ?? null,
      journey: row.journey ?? null,
      metadata: parseOrNull(row.metadata),
      metadata_raw: row.metadata ?? null,
    })),
    sessions: db
      .prepare(
        "SELECT session_id, conversation_id, interface, persona, journey, active, closed_at, metadata FROM runtime_sessions ORDER BY session_id",
      )
      .all()
      .map((row) => ({
        session_id: row.session_id,
        conversation_id: normalize(row.conversation_id) ?? null,
        interface: row.interface ?? null,
        persona: row.persona ?? null,
        journey: row.journey ?? null,
        active: row.active,
        closed: row.closed_at !== null,
        metadata: parseOrNull(row.metadata),
        metadata_raw: row.metadata ?? null,
      })),
    messages: db
      .prepare(
        "SELECT conversation_id, role, content, token_count, metadata FROM messages ORDER BY created_at, rowid",
      )
      .all()
      .map((row) => ({
        conversation_id: normalize(row.conversation_id) ?? null,
        role: row.role,
        content: row.content,
        token_count: row.token_count ?? null,
        metadata: row.metadata ?? null,
      })),
    memories: db
      .prepare("SELECT id, title, conversation_id FROM memories ORDER BY created_at, id")
      .all()
      .map((row, index) => ({
        id: `<memory-${index + 1}>`,
        title: row.title ?? null,
        conversation_id: normalize(row.conversation_id) ?? null,
      })),
  };
}

test("TS conversation logger reproduces the Python golden across every scenario", () => {
  const golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf-8")) as Golden;
  const db = fixture();
  const actual: ReturnType<typeof snapshot>[] = [];

  logUserMessage(db, "sess-a", "hello world\nmore detail", { interface: "pi" }, deps);
  actual.push(snapshot(db, "user_message_creates_conversation_and_title"));

  logUserMessage(db, "sess-a", "second message", { interface: "pi" }, deps);
  logAssistantMessage(db, "sess-a", "assistant reply", { interface: "pi" }, deps);
  actual.push(snapshot(db, "second_user_message_keeps_title_and_appends"));

  upsertRuntimeSession(db, "sess-a", { persona: "engineer", journey: "mirror-ts-core" }, nowIso());
  switchConversation(db, "sess-a", {}, deps);
  actual.push(snapshot(db, "switch_preserves_persona_and_rebinds"));

  endSession(db, "sess-a", { extract: false }, deps);
  actual.push(snapshot(db, "end_session_closes_conversation_and_session"));

  logUserMessage(db, "sess-b", "discard me", { interface: "pi" }, deps);
  const discardedConversation = String(
    db.prepare("SELECT conversation_id FROM runtime_sessions WHERE session_id = 'sess-b'").get()
      ?.conversation_id,
  );
  db.prepare(
    "INSERT INTO memories (id, memory_type, title, content, conversation_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(deps.newId(), "note", "Extracted", "kept", discardedConversation, nowIso());
  discardCurrentConversation(db, "sess-b", { interface: "pi" }, deps);
  actual.push(snapshot(db, "discard_deletes_conversation_preserving_memories"));

  logAssistantMessage(db, "sess-b", "should vanish", { interface: "pi" }, deps);
  actual.push(snapshot(db, "assistant_noop_under_discard_marker"));

  assert.equal(actual.length, golden.scenarios.length);
  for (const [index, expected] of golden.scenarios.entries()) {
    assert.deepEqual(
      actual[index],
      expected,
      `scenario '${expected.label}' diverged from the Python oracle`,
    );
  }
  db.close();
});

test("TS CLI reproduces the Python stdout/stderr contract for handled subcommands", () => {
  const golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf-8")) as Golden;
  const db = fixture();
  const home = mkdtempSync("/tmp/logger-golden-cli-");

  for (const expected of golden.cli) {
    const result = runConversationLoggerCommand(db, expected.argv, { mirrorHome: home }, deps);
    assert.equal(
      result.handled,
      true,
      `argv ${JSON.stringify(expected.argv)} should be TS-handled in slice A`,
    );
    if (!result.handled) continue;
    assert.deepEqual(
      { stdout: result.stdout, stderr: result.stderr, exit_code: result.exitCode },
      { stdout: expected.stdout, stderr: expected.stderr, exit_code: expected.exit_code },
      `argv ${JSON.stringify(expected.argv)} diverged from the Python CLI contract`,
    );
  }
  db.close();
});
