// CV21.DS2.US8 — the prompt logger's new rules, and the Stop hook's reply rule.
//
// DS12 measured that the shared hooks labelled every runtime `claude_code`
// and never recorded a reply except through Claude Code's transcript
// backfill at session end (TS2 L7, L8; TS4 L7). Every Claude-schema runtime
// hands its Stop hook the turn's final answer, so the reply is logged there,
// beside its prompt. Three rules, each pinned here:
//
//   * the session's label is stamped on every prompt, skipped or not, so a
//     conversation the skill's `mirror mirror load` creates inherits it and
//     the hook's own session is the one the session guess finds;
//   * a Mirror turn is a conversation turn: its question is logged without
//     the form (US7's grammar), where every other slash command is skipped;
//   * a reply is logged when it answers a logged prompt -- by turn id when
//     both carry one, else when the conversation's last message is a logged
//     prompt -- and never otherwise.

import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  handleStopHook,
  handleUserPromptHook,
  logAssistantMessage,
  logUserMessage,
  setMute,
} from "#conversation/logger.ts";
import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import { createRuntimeTables } from "#helpers/runtimeSchema.ts";
import { upsertRuntimeSession } from "#mirror/runtimeSession.ts";
import { pythonJsonDumps } from "#util/pyGenerators.ts";

let clock = 0;
let idCounter = 0;
const deps = {
  newId: () => {
    idCounter += 1;
    return `us8-${String(idCounter).padStart(5, "0")}`;
  },
  // Monotonic, so `ORDER BY created_at` is the order the rows were written in.
  nowIso: () => {
    clock += 1;
    return `2026-10-13T12:00:${String(clock).padStart(2, "0")}.000000Z`;
  },
};

function fixture(): { db: WritableDatabase; home: string } {
  const home = mkdtempSync("/tmp/reply-logging-");
  const db = openDatabaseCopyForWrite(join(home, "copy.db"));
  createRuntimeTables(db);
  return { db, home };
}

function rows(db: WritableDatabase): { role: string; content: string; metadata: string | null }[] {
  return db
    .prepare("SELECT role, content, metadata FROM messages ORDER BY created_at, rowid")
    .all() as { role: string; content: string; metadata: string | null }[];
}

function sessionInterface(db: WritableDatabase, sessionId: string): string | null {
  const row = db
    .prepare("SELECT interface FROM runtime_sessions WHERE session_id = ?")
    .get(sessionId);
  return row ? (row.interface as string | null) : null;
}

function conversationInterfaces(db: WritableDatabase): string[] {
  return (db.prepare("SELECT interface FROM conversations").all() as { interface: string }[]).map(
    (row) => row.interface,
  );
}

const prompt = (
  db: WritableDatabase,
  home: string,
  payload: Record<string, unknown>,
  interfaceName = "claude_code",
) =>
  handleUserPromptHook(
    db,
    JSON.stringify(payload),
    { mirrorHome: home, interface: interfaceName },
    deps,
  );

const stop = (
  db: WritableDatabase,
  home: string,
  payload: Record<string, unknown>,
  interfaceName = "claude_code",
) =>
  handleStopHook(db, JSON.stringify(payload), { mirrorHome: home, interface: interfaceName }, deps);

// --- the label ---------------------------------------------------------------

test("a prompt carries the runtime's label onto the conversation and the session", () => {
  const { db, home } = fixture();
  prompt(db, home, { session_id: "c1", prompt: "hello", turn_id: "t1" }, "codex");
  assert.deepEqual(conversationInterfaces(db), ["codex"]);
  assert.equal(sessionInterface(db, "c1"), "codex");
  db.close();
});

test("a skipped slash command still stamps the session's label, and logs nothing", () => {
  // The conversation the skill's `mirror mirror load` then creates reads the
  // session row's interface; without the stamp it would read `claude_code`
  // on Grok, and `guessRuntimeSessionId` would not even find the row.
  const { db, home } = fixture();
  const outcome = prompt(db, home, { sessionId: "g1", prompt: "/mm-journeys" }, "grok_build");
  assert.deepEqual(outcome, { action: "skipped", reason: "slash_command" });
  assert.equal(rows(db).length, 0);
  assert.equal(sessionInterface(db, "g1"), "grok_build");
  db.close();
});

test("a Grok payload names its session in camelCase, and that is enough", () => {
  const { db, home } = fixture();
  prompt(db, home, { sessionId: "g2", promptId: "p1", prompt: "hello grok" }, "grok_build");
  assert.deepEqual(conversationInterfaces(db), ["grok_build"]);
  assert.deepEqual(rows(db), [
    { role: "user", content: "hello grok", metadata: '{"turn_id": "p1"}' },
  ]);
  db.close();
});

// --- the Mirror turn ---------------------------------------------------------

test("a Mirror turn is logged as its question, without the form", () => {
  const { db, home } = fixture();
  const outcome = prompt(db, home, {
    session_id: "s1",
    prompt: "/mirror-mind:mm-mirror should I raise my price?",
    prompt_id: "p1",
  });
  assert.deepEqual(outcome, { action: "logged", sessionId: "s1" });
  assert.deepEqual(rows(db), [
    { role: "user", content: "should I raise my price?", metadata: '{"turn_id": "p1"}' },
  ]);
  db.close();
});

test("a bare Mirror form has no question to log", () => {
  const { db, home } = fixture();
  const outcome = prompt(db, home, { session_id: "s1", prompt: "/mm:mirror", prompt_id: "p1" });
  assert.deepEqual(outcome, { action: "skipped", reason: "bare_mirror_form" });
  assert.equal(rows(db).length, 0);
  assert.equal(sessionInterface(db, "s1"), "claude_code");
  db.close();
});

test("a prompt without a turn id is logged without metadata, as before", () => {
  const { db, home } = fixture();
  prompt(db, home, { session_id: "s1", prompt: "plain" });
  assert.deepEqual(rows(db), [{ role: "user", content: "plain", metadata: null }]);
  db.close();
});

// --- the reply rule ----------------------------------------------------------

test("a reply is paired with its prompt by turn id", () => {
  const { db, home } = fixture();
  prompt(db, home, { session_id: "s1", prompt: "question", prompt_id: "p1" });
  const outcome = stop(db, home, {
    session_id: "s1",
    last_assistant_message: "answer",
    prompt_id: "p1",
  });
  assert.deepEqual(outcome, { action: "logged", sessionId: "s1", pairedBy: "turn_id" });
  assert.deepEqual(rows(db), [
    { role: "user", content: "question", metadata: '{"turn_id": "p1"}' },
    { role: "assistant", content: "answer", metadata: '{"turn_id": "p1"}' },
  ]);
  db.close();
});

test("a repeat Stop for an answered turn logs nothing", () => {
  // Grok fires an extra observe-only Stop at session end; a Stop hook that
  // blocked would make Claude Code fire again with a new answer.
  const { db, home } = fixture();
  prompt(db, home, { session_id: "s1", prompt: "question", prompt_id: "p1" });
  stop(db, home, { session_id: "s1", last_assistant_message: "answer", prompt_id: "p1" });
  const again = stop(db, home, {
    session_id: "s1",
    last_assistant_message: "answer, continued",
    prompt_id: "p1",
  });
  assert.deepEqual(again, { action: "skipped", reason: "already_answered" });
  assert.equal(rows(db).length, 2);
  db.close();
});

test("a summary logged by hand does not count as the turn's reply", () => {
  // The Mirror skill's step 3 once read as "record a summary" wherever a
  // session-aware path exists. `mirror mirror log` with no session id guesses
  // the hook's own session and appends an assistant row with no turn id. Had
  // that row counted as the answer, the real reply would have been dropped.
  const { db, home } = fixture();
  prompt(db, home, { session_id: "s1", prompt: "question", prompt_id: "p1" });
  logAssistantMessage(db, "s1", "a summary, by hand", { interface: "claude_code" }, deps);
  const outcome = stop(db, home, {
    session_id: "s1",
    last_assistant_message: "the reply",
    prompt_id: "p1",
  });
  assert.deepEqual(outcome, { action: "logged", sessionId: "s1", pairedBy: "turn_id" });
  assert.deepEqual(rows(db), [
    { role: "user", content: "question", metadata: '{"turn_id": "p1"}' },
    { role: "assistant", content: "a summary, by hand", metadata: null },
    { role: "assistant", content: "the reply", metadata: '{"turn_id": "p1"}' },
  ]);
  db.close();
});

test("Grok's session-end Stop, without a turn id after an answered turn, logs nothing", () => {
  const { db, home } = fixture();
  prompt(db, home, { sessionId: "g1", promptId: "p1", prompt: "question" }, "grok_build");
  stop(db, home, { sessionId: "g1", promptId: "p1", lastAssistantMessage: "answer" }, "grok_build");
  const atEnd = stop(db, home, { sessionId: "g1", lastAssistantMessage: "answer" }, "grok_build");
  assert.deepEqual(atEnd, { action: "skipped", reason: "session_event" });
  assert.equal(rows(db).length, 2);
  db.close();
});

test("without turn ids, a reply is paired with the prompt that is waiting", () => {
  const { db, home } = fixture();
  prompt(db, home, { session_id: "s1", prompt: "question" });
  const outcome = stop(db, home, { session_id: "s1", last_assistant_message: "answer" });
  assert.deepEqual(outcome, { action: "logged", sessionId: "s1", pairedBy: "last_message" });
  assert.deepEqual(rows(db), [
    { role: "user", content: "question", metadata: null },
    { role: "assistant", content: "answer", metadata: null },
  ]);
  db.close();
});

test("a reply with a turn id no logged prompt carries is not attached to a stale prompt", () => {
  // The current turn's prompt was skipped (a command), and an older prompt
  // is still waiting because its Stop was lost. Pairing the new reply with
  // the old question would record a conversation that never happened.
  const { db, home } = fixture();
  prompt(db, home, { session_id: "s1", prompt: "old question", prompt_id: "p1" });
  const outcome = stop(db, home, {
    session_id: "s1",
    last_assistant_message: "new answer",
    prompt_id: "p2",
  });
  assert.deepEqual(outcome, { action: "skipped", reason: "nothing_waiting" });
  assert.equal(rows(db).length, 1);
  db.close();
});

test("the reply to a command turn is not logged, and no conversation is created for it", () => {
  const { db, home } = fixture();
  prompt(db, home, { session_id: "s1", prompt: "/mm-journeys", prompt_id: "p1" });
  const outcome = stop(db, home, {
    session_id: "s1",
    last_assistant_message: "the list",
    prompt_id: "p1",
  });
  // An expected skip: the prompt hook recorded the turn it skipped as a command.
  assert.deepEqual(outcome, { action: "skipped", reason: "command_turn" });
  assert.equal(rows(db).length, 0);
  assert.deepEqual(conversationInterfaces(db), []);
  db.close();
});

test("a reply after a logged prompt and its reply, with no new prompt, is not logged", () => {
  const { db, home } = fixture();
  logUserMessage(db, "s1", "question", { interface: "claude_code" }, deps);
  logAssistantMessage(db, "s1", "answer", { interface: "claude_code" }, deps);
  const outcome = stop(db, home, { session_id: "s1", last_assistant_message: "another" });
  assert.deepEqual(outcome, { action: "skipped", reason: "session_event" });
  assert.equal(rows(db).length, 2);
  db.close();
});

test("only a reply whose turn was never seen is reported as lost", () => {
  // The race the plan names: on Claude Code the prompt logger runs async, so a
  // very short turn can reach Stop before its prompt is written. Nothing
  // explains that skip -- neither a logged prompt nor a recorded command turn
  // -- and it is the one skip the caller writes to hooks.log, which
  // `runtime diagnose` reads as a failure. The expected skips above are not.
  const { db, home } = fixture();
  prompt(db, home, { session_id: "s1", prompt: "question", prompt_id: "p1" });
  stop(db, home, { session_id: "s1", last_assistant_message: "answer", prompt_id: "p1" });
  const lost = stop(db, home, {
    session_id: "s1",
    last_assistant_message: "a reply",
    prompt_id: "p9",
  });
  assert.deepEqual(lost, { action: "skipped", reason: "nothing_waiting" });
  const first = stop(db, home, {
    session_id: "fresh",
    last_assistant_message: "a reply",
    prompt_id: "q1",
  });
  assert.deepEqual(
    first,
    { action: "skipped", reason: "nothing_waiting" },
    "a first turn lost to the race",
  );
  db.close();
});

test("recording a command turn keeps the session's other metadata", () => {
  // runtime_sessions.metadata is shared: the discard marker, the operating
  // mode, Soul, Explorer, and Builder all keep keys there.
  const { db, home } = fixture();
  upsertRuntimeSession(
    db,
    "s1",
    { metadata: pythonJsonDumps({ discard_current_conversation: true, other_key: 1 }) },
    deps.nowIso(),
  );
  prompt(db, home, { session_id: "s1", prompt: "/mm-journeys", prompt_id: "p1" });
  const row = db.prepare("SELECT metadata FROM runtime_sessions WHERE session_id = 's1'").get();
  assert.deepEqual(JSON.parse(String(row?.metadata)), {
    discard_current_conversation: true,
    other_key: 1,
    skipped_turn_id: "p1",
  });
  db.close();
});

test("an empty or missing message logs nothing", () => {
  // An interrupted turn, or one that only ran tools.
  const { db, home } = fixture();
  prompt(db, home, { session_id: "s1", prompt: "question", prompt_id: "p1" });
  assert.deepEqual(stop(db, home, { session_id: "s1", prompt_id: "p1" }), {
    action: "skipped",
    reason: "empty_message",
  });
  assert.deepEqual(
    stop(db, home, { session_id: "s1", last_assistant_message: "   ", prompt_id: "p1" }),
    {
      action: "skipped",
      reason: "empty_message",
    },
  );
  assert.equal(rows(db).length, 1);
  db.close();
});

test("a subagent's Stop is not the session's", () => {
  const { db, home } = fixture();
  prompt(db, home, { sessionId: "g1", promptId: "p1", prompt: "question" }, "grok_build");
  const outcome = stop(
    db,
    home,
    {
      sessionId: "g1",
      promptId: "p1",
      lastAssistantMessage: "a child's answer",
      subagentType: "explorer",
    },
    "grok_build",
  );
  assert.deepEqual(outcome, { action: "skipped", reason: "subagent" });
  assert.equal(rows(db).length, 1);
  db.close();
});

test("mute and the discard marker apply to replies as they do to prompts", () => {
  const { db, home } = fixture();
  prompt(db, home, { session_id: "s1", prompt: "question", prompt_id: "p1" });
  setMute(true, home);
  assert.deepEqual(
    stop(db, home, { session_id: "s1", last_assistant_message: "answer", prompt_id: "p1" }),
    {
      action: "muted",
    },
  );
  setMute(false, home);
  // The marker `discard-current` leaves on the session row.
  upsertRuntimeSession(
    db,
    "s1",
    { metadata: pythonJsonDumps({ discard_current_conversation: true }) },
    deps.nowIso(),
  );
  assert.deepEqual(
    stop(db, home, { session_id: "s1", last_assistant_message: "answer", prompt_id: "p1" }),
    {
      action: "skipped",
      reason: "discarded",
    },
  );
  assert.equal(rows(db).length, 1);
  db.close();
});

test("a malformed payload or a missing session is skipped, never thrown", () => {
  const { db, home } = fixture();
  assert.deepEqual(stop(db, home, {}), { action: "skipped", reason: "missing_session" });
  assert.deepEqual(handleStopHook(db, "not json", { mirrorHome: home }, deps), {
    action: "skipped",
    reason: "malformed_payload",
  });
  db.close();
});

test("the scripted journey: Mirror turn, ordinary turn, repeat Stop, command turn", () => {
  // The expected table from the test guide, on the Claude Code shape. The
  // Grok shape adds its session-end Stop (pinned above), and the transcript
  // backfill's fallback is pinned in transcriptBackfill.test.ts.
  const { db, home } = fixture();
  prompt(db, home, {
    session_id: "s1",
    prompt: "/mirror-mind:mm-mirror should I raise my price?",
    prompt_id: "p1",
  });
  stop(db, home, { session_id: "s1", last_assistant_message: "◇ cfo — raise it", prompt_id: "p1" });
  prompt(db, home, { session_id: "s1", prompt: "which tools can you see?", prompt_id: "p2" });
  stop(db, home, {
    session_id: "s1",
    last_assistant_message: "seven mirror-mind tools",
    prompt_id: "p2",
  });
  stop(db, home, {
    session_id: "s1",
    last_assistant_message: "seven mirror-mind tools",
    prompt_id: "p2",
  });
  prompt(db, home, { session_id: "s1", prompt: "/mm-journeys", prompt_id: "p3" });
  stop(db, home, { session_id: "s1", last_assistant_message: "the journey list", prompt_id: "p3" });
  assert.deepEqual(rows(db), [
    { role: "user", content: "should I raise my price?", metadata: '{"turn_id": "p1"}' },
    { role: "assistant", content: "◇ cfo — raise it", metadata: '{"turn_id": "p1"}' },
    { role: "user", content: "which tools can you see?", metadata: '{"turn_id": "p2"}' },
    { role: "assistant", content: "seven mirror-mind tools", metadata: '{"turn_id": "p2"}' },
  ]);
  assert.deepEqual(conversationInterfaces(db), ["claude_code"]);
  db.close();
});
