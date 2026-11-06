// CV22.DS7.US5 slice A — runtime hook entries (QA blocking item).
//
// Characterizes `hook_user_prompt` and `hook_session_end` from
// `src/memory/cli/conversation_logger.py`. These are the hot path: they fire
// on every message and every session close, so the dominant contract is
// "never crash the runtime" — Python wraps both in `except Exception: pass`
// and always exits 0. Slash-prefixed prompts are never logged.

import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
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
import { tempDir } from "#helpers/tempDir.ts";

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
  const home = tempDir("logger-hooks-");
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

test("handleUserPromptHook never logs slash commands: a command turn", () => {
  const { db, home } = fixture();
  const outcome = handleUserPromptHook(
    db,
    JSON.stringify({ session_id: "s1", prompt: "/mm-build mirror-ts-core" }),
    { mirrorHome: home },
    deps,
  );

  assert.deepEqual(outcome, { action: "skipped", reason: "command_turn" });
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

test("handleUserPromptHook swallows malformed stdin instead of crashing the runtime", async () => {
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

test("handleSessionEndHook ends the session and runs the injected close tail", async () => {
  const { db, home } = fixture();
  handleUserPromptHook(
    db,
    JSON.stringify({ session_id: "s1", prompt: "hello" }),
    { mirrorHome: home },
    deps,
  );
  const calls: string[] = [];

  const outcome = await handleSessionEndHook(
    db,
    JSON.stringify({ session_id: "s1" }),
    { mirrorHome: home, claudeProjectDir: null, homeDir: home },
    deps,
    {
      runExtraction: () => {
        calls.push("extract");
      },
      finalizeMetadata: () => {
        calls.push("finalize");
      },
    },
  );

  assert.equal(outcome.action, "ended");
  // Python calls end_session(extract=True) from this hook.
  assert.deepEqual(calls, ["extract", "finalize"]);
  const session = db.prepare("SELECT * FROM runtime_sessions WHERE session_id = 's1'").get();
  assert.equal(session?.active, 0);
  assert.equal(session?.closed_at, NOW);
  db.close();
});

// CV21.DS4.TS2: a runtime that bounds SessionEnd gets the close without the LLM
// tail; the conversation is flagged for the next session start.
function tailProbe(): {
  calls: string[];
  hooks: { runExtraction: () => void; finalizeMetadata: () => void };
} {
  const calls: string[] = [];
  return {
    calls,
    hooks: {
      runExtraction: () => {
        calls.push("extract");
      },
      finalizeMetadata: () => {
        calls.push("finalize");
      },
    },
  };
}

function conversationMetadata(db: WritableDatabase, sessionId: string): Record<string, unknown> {
  const row = db
    .prepare(
      `SELECT c.metadata FROM conversations c
       JOIN runtime_sessions s ON s.conversation_id = c.id WHERE s.session_id = ?`,
    )
    .get(sessionId);
  return typeof row?.metadata === "string" ? JSON.parse(row.metadata) : {};
}

test("handleSessionEndHook on a codex-labelled session closes without the tail and flags the conversation", async () => {
  const { db, home } = fixture();
  // US8 stamps the label on every prompt; the payload carries Codex's turn_id.
  handleUserPromptHook(
    db,
    JSON.stringify({ session_id: "s1", prompt: "hello", turn_id: "t1" }),
    { mirrorHome: home, interface: "codex" },
    deps,
  );
  const probe = tailProbe();

  const outcome = await handleSessionEndHook(
    db,
    JSON.stringify({ session_id: "s1", turn_id: "t1" }),
    { mirrorHome: home, claudeProjectDir: null, homeDir: home },
    deps,
    probe.hooks,
  );

  assert.equal(outcome.action, "ended");
  assert.deepEqual(probe.calls, [], "no LLM work inside Codex's 1 s");
  const session = db.prepare("SELECT * FROM runtime_sessions WHERE session_id = 's1'").get();
  assert.equal(session?.active, 0);
  assert.equal(session?.closed_at, NOW);
  assert.equal(conversationMetadata(db, "s1").close_tail_pending, true);
  db.close();
});

test("handleSessionEndHook on a claude_code-labelled session runs the tail at exit, and does not flag", async () => {
  const { db, home } = fixture();
  handleUserPromptHook(
    db,
    JSON.stringify({ session_id: "s1", prompt: "hello" }),
    { mirrorHome: home, interface: "claude_code" },
    deps,
  );
  const probe = tailProbe();

  await handleSessionEndHook(
    db,
    JSON.stringify({ session_id: "s1" }),
    { mirrorHome: home, claudeProjectDir: null, homeDir: home, interface: "codex" },
    deps,
    probe.hooks,
  );

  // The session row's label wins over what the hook passed.
  assert.deepEqual(probe.calls, ["extract", "finalize"]);
  assert.ok(!("close_tail_pending" in conversationMetadata(db, "s1")));
  db.close();
});

test("handleSessionEndHook falls back to the hook's interface when the session row has no label", async () => {
  const { db, home } = fixture();
  handleUserPromptHook(
    db,
    JSON.stringify({ session_id: "s1", prompt: "hello" }),
    { mirrorHome: home },
    deps,
  );
  db.prepare("UPDATE runtime_sessions SET interface = NULL WHERE session_id = 's1'").run();
  const probe = tailProbe();

  await handleSessionEndHook(
    db,
    JSON.stringify({ session_id: "s1" }),
    { mirrorHome: home, claudeProjectDir: null, homeDir: home, interface: "grok_build" },
    deps,
    probe.hooks,
  );

  assert.deepEqual(probe.calls, []);
  assert.equal(conversationMetadata(db, "s1").close_tail_pending, true);
  db.close();
});

test("handleSessionEndHook with no label anywhere keeps today's behavior: the tail runs", async () => {
  const { db, home } = fixture();
  handleUserPromptHook(
    db,
    JSON.stringify({ session_id: "s1", prompt: "hello" }),
    { mirrorHome: home },
    deps,
  );
  db.prepare("UPDATE runtime_sessions SET interface = NULL WHERE session_id = 's1'").run();
  const probe = tailProbe();

  await handleSessionEndHook(
    db,
    JSON.stringify({ session_id: "s1" }),
    { mirrorHome: home, claudeProjectDir: null, homeDir: home },
    deps,
    probe.hooks,
  );

  assert.deepEqual(probe.calls, ["extract", "finalize"]);
  db.close();
});

test("handleSessionEndHook with no session and no readable transcript does nothing", async () => {
  const { db, home } = fixture();
  const outcome = await handleSessionEndHook(
    db,
    JSON.stringify({ transcript_path: join(home, "absent.jsonl") }),
    { mirrorHome: home, claudeProjectDir: null, homeDir: home },
    deps,
  );
  assert.deepEqual(outcome, { action: "skipped", reason: "nothing_to_do" });
  assert.equal(messageCount(db), 0);
  db.close();
});

// CR151: the SessionEnd backfill fills the ending session's own conversation
// and nothing else. Each scenario runs the real hooks on a clock the test
// moves, with a transcript whose replies fall inside every open window -- the
// shape in which the time-window backfill copied one session's replies into
// other sessions' conversations.

function clock(start: string): { deps: typeof deps; at: (iso: string) => void } {
  let now = start;
  let counter = 0;
  return {
    deps: {
      newId: () => {
        counter += 1;
        return `cr151-${String(counter).padStart(4, "0")}`;
      },
      nowIso: () => now,
    },
    at: (iso: string) => {
      now = iso;
    },
  };
}

function writeTranscript(dir: string, replies: [string, string][]): string {
  const path = join(dir, "session.jsonl");
  writeFileSync(
    path,
    replies
      .map(([timestamp, text]) =>
        JSON.stringify({
          type: "assistant",
          timestamp,
          message: { role: "assistant", content: [{ type: "text", text }] },
        }),
      )
      .join("\n"),
  );
  return path;
}

function promptAs(
  db: WritableDatabase,
  home: string,
  sessionId: string,
  prompt: string,
  hookDeps: typeof deps,
): string {
  handleUserPromptHook(
    db,
    JSON.stringify({ session_id: sessionId, prompt }),
    { mirrorHome: home },
    hookDeps,
  );
  const row = db
    .prepare("SELECT conversation_id FROM runtime_sessions WHERE session_id = ?")
    .get(sessionId);
  return String(row?.conversation_id);
}

function contentsOf(db: WritableDatabase, conversationId: string): string[] {
  return db
    .prepare("SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at")
    .all(conversationId)
    .map((row) => `${String(row.role)}: ${String(row.content)}`);
}

const hookOptions = (home: string) => ({ mirrorHome: home, claudeProjectDir: null, homeDir: home });

test("CR151 evidence: an orphan killed mid-first-turn gets none of another session's replies", async () => {
  const { db, home } = fixture();
  const { deps: clocked, at } = clock("2026-10-20T18:17:00.000000Z");
  // The CR's `probe-direct`: a prompt logged, Stop never fired.
  const orphan = promptAs(db, home, "probe-direct", "diagnostic prompt", clocked);
  at("2026-10-20T20:41:00.000000Z");
  const live = promptAs(db, home, "probe-session", "say ready", clocked);
  const transcript = writeTranscript(home, [["2026-10-20T20:41:10.250Z", "ready"]]);
  at("2026-10-20T20:41:17.309000Z");

  const outcome = await handleSessionEndHook(
    db,
    JSON.stringify({ session_id: "probe-session", transcript_path: transcript }),
    hookOptions(home),
    clocked,
  );

  assert.deepEqual(outcome, {
    action: "ended",
    sessionId: "probe-session",
    transcriptPath: transcript,
    backfilled: true,
  });
  assert.deepEqual(contentsOf(db, live), ["user: say ready", "assistant: ready"]);
  assert.deepEqual(contentsOf(db, orphan), ["user: diagnostic prompt"]);
  // The reply carries the transcript's instant, not the SessionEnd clock.
  assert.equal(
    db
      .prepare("SELECT created_at FROM messages WHERE conversation_id = ? AND role = 'assistant'")
      .get(live)?.created_at,
    "2026-10-20T20:41:10.250000Z",
  );
  db.close();
});

test("CR151: a concurrent session still inside its first turn is left alone", async () => {
  const { db, home } = fixture();
  const { deps: clocked, at } = clock("2026-10-20T10:00:00.000000Z");
  const ending = promptAs(db, home, "ending", "first question", clocked);
  at("2026-10-20T10:00:05.000000Z");
  // Another live session on the same runtime, started inside the ending
  // session's window, its reply not yet logged.
  const concurrent = promptAs(db, home, "concurrent", "still thinking", clocked);
  const transcript = writeTranscript(home, [
    ["2026-10-20T10:00:20.000Z", "answer one"],
    ["2026-10-20T10:00:40.000Z", "answer two"],
  ]);
  at("2026-10-20T10:01:00.000000Z");

  await handleSessionEndHook(
    db,
    JSON.stringify({ session_id: "ending", transcript_path: transcript }),
    hookOptions(home),
    clocked,
  );

  assert.deepEqual(contentsOf(db, ending), [
    "user: first question",
    "assistant: answer one",
    "assistant: answer two",
  ]);
  assert.deepEqual(contentsOf(db, concurrent), ["user: still thinking"]);
  const other = db.prepare("SELECT ended_at FROM conversations WHERE id = ?").get(concurrent);
  assert.equal(other?.ended_at, null);
  db.close();
});

test("CR151: a late SessionEnd on a conversation maintenance already closed fills only it", async () => {
  const { db, home } = fixture();
  const { deps: clocked, at } = clock("2026-10-20T10:00:00.000000Z");
  const own = promptAs(db, home, "late", "question", clocked);
  at("2026-10-20T10:00:30.000000Z");
  const neighbor = promptAs(db, home, "neighbor", "open neighbor", clocked);
  // Maintenance closed the idle conversation at 10:02 before SessionEnd fired.
  db.prepare("UPDATE conversations SET ended_at = ? WHERE id = ?").run(
    "2026-10-20T10:02:00.000000Z",
    own,
  );
  const transcript = writeTranscript(home, [
    ["2026-10-20T10:01:00.000Z", "inside its window"],
    ["2026-10-20T10:05:00.000Z", "after its close"],
  ]);
  at("2026-10-20T10:30:00.000000Z");

  const outcome = await handleSessionEndHook(
    db,
    JSON.stringify({ session_id: "late", transcript_path: transcript }),
    hookOptions(home),
    clocked,
  );

  assert.equal(outcome.action, "ended");
  assert.deepEqual(contentsOf(db, own), ["user: question", "assistant: inside its window"]);
  assert.deepEqual(contentsOf(db, neighbor), ["user: open neighbor"]);
  db.close();
});

test("CR151: a transcript without a session id is attributed to nothing", async () => {
  const { db, home } = fixture();
  const { deps: clocked, at } = clock("2026-10-20T10:00:00.000000Z");
  const open = promptAs(db, home, "open", "unanswered", clocked);
  const transcript = writeTranscript(home, [["2026-10-20T10:00:20.000Z", "whose reply?"]]);
  at("2026-10-20T10:01:00.000000Z");
  const before = messageCount(db);

  const outcome = await handleSessionEndHook(
    db,
    JSON.stringify({ session_id: "", transcript_path: transcript }),
    hookOptions(home),
    clocked,
  );

  assert.deepEqual(outcome, { action: "skipped", reason: "nothing_to_do" });
  assert.equal(messageCount(db), before);
  assert.deepEqual(contentsOf(db, open), ["user: unanswered"]);
  db.close();
});

test("CR151: a session bound to no conversation ends and backfills nothing", async () => {
  const { db, home } = fixture();
  const { deps: clocked, at } = clock("2026-10-20T10:00:00.000000Z");
  const open = promptAs(db, home, "open", "unanswered", clocked);
  const transcript = writeTranscript(home, [["2026-10-20T10:00:20.000Z", "whose reply?"]]);
  at("2026-10-20T10:01:00.000000Z");

  const outcome = await handleSessionEndHook(
    db,
    JSON.stringify({ session_id: "never-prompted", transcript_path: transcript }),
    hookOptions(home),
    clocked,
  );

  assert.deepEqual(outcome, {
    action: "ended",
    sessionId: "never-prompted",
    transcriptPath: transcript,
    backfilled: false,
  });
  assert.deepEqual(contentsOf(db, open), ["user: unanswered"]);
  db.close();
});

test("handleSessionEndHook with an empty payload or a missing transcript writes nothing", async () => {
  const { db, home } = fixture();
  const { deps: clocked, at } = clock("2026-10-20T10:00:00.000000Z");
  const own = promptAs(db, home, "s-missing", "question", clocked);
  at("2026-10-20T10:01:00.000000Z");
  assert.deepEqual(await handleSessionEndHook(db, "{}", hookOptions(home), clocked), {
    action: "skipped",
    reason: "nothing_to_do",
  });
  const outcome = await handleSessionEndHook(
    db,
    JSON.stringify({ session_id: "s-missing", transcript_path: join(home, "missing.jsonl") }),
    hookOptions(home),
    clocked,
  );
  assert.equal(outcome.action, "ended");
  assert.equal(outcome.action === "ended" && outcome.backfilled, false);
  assert.deepEqual(contentsOf(db, own), ["user: question"]);
  db.close();
});

test("handleSessionEndHook ends a session without a transcript and reports no backfill", async () => {
  const { db, home } = fixture();
  handleUserPromptHook(
    db,
    JSON.stringify({ session_id: "s2", prompt: "hello" }),
    { mirrorHome: home },
    deps,
  );
  const outcome = await handleSessionEndHook(
    db,
    JSON.stringify({ session_id: "s2" }),
    { mirrorHome: home, claudeProjectDir: null, homeDir: home },
    deps,
  );
  assert.deepEqual(outcome, {
    action: "ended",
    sessionId: "s2",
    transcriptPath: null,
    backfilled: false,
  });
  assert.equal(
    db.prepare("SELECT active FROM runtime_sessions WHERE session_id = 's2'").get()?.active,
    0,
  );
  db.close();
});

test("handleSessionEndHook swallows a transcript failure after the session already ended", async () => {
  const { db, home } = fixture();
  handleUserPromptHook(
    db,
    JSON.stringify({ session_id: "s3", prompt: "hello" }),
    { mirrorHome: home },
    deps,
  );
  // A directory "exists" for the existence check, and reading it raises --
  // Python's IsADirectoryError inside the hook's except, after end_session.
  const outcome = await handleSessionEndHook(
    db,
    JSON.stringify({ session_id: "s3", transcript_path: home }),
    { mirrorHome: home, claudeProjectDir: null, homeDir: home },
    deps,
  );
  assert.equal(outcome.action, "failed");
  assert.equal(
    db.prepare("SELECT active FROM runtime_sessions WHERE session_id = 's3'").get()?.active,
    0,
  );
  db.close();
});

test("handleSessionEndHook swallows malformed stdin instead of crashing the runtime", async () => {
  const { db, home } = fixture();
  const outcome = await handleSessionEndHook(
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
