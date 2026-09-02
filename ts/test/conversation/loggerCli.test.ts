// CV22.DS7.US5 slice A — CLI dispatch and stdout contract.
//
// The strangler's unit is `command + args -> stdout`, so these grade the
// output strings and exit codes of `conversation_logger.main()`, plus the
// slice boundary: subcommands whose Python path crosses the LLM close tail
// must report `handled: false` so the front door falls back.

import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { logUserMessage } from "#conversation/logger.ts";
import { runConversationLoggerCommand } from "#conversation/loggerCli.ts";
import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import { createRuntimeTables } from "#helpers/runtimeSchema.ts";

const NOW = "2026-09-02T12:00:00.000000Z";
let idCounter = 0;
const deps = {
  newId: () => {
    idCounter += 1;
    return `cli${String(idCounter).padStart(5, "0")}`;
  },
  nowIso: () => NOW,
};

function fixture(): { db: WritableDatabase; home: string } {
  const home = mkdtempSync("/tmp/logger-cli-");
  const db = openDatabaseCopyForWrite(join(home, "copy.db"));
  createRuntimeTables(db);
  db.exec(`
    CREATE TABLE memories (
      id TEXT PRIMARY KEY, memory_type TEXT, title TEXT, content TEXT,
      journey TEXT, conversation_id TEXT, created_at TEXT
    );
    CREATE TABLE conversation_embeddings (conversation_id TEXT, embedding BLOB);
    CREATE TABLE llm_calls (id TEXT PRIMARY KEY, conversation_id TEXT, role TEXT, called_at TEXT);
  `);
  return { db, home };
}

function run(db: WritableDatabase, home: string, argv: string[], stdin?: string) {
  return runConversationLoggerCommand(db, argv, { mirrorHome: home, stdin }, deps);
}

/** Narrow to the handled branch so tests can grade stdout/exitCode directly. */
function runHandled(db: WritableDatabase, home: string, argv: string[], stdin?: string) {
  const result = run(db, home, argv, stdin);
  if (!result.handled) {
    throw new Error(`expected TS to handle: ${JSON.stringify(argv)}`);
  }
  return result;
}

// --- mute / unmute / status stdout contract ---

test("mute, unmute, and status emit the released strings", () => {
  const { db, home } = fixture();
  assert.deepEqual(run(db, home, ["mute"]), {
    handled: true,
    stdout: ["Conversation logging MUTED."],
    stderr: [],
    exitCode: 0,
  });
  assert.deepEqual(runHandled(db, home, ["status"]).stdout, ["MUTED"]);
  assert.deepEqual(runHandled(db, home, ["unmute"]).stdout, ["Conversation logging ACTIVE."]);
  assert.deepEqual(runHandled(db, home, ["status"]).stdout, ["ACTIVE"]);
  db.close();
});

// --- option parsing parity ---

test("a --mirror-home without a value fails with the released error and exit 1", () => {
  const { db, home } = fixture();
  assert.deepEqual(run(db, home, ["status", "--mirror-home"]), {
    handled: true,
    stdout: [],
    stderr: ["Error: --mirror-home requires a path"],
    exitCode: 1,
  });
  db.close();
});

test("a --session-id without a value fails with the released error and exit 1", () => {
  const { db, home } = fixture();
  assert.deepEqual(runHandled(db, home, ["switch", "--session-id"]).exitCode, 1);
  db.close();
});

test("no subcommand exits 1 silently", () => {
  const { db, home } = fixture();
  assert.deepEqual(run(db, home, []), { handled: true, stdout: [], stderr: [], exitCode: 1 });
  db.close();
});

// --- slice boundary: LLM-tail subcommands must fall back ---

test("subcommands crossing the LLM close tail are not handled by TS yet", () => {
  const { db, home } = fixture();
  for (const command of ["switch", "session-end-pi", "session-end", "session-start"]) {
    assert.deepEqual(
      run(db, home, [command]),
      { handled: false },
      `${command} must fall back to Python in slice A`,
    );
  }
  db.close();
});

test("slice D/E subcommands are not handled by TS yet", () => {
  const { db, home } = fixture();
  for (const command of [
    "session-maintenance",
    "diagnose-journeys",
    "repair-journeys",
    "backfill-codex-session",
  ]) {
    assert.deepEqual(run(db, home, [command]), { handled: false });
  }
  db.close();
});

// --- logging subcommands ---

test("log-user writes a message and honours --interface", () => {
  const { db, home } = fixture();
  const result = runHandled(db, home, ["log-user", "s1", "hello", "--interface", "pi"]);
  assert.deepEqual(result, { handled: true, stdout: [], stderr: [], exitCode: 0 });
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM messages").get()?.c, 1);
  assert.equal(db.prepare("SELECT interface FROM conversations").get()?.interface, "pi");
  db.close();
});

test("log-assistant defaults the interface to claude_code", () => {
  const { db, home } = fixture();
  run(db, home, ["log-assistant", "s1", "reply"]);
  assert.equal(db.prepare("SELECT interface FROM conversations").get()?.interface, "claude_code");
  db.close();
});

test("log-user with fewer than two positional arguments writes nothing", () => {
  const { db, home } = fixture();
  runHandled(db, home, ["log-user", "s1"]);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM messages").get()?.c, 0);
  db.close();
});

// --- user-prompt hook through the CLI ---

test("user-prompt reads the payload from stdin and stays silent", () => {
  const { db, home } = fixture();
  const result = runHandled(
    db,
    home,
    ["user-prompt"],
    JSON.stringify({ session_id: "s1", prompt: "hello" }),
  );
  assert.deepEqual(result, { handled: true, stdout: [], stderr: [], exitCode: 0 });
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM messages").get()?.c, 1);
  db.close();
});

test("user-prompt with malformed stdin still exits 0 and writes nothing", () => {
  const { db, home } = fixture();
  const result = runHandled(db, home, ["user-prompt"], "{{{");
  assert.deepEqual(result, { handled: true, stdout: [], stderr: [], exitCode: 0 });
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM messages").get()?.c, 0);
  db.close();
});

// --- discard-current stdout contract ---

test("discard-current reports the discarded conversation id", () => {
  const { db, home } = fixture();
  logUserMessage(db, "s1", "discard me", { interface: "pi" }, deps);
  const conversationId = String(
    db.prepare("SELECT conversation_id FROM runtime_sessions WHERE session_id = 's1'").get()
      ?.conversation_id,
  );

  const result = runHandled(db, home, ["discard-current", "--session-id", "s1"]);

  assert.deepEqual(result.stdout, [`Discarded current conversation: ${conversationId}`]);
  db.close();
});

test("discard-current reports the empty case with the released string", () => {
  const { db, home } = fixture();
  assert.deepEqual(runHandled(db, home, ["discard-current"]).stdout, [
    "No current conversation to discard.",
  ]);
  db.close();
});

// --- --mirror-home targeting (parity with the Python fix, CV22.DS7.US5) ---

test("--mirror-home overrides the ambient home for the hook's mute gate", () => {
  const { db, home } = fixture();
  const explicitHome = mkdtempSync("/tmp/logger-cli-explicit-");
  // Mute only the explicit home; the ambient one stays active.
  runHandled(db, explicitHome, ["mute"]);

  const result = runHandled(
    db,
    home,
    ["user-prompt", "--mirror-home", explicitHome],
    JSON.stringify({ session_id: "s1", prompt: "must not be logged" }),
  );

  assert.equal(result.exitCode, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM messages").get()?.c, 0);
  db.close();
});

test("status reads mute state from --mirror-home, not the ambient home", () => {
  const { db, home } = fixture();
  const explicitHome = mkdtempSync("/tmp/logger-cli-explicit-");
  runHandled(db, explicitHome, ["mute"]);

  assert.deepEqual(runHandled(db, home, ["status"]).stdout, ["ACTIVE"]);
  assert.deepEqual(runHandled(db, home, ["status", "--mirror-home", explicitHome]).stdout, [
    "MUTED",
  ]);
  db.close();
});
