// CV21.DS4.TS2: the deferred close tail.
//
// A runtime that bounds its SessionEnd hook (Codex at 1 s, Grok at 1.5 s) cannot
// run the LLM tail at exit. The hook closes the session and flags the
// conversation; the next session start's maintenance finishes the tail. These
// cases pin the policy, the flag's hygiene (one helper, cleared by deleting the
// key), the selection (FIFO, bounded, extracted-or-ineligible only), and the
// maintenance step's count and carry-over.

import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  clearCloseTailPending,
  countDeferredCloseTails,
  DEFERRED_CLOSE_TAIL_LIMIT,
  finishDeferredCloseTails,
  isCloseTailPending,
  markCloseTailPending,
  selectDeferredCloseTails,
  sessionEndRunsLlmTail,
} from "#conversation/deferredCloseTail.ts";
import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import { createRuntimeTables } from "#helpers/runtimeSchema.ts";

function fixture(): WritableDatabase {
  const dir = mkdtempSync("/tmp/deferred-close-tail-");
  const db = openDatabaseCopyForWrite(join(dir, "copy.db"));
  createRuntimeTables(db);
  return db;
}

/** An ended conversation with `n` messages and the metadata given. */
function conversation(
  db: WritableDatabase,
  id: string,
  options: { endedAt: string; messages: number; journey?: string | null; metadata?: string | null },
): void {
  db.prepare(
    `INSERT INTO conversations (id, title, started_at, ended_at, interface, journey, metadata)
     VALUES (?, ?, ?, ?, 'codex', ?, ?)`,
  ).run(
    id,
    id,
    options.endedAt,
    options.endedAt,
    options.journey === undefined ? "j" : options.journey,
    options.metadata ?? null,
  );
  for (let i = 0; i < options.messages; i += 1) {
    db.prepare(
      "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(`${id}-m${i}`, id, i % 2 ? "assistant" : "user", `message ${i}`, options.endedAt);
  }
}

function metadataOf(db: WritableDatabase, id: string): Record<string, unknown> {
  const row = db.prepare("SELECT metadata FROM conversations WHERE id = ?").get(id);
  return typeof row?.metadata === "string" ? JSON.parse(row.metadata) : {};
}

// --- the policy ---

test("the LLM tail runs at exit on Claude Code, and not on the runtimes that bound SessionEnd", () => {
  // Claude Code registers the hook `async` and runs it after exit; Codex runs it
  // synchronously under a 1 s default (DS12.TS2 L2, DS2's live /hooks table);
  // Grok under 1.5 s (DS12.TS4).
  assert.equal(sessionEndRunsLlmTail("claude_code"), true);
  assert.equal(sessionEndRunsLlmTail("codex"), false);
  assert.equal(sessionEndRunsLlmTail("grok_build"), false);
});

test("an unknown or missing label keeps today's behavior: the tail runs", () => {
  assert.equal(sessionEndRunsLlmTail(null), true);
  assert.equal(sessionEndRunsLlmTail(""), true);
  assert.equal(sessionEndRunsLlmTail("pi"), true);
});

// --- the flag ---

test("the flag is set and cleared through one helper, and clearing deletes the key", () => {
  const db = fixture();
  conversation(db, "c1", {
    endedAt: "2026-10-17T10:00:00Z",
    messages: 4,
    metadata: '{"extracted": true}',
  });

  markCloseTailPending(db, "c1");
  assert.equal(isCloseTailPending(db, "c1"), true);
  // Read-modify-write: the sibling keys survive.
  assert.deepEqual(metadataOf(db, "c1"), { extracted: true, close_tail_pending: true });

  clearCloseTailPending(db, "c1");
  assert.equal(isCloseTailPending(db, "c1"), false);
  assert.deepEqual(metadataOf(db, "c1"), { extracted: true });
  assert.ok(!("close_tail_pending" in metadataOf(db, "c1")), "deleted, not written false");
  db.close();
});

test("marking a conversation with no metadata, or one that does not exist, is safe", () => {
  const db = fixture();
  conversation(db, "c1", { endedAt: "2026-10-17T10:00:00Z", messages: 1 });
  markCloseTailPending(db, "c1");
  assert.deepEqual(metadataOf(db, "c1"), { close_tail_pending: true });
  markCloseTailPending(db, "absent");
  clearCloseTailPending(db, "absent");
  db.close();
});

// --- the selection ---

test("selection is FIFO by ended_at, bounded, and takes only extracted or ineligible conversations", () => {
  const db = fixture();
  // Eligible for extraction and not yet extracted: left for extractPending first.
  conversation(db, "waiting", { endedAt: "2026-10-17T09:00:00Z", messages: 4 });
  // Extracted: ready to finalize.
  conversation(db, "done-late", {
    endedAt: "2026-10-17T11:00:00Z",
    messages: 4,
    metadata: '{"extracted": true}',
  });
  conversation(db, "done-early", {
    endedAt: "2026-10-17T10:00:00Z",
    messages: 4,
    metadata: '{"extracted": true}',
  });
  // Ineligible for extraction (too short, or no journey): nothing to wait for.
  conversation(db, "short", { endedAt: "2026-10-17T10:30:00Z", messages: 2 });
  conversation(db, "no-journey", { endedAt: "2026-10-17T10:45:00Z", messages: 6, journey: null });
  // Flagged nowhere: not selected.
  conversation(db, "unflagged", {
    endedAt: "2026-10-17T08:00:00Z",
    messages: 4,
    metadata: '{"extracted": true}',
  });
  for (const id of ["waiting", "done-late", "done-early", "short", "no-journey"]) {
    markCloseTailPending(db, id);
  }

  assert.deepEqual(
    selectDeferredCloseTails(db, null).map((c) => c.id),
    ["done-early", "short", "no-journey", "done-late"],
  );
  assert.deepEqual(
    selectDeferredCloseTails(db, 2).map((c) => c.id),
    ["done-early", "short"],
  );
  assert.equal(countDeferredCloseTails(db).count, 5);
  assert.equal(countDeferredCloseTails(db).oldestEndedAt, "2026-10-17T09:00:00Z");
  db.close();
});

test("the limit is the same order of magnitude as the sibling budgets", () => {
  assert.equal(DEFERRED_CLOSE_TAIL_LIMIT, 5);
});

// --- the maintenance step ---

test("finishing runs finalize for each selected conversation, clears the flag, and counts", async () => {
  const db = fixture();
  conversation(db, "a", {
    endedAt: "2026-10-17T10:00:00Z",
    messages: 4,
    metadata: '{"extracted": true}',
  });
  conversation(db, "b", { endedAt: "2026-10-17T10:01:00Z", messages: 2 });
  markCloseTailPending(db, "a");
  markCloseTailPending(db, "b");
  const finalized: string[] = [];

  const count = await finishDeferredCloseTails(db, {
    finalizeCloseTail: (_db, id) => {
      finalized.push(id);
    },
  });

  assert.equal(count, 2);
  assert.deepEqual(finalized, ["a", "b"]);
  assert.equal(isCloseTailPending(db, "a"), false);
  assert.equal(isCloseTailPending(db, "b"), false);
  db.close();
});

test("a failing finalize does not stop the loop, and leaves that flag for the next run", async () => {
  const db = fixture();
  conversation(db, "a", {
    endedAt: "2026-10-17T10:00:00Z",
    messages: 4,
    metadata: '{"extracted": true}',
  });
  conversation(db, "b", {
    endedAt: "2026-10-17T10:01:00Z",
    messages: 4,
    metadata: '{"extracted": true}',
  });
  markCloseTailPending(db, "a");
  markCloseTailPending(db, "b");

  const count = await finishDeferredCloseTails(db, {
    finalizeCloseTail: (_db, id) => {
      if (id === "a") throw new Error("provider down");
    },
  });

  assert.equal(count, 1);
  assert.equal(isCloseTailPending(db, "a"), true, "left for the next run");
  assert.equal(isCloseTailPending(db, "b"), false);
  db.close();
});

test("beyond the limit, the rest carry over with the flag intact", async () => {
  const db = fixture();
  for (let i = 0; i < DEFERRED_CLOSE_TAIL_LIMIT + 2; i += 1) {
    const id = `c${i}`;
    conversation(db, id, { endedAt: `2026-10-17T10:0${i}:00Z`, messages: 2 });
    markCloseTailPending(db, id);
  }

  const count = await finishDeferredCloseTails(db, { finalizeCloseTail: () => {} });

  assert.equal(count, DEFERRED_CLOSE_TAIL_LIMIT);
  assert.equal(countDeferredCloseTails(db).count, 2);
  db.close();
});
