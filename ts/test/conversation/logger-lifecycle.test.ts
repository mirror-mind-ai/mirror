// CV22.DS7.US5 slice A — conversation lifecycle (switch / end / discard).
//
// Characterizes `switch_conversation`, `end_session`, and
// `discard_current_conversation` from `src/memory/cli/conversation_logger.py`,
// plus the `end_conversation` close seam from
// `src/memory/services/conversation.py` (deterministic ended_at write +
// LLM-backed extraction/finalization tails, which are injected here).
//
// Parity landmine pinned by these tests: Python's store upsert treats None as
// "preserve" for conversation_id/interface/persona/journey/active, but as
// "set NULL" for closed_at/metadata (_UNSET sentinel). Switching with no
// persona argument therefore PRESERVES the session persona.

import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  discardCurrentConversation,
  endConversation,
  endSession,
  logUserMessage,
  switchConversation,
} from "#conversation/logger.ts";
import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import { createRuntimeTables } from "#helpers/runtimeSchema.ts";

const NOW = "2026-09-02T12:00:00.000000Z";
const LATER = "2026-09-02T13:00:00.000000Z";

let idCounter = 0;
const deps = {
  newId: () => {
    idCounter += 1;
    return `id${String(idCounter).padStart(6, "0")}`;
  },
  nowIso: () => NOW,
};
const laterDeps = { newId: deps.newId, nowIso: () => LATER };

function fixture(): WritableDatabase {
  const dir = mkdtempSync("/tmp/logger-lifecycle-");
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

function session(db: WritableDatabase, id: string): Record<string, unknown> | undefined {
  return db.prepare("SELECT * FROM runtime_sessions WHERE session_id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
}
function conversation(db: WritableDatabase, id: string): Record<string, unknown> | undefined {
  return db.prepare("SELECT * FROM conversations WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
}

// --- end_conversation close seam ---

test("endConversation writes ended_at deterministically and runs no tail by default", async () => {
  const db = fixture();
  logUserMessage(db, "s1", "hi", { interface: "pi" }, deps);
  const convId = String(session(db, "s1")?.conversation_id);

  await endConversation(db, convId, { extract: false }, laterDeps);

  assert.equal(conversation(db, convId)?.ended_at, LATER);
  db.close();
});

test("endConversation runs the extraction tail only when extract is true", async () => {
  const db = fixture();
  logUserMessage(db, "s1", "hi", { interface: "pi" }, deps);
  const convId = String(session(db, "s1")?.conversation_id);
  const calls: string[] = [];

  await endConversation(db, convId, { extract: false }, laterDeps, {
    runExtraction: () => {
      calls.push("extract");
    },
    finalizeMetadata: () => {
      calls.push("finalize");
    },
  });
  assert.deepEqual(calls, ["finalize"]);

  await endConversation(db, convId, { extract: true }, laterDeps, {
    runExtraction: () => {
      calls.push("extract");
    },
    finalizeMetadata: () => {
      calls.push("finalize");
    },
  });
  assert.deepEqual(calls, ["finalize", "extract", "finalize"]);
  db.close();
});

test("endConversation finalizes metadata even when extraction throws (Python finally)", async () => {
  const db = fixture();
  logUserMessage(db, "s1", "hi", { interface: "pi" }, deps);
  const convId = String(session(db, "s1")?.conversation_id);
  const calls: string[] = [];

  await assert.rejects(
    () =>
      endConversation(db, convId, { extract: true }, laterDeps, {
        runExtraction: () => {
          throw new Error("provider outage");
        },
        finalizeMetadata: () => {
          calls.push("finalize");
        },
      }),
    /provider outage/,
  );
  assert.deepEqual(calls, ["finalize"]);
  // ended_at is written before the tail, so the orphan is closed regardless.
  assert.equal(conversation(db, convId)?.ended_at, LATER);
  db.close();
});

// --- switch_conversation ---

test("switchConversation returns null when no session can be resolved", async () => {
  const db = fixture();
  assert.equal(await switchConversation(db, null, {}, deps), null);
  db.close();
});

test("switchConversation ends the old conversation and binds a fresh one", async () => {
  const db = fixture();
  logUserMessage(db, "s1", "first", { interface: "pi" }, deps);
  const oldId = String(session(db, "s1")?.conversation_id);

  const newId = await switchConversation(db, "s1", {}, laterDeps);

  assert.ok(newId);
  assert.notEqual(newId, oldId);
  assert.equal(conversation(db, oldId)?.ended_at, LATER);
  assert.equal(conversation(db, String(newId))?.ended_at, null);
  assert.equal(conversation(db, String(newId))?.interface, "pi"); // inherited
  const row = session(db, "s1");
  assert.equal(row?.conversation_id, newId);
  assert.equal(row?.active, 1);
  assert.equal(row?.closed_at, null);
  db.close();
});

test("switchConversation PRESERVES session persona/journey when not passed", async () => {
  // Python store upsert: persona=None / journey=None mean "preserve", not "clear".
  const db = fixture();
  logUserMessage(db, "s1", "first", { interface: "pi" }, deps);
  db.prepare("UPDATE runtime_sessions SET persona = ?, journey = ? WHERE session_id = ?").run(
    "engineer",
    "mirror-ts-core",
    "s1",
  );

  await switchConversation(db, "s1", {}, laterDeps);

  const row = session(db, "s1");
  assert.equal(row?.persona, "engineer");
  assert.equal(row?.journey, "mirror-ts-core");
  db.close();
});

test("switchConversation applies explicit persona/journey to session and new conversation", async () => {
  const db = fixture();
  logUserMessage(db, "s1", "first", { interface: "pi" }, deps);

  const newId = await switchConversation(
    db,
    "s1",
    { persona: "therapist", journey: "other" },
    laterDeps,
  );

  const row = session(db, "s1");
  assert.equal(row?.persona, "therapist");
  assert.equal(row?.journey, "other");
  assert.equal(conversation(db, String(newId))?.persona, "therapist");
  assert.equal(conversation(db, String(newId))?.journey, "other");
  db.close();
});

test("switchConversation defaults the interface to claude_code without a session interface", async () => {
  const db = fixture();
  db.prepare(
    "INSERT INTO runtime_sessions (session_id, active, started_at, updated_at) VALUES (?, 1, ?, ?)",
  ).run("s1", NOW, NOW);

  const newId = await switchConversation(db, "s1", {}, laterDeps);

  assert.equal(conversation(db, String(newId))?.interface, "claude_code");
  db.close();
});

// --- end_session ---

test("endSession is a no-op when the session has no bound conversation", async () => {
  const db = fixture();
  db.prepare(
    "INSERT INTO runtime_sessions (session_id, active, started_at, updated_at) VALUES (?, 1, ?, ?)",
  ).run("s1", NOW, NOW);

  await endSession(db, "s1", { extract: false }, laterDeps);

  assert.equal(session(db, "s1")?.active, 1);
  assert.equal(session(db, "s1")?.closed_at, null);
  db.close();
});

test("endSession closes the conversation and deactivates the session", async () => {
  const db = fixture();
  logUserMessage(db, "s1", "hi", { interface: "pi" }, deps);
  const convId = String(session(db, "s1")?.conversation_id);

  await endSession(db, "s1", { extract: false }, laterDeps);

  assert.equal(conversation(db, convId)?.ended_at, LATER);
  const row = session(db, "s1");
  assert.equal(row?.active, 0);
  assert.equal(row?.closed_at, LATER);
  db.close();
});

// CV21.DS4.TS2: the session is inactive BEFORE the LLM tail, so a cut during
// extraction (Codex's 1 s, Grok's 1.5 s) never leaves a session
// `active = 1` -- the state `guessRuntimeSessionId` reads as "the session"
// (DS12.TS2 L9).
test("endSession deactivates the session before the tail runs", async () => {
  const db = fixture();
  logUserMessage(db, "s1", "hi", { interface: "claude_code" }, deps);
  const seen: unknown[] = [];

  await endSession(db, "s1", { extract: true }, laterDeps, {
    runExtraction: () => {
      seen.push(session(db, "s1")?.active, session(db, "s1")?.closed_at);
    },
  });

  assert.deepEqual(seen, [0, LATER]);
  db.close();
});

test("endSession leaves the session inactive and the conversation ended when the tail throws", async () => {
  const db = fixture();
  logUserMessage(db, "s1", "hi", { interface: "claude_code" }, deps);
  const convId = String(session(db, "s1")?.conversation_id);

  await assert.rejects(
    endSession(db, "s1", { extract: true }, laterDeps, {
      runExtraction: () => {
        throw new Error("provider down");
      },
    }),
  );

  assert.equal(conversation(db, convId)?.ended_at, LATER);
  assert.equal(session(db, "s1")?.active, 0);
  db.close();
});

test("endSession with finalize off closes without any LLM work and flags the conversation as owed", async () => {
  const db = fixture();
  logUserMessage(db, "s1", "hi", { interface: "codex" }, deps);
  const convId = String(session(db, "s1")?.conversation_id);
  const calls: string[] = [];

  await endSession(db, "s1", { extract: false, finalize: false }, laterDeps, {
    runExtraction: () => {
      calls.push("extract");
    },
    finalizeMetadata: () => {
      calls.push("finalize");
    },
  });

  assert.deepEqual(calls, []);
  assert.equal(conversation(db, convId)?.ended_at, LATER);
  assert.equal(session(db, "s1")?.active, 0);
  const metadata = JSON.parse(String(conversation(db, convId)?.metadata ?? "{}"));
  assert.equal(metadata.close_tail_pending, true);
  db.close();
});

// --- discard_current_conversation ---

test("discardCurrentConversation returns null with no resolvable session", () => {
  const db = fixture();
  assert.equal(discardCurrentConversation(db, null, { interface: "pi" }, deps), null);
  db.close();
});

test("discardCurrentConversation returns null when the session has no conversation", () => {
  const db = fixture();
  db.prepare(
    "INSERT INTO runtime_sessions (session_id, interface, active, started_at, updated_at) VALUES (?, ?, 1, ?, ?)",
  ).run("s1", "pi", NOW, NOW);

  assert.equal(discardCurrentConversation(db, "s1", { interface: "pi" }, deps), null);
  db.close();
});

test("discardCurrentConversation deletes the conversation but preserves extracted memories", () => {
  const db = fixture();
  logUserMessage(db, "s1", "secret text", { interface: "pi" }, deps);
  const convId = String(session(db, "s1")?.conversation_id);
  db.prepare(
    "INSERT INTO memories (id, memory_type, title, content, conversation_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run("m1", "note", "Extracted", "kept", convId, NOW);
  db.prepare(
    "INSERT INTO llm_calls (id, conversation_id, role, called_at) VALUES (?, ?, ?, ?)",
  ).run("l1", convId, "extraction", NOW);

  const discarded = discardCurrentConversation(db, "s1", { interface: "pi" }, laterDeps);

  assert.equal(discarded, convId);
  assert.equal(conversation(db, convId), undefined);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM messages").get()?.c, 0);
  // memories survive with a nulled FK — the released "preserve extracted memories" contract
  const memory = db.prepare("SELECT * FROM memories WHERE id = 'm1'").get();
  assert.ok(memory);
  assert.equal(memory.conversation_id, null);
  assert.equal(
    db.prepare("SELECT conversation_id FROM llm_calls WHERE id = 'l1'").get()?.conversation_id,
    null,
  );

  const row = session(db, "s1");
  assert.equal(row?.conversation_id, null);
  assert.equal(row?.active, 0);
  assert.equal(row?.metadata, '{"discard_current_conversation": true}');
  db.close();
});

test("discardCurrentConversation resolves the newest active session for the interface", () => {
  const db = fixture();
  logUserMessage(db, "older", "a", { interface: "pi" }, deps);
  logUserMessage(db, "newer", "b", { interface: "pi" }, laterDeps);
  const newerConv = String(session(db, "newer")?.conversation_id);

  const discarded = discardCurrentConversation(db, null, { interface: "pi" }, laterDeps);

  assert.equal(discarded, newerConv);
  assert.ok(conversation(db, String(session(db, "older")?.conversation_id ?? "")));
  db.close();
});

// CV21.DS4.US4: on Codex 0.163.0 the daemon's reap fires SessionEnd thirty minutes
// after the TUI detaches, and maintenance may have closed the idle conversation
// first. A closed conversation is not closed twice: the session is deactivated,
// ended_at and the tail are left as they are.
test("endSession on a session whose conversation has already ended deactivates the session and runs no tail", async () => {
  const db = fixture();
  logUserMessage(db, "s1", "hi", { interface: "codex" }, deps);
  const convId = String(session(db, "s1")?.conversation_id);
  await endSession(db, "s1", { extract: false, finalize: false }, deps);
  const endedAt = conversation(db, convId)?.ended_at;
  db.prepare(
    "UPDATE runtime_sessions SET active = 1, closed_at = NULL WHERE session_id = 's1'",
  ).run();
  const calls: string[] = [];

  const closed = await endSession(db, "s1", { extract: true }, laterDeps, {
    runExtraction: () => {
      calls.push("extract");
    },
    finalizeMetadata: () => {
      calls.push("finalize");
    },
  });

  assert.equal(closed, true);
  assert.deepEqual(calls, []);
  assert.equal(conversation(db, convId)?.ended_at, endedAt, "ended_at is not rewritten");
  assert.equal(session(db, "s1")?.active, 0);
  assert.equal(session(db, "s1")?.closed_at, LATER);
  db.close();
});
