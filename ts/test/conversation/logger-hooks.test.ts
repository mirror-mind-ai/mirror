// CV22.DS7.US5 slice A — runtime hook entries (QA blocking item).
//
// Characterizes `hook_user_prompt` and `hook_session_end` from
// `src/memory/cli/conversation_logger.py`. These are the hot path: they fire
// on every message and every session close, so the dominant contract is
// "never crash the runtime" — Python wraps both in `except Exception: pass`
// and always exits 0. Slash-prefixed prompts are never logged.

import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  handleSessionEndHook,
  handleUserPromptHook,
  resolveTranscriptPath,
  setMute,
} from "#conversation/logger.ts";
import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import { createRuntimeTables } from "#helpers/runtimeSchema.ts";

const NOW = "2026-09-02T12:00:00.000000Z";

let idCounter = 0;
const deps = {
  newId: () => {
    idCounter += 1;
    return `hook${String(idCounter).padStart(5, "0")}`;
  },
  nowIso: () => NOW,
};

function fixture(): { db: WritableDatabase; home: string } {
  const home = mkdtempSync("/tmp/logger-hooks-");
  const db = openDatabaseCopyForWrite(join(home, "copy.db"));
  createRuntimeTables(db);
  return { db, home };
}

function messageCount(db: WritableDatabase): number {
  return Number(db.prepare("SELECT COUNT(*) AS c FROM messages").get()?.c ?? -1);
}

// --- hook_user_prompt ---

test("handleUserPromptHook logs a normal prompt and reports the session", () => {
  const { db, home } = fixture();
  const outcome = handleUserPromptHook(
    db,
    JSON.stringify({ session_id: "s1", prompt: "how does extraction work?" }),
    { mirrorHome: home },
    deps,
  );

  assert.deepEqual(outcome, { action: "logged", sessionId: "s1" });
  assert.equal(messageCount(db), 1);
  const conversation = db.prepare("SELECT * FROM conversations").get();
  assert.equal(conversation?.interface, "claude_code"); // Python's hook default
  db.close();
});

test("handleUserPromptHook writes nothing while muted", () => {
  const { db, home } = fixture();
  setMute(true, home);

  const outcome = handleUserPromptHook(
    db,
    JSON.stringify({ session_id: "s1", prompt: "should not be logged" }),
    { mirrorHome: home },
    deps,
  );

  assert.deepEqual(outcome, { action: "muted" });
  assert.equal(messageCount(db), 0);
  db.close();
});

test("handleUserPromptHook never logs slash commands", () => {
  const { db, home } = fixture();
  const outcome = handleUserPromptHook(
    db,
    JSON.stringify({ session_id: "s1", prompt: "/mm-build mirror-ts-core" }),
    { mirrorHome: home },
    deps,
  );

  assert.deepEqual(outcome, { action: "skipped", reason: "slash_command" });
  assert.equal(messageCount(db), 0);
  db.close();
});

test("handleUserPromptHook skips empty session_id or prompt", () => {
  const { db, home } = fixture();
  assert.deepEqual(
    handleUserPromptHook(
      db,
      JSON.stringify({ session_id: "", prompt: "x" }),
      { mirrorHome: home },
      deps,
    ),
    { action: "skipped", reason: "missing_session" },
  );
  assert.deepEqual(
    handleUserPromptHook(
      db,
      JSON.stringify({ session_id: "s1", prompt: "" }),
      { mirrorHome: home },
      deps,
    ),
    { action: "skipped", reason: "missing_prompt" },
  );
  assert.equal(messageCount(db), 0);
  db.close();
});

test("handleUserPromptHook swallows malformed stdin instead of crashing the runtime", () => {
  const { db, home } = fixture();
  const outcome = handleUserPromptHook(db, "{not json", { mirrorHome: home }, deps);

  assert.equal(outcome.action, "skipped");
  assert.equal(messageCount(db), 0);
  db.close();
});

test("handleUserPromptHook swallows a database failure instead of crashing the runtime", () => {
  const { db, home } = fixture();
  db.exec("DROP TABLE messages");

  const outcome = handleUserPromptHook(
    db,
    JSON.stringify({ session_id: "s1", prompt: "boom" }),
    { mirrorHome: home },
    deps,
  );

  assert.equal(outcome.action, "failed");
  db.close();
});

// --- hook_session_end ---

test("handleSessionEndHook ends the session and runs the injected close tail", () => {
  const { db, home } = fixture();
  handleUserPromptHook(
    db,
    JSON.stringify({ session_id: "s1", prompt: "hello" }),
    { mirrorHome: home },
    deps,
  );
  const calls: string[] = [];

  const outcome = handleSessionEndHook(
    db,
    JSON.stringify({ session_id: "s1" }),
    { mirrorHome: home, claudeProjectDir: null, homeDir: home },
    deps,
    { runExtraction: () => calls.push("extract"), finalizeMetadata: () => calls.push("finalize") },
  );

  assert.equal(outcome.action, "ended");
  // Python calls end_session(extract=True) from this hook.
  assert.deepEqual(calls, ["extract", "finalize"]);
  const session = db.prepare("SELECT * FROM runtime_sessions WHERE session_id = 's1'").get();
  assert.equal(session?.active, 0);
  assert.equal(session?.closed_at, NOW);
  db.close();
});

test("handleSessionEndHook skips a payload without a session id", () => {
  const { db, home } = fixture();
  const outcome = handleSessionEndHook(
    db,
    JSON.stringify({ transcript_path: "/tmp/x.jsonl" }),
    { mirrorHome: home, claudeProjectDir: null, homeDir: home },
    deps,
  );
  assert.deepEqual(outcome, { action: "skipped", reason: "missing_session" });
  db.close();
});

test("handleSessionEndHook swallows malformed stdin instead of crashing the runtime", () => {
  const { db, home } = fixture();
  const outcome = handleSessionEndHook(
    db,
    "]]not json[[",
    { mirrorHome: home, claudeProjectDir: null, homeDir: home },
    deps,
  );
  assert.equal(outcome.action, "skipped");
  db.close();
});

// --- transcript path resolution ---

test("resolveTranscriptPath prefers the explicit payload path", () => {
  assert.equal(
    resolveTranscriptPath("/explicit/path.jsonl", "s1", "/Users/me/project", "/Users/me"),
    "/explicit/path.jsonl",
  );
});

test("resolveTranscriptPath derives the Claude projects path by hashing the project dir", () => {
  // Python: project_dir.lstrip("/").replace("/", "-")
  assert.equal(
    resolveTranscriptPath("", "s1", "/Users/me/dev/project", "/Users/me"),
    "/Users/me/.claude/projects/Users-me-dev-project/s1.jsonl",
  );
});

test("resolveTranscriptPath returns null without a payload path or project dir", () => {
  assert.equal(resolveTranscriptPath("", "s1", "", "/Users/me"), null);
  assert.equal(resolveTranscriptPath("", "s1", null, "/Users/me"), null);
});
