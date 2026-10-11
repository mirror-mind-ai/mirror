// CV22.DS7.US10 slice E — assistant-turn backfill from a Claude transcript.
//
// Graded as resulting state over the committed transcript fixture against
// `backfill.golden.json`: which conversations are in the transcript window,
// which are skipped because they already logged an assistant turn, which
// entries land in which conversation, and the `now` stamp Python gives every
// backfilled message. The failure semantics (skip a corrupt LINE, raise on a
// structurally invalid ENTRY after earlier appends committed) are pinned
// separately because the golden cannot record a raise.

import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  assistantText,
  backfillAssistantMessages,
  parseJsonl,
} from "#conversation/transcriptBackfill.ts";
import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import {
  frozenDeps,
  backfillGolden as golden,
  seedTranscriptConversations,
  snapshotState,
  TRANSCRIPT_PATH,
} from "#helpers/backfillFixture.ts";
import { createRuntimeTables } from "#helpers/runtimeSchema.ts";

function fixture(): { db: WritableDatabase; dir: string } {
  const dir = mkdtempSync("/tmp/transcript-backfill-");
  const db = openDatabaseCopyForWrite(join(dir, "copy.db"));
  createRuntimeTables(db);
  return { db, dir };
}

function messagesOf(db: WritableDatabase, conversationId: string): string[] {
  return db
    .prepare("SELECT content FROM messages WHERE conversation_id = ? ORDER BY rowid")
    .all(conversationId)
    .map((row) => String(row.content));
}

test("backfillAssistantMessages fills the fixture corpus exactly as Python does", () => {
  const { db } = fixture();
  const deps = frozenDeps();
  seedTranscriptConversations(db);

  backfillAssistantMessages(db, TRANSCRIPT_PATH, deps);
  assert.deepEqual(snapshotState(db), golden.transcript.state);

  // Every in-range conversation now has an assistant turn, so a re-run is a no-op.
  backfillAssistantMessages(db, TRANSCRIPT_PATH, deps);
  assert.deepEqual(snapshotState(db), golden.transcript.rerun_state);
  assert.deepEqual(golden.transcript.rerun_state, golden.transcript.state);
  db.close();
});

test("the window and the per-conversation bounds select entries, not the whole transcript", () => {
  const byId = new Map(golden.transcript.state.conversations.map((c) => [c.id, c]));
  const texts = (id: string) =>
    byId
      .get(id)
      ?.messages.filter((m) => m.role === "assistant")
      .map((m) => m.content.slice(0, 13));
  // conv-closed-empty (10:00..10:10): everything from 10:00:30 to 10:07, not 10:20.
  assert.deepEqual(texts("<conversation-1>"), [
    "Window-start ",
    "First answer,",
    "Boundary answ",
    "Shared answer",
  ]);
  // conv-has-assistant: untouched -- only its seeded turn.
  assert.deepEqual(texts("<conversation-2>"), ["assistant lin"]);
  // conv-before: out of range.
  assert.deepEqual(texts("<conversation-3>"), []);
  // conv-ends-at-window-start: in range because the SQL bound is `>=`, and
  // the one entry at that exact instant lands.
  assert.deepEqual(texts("<conversation-4>"), ["Window-start "]);
  // conv-open (10:05..window end): the entry exactly at its start (`<=`),
  // then 10:07, 10:20, and the 13:00 answer past the frozen clock -- the
  // window end is the transcript's maximum, not `now`.
  assert.deepEqual(texts("<conversation-5>"), [
    "Boundary answ",
    "Shared answer",
    "Late answer: ",
    "Future answer",
  ]);
  // conv-starts-at-window-end: in range because the SQL bound is `<=`.
  assert.deepEqual(texts("<conversation-6>"), ["Future answer"]);
  // conv-after: started after the window closed.
  assert.deepEqual(texts("<conversation-7>"), []);
  // Backfilled turns are stamped `now`, not with the transcript timestamp.
  const backfilled = byId.get("<conversation-1>")?.messages[1];
  assert.equal(backfilled?.created_at, golden.meta.now);
});

test("parseJsonl skips blank and unparseable lines and keeps everything else", () => {
  const dir = mkdtempSync("/tmp/transcript-parse-");
  const path = join(dir, "t.jsonl");
  writeFileSync(path, '{"a":1}\n\n   \nnot json\n[1,2]\n"str"\nnull\n{"b":2}\n');
  assert.deepEqual(parseJsonl(path), [{ a: 1 }, [1, 2], "str", null, { b: 2 }]);
});

test("assistantText mirrors Python's iteration and its failure modes", () => {
  assert.equal(
    assistantText([
      { type: "text", text: "  a  " },
      { type: "tool_use", name: "read" },
      { type: "text", text: " \n " },
      "stray",
      { type: "text", text: "b" },
    ]),
    "a\n\nb",
  );
  // Iterating a str or a dict yields no dict items.
  assert.equal(assistantText("plain string"), "");
  assert.equal(assistantText({ type: "text", text: "dict" }), "");
  // None and numbers cannot be iterated; a non-str text cannot be stripped.
  assert.throws(() => assistantText(null), TypeError);
  assert.throws(() => assistantText(7), TypeError);
  assert.throws(() => assistantText([{ type: "text", text: 7 }]), TypeError);
});

test("a structurally invalid entry raises after earlier appends already committed", () => {
  const { db, dir } = fixture();
  db.prepare(
    "INSERT INTO conversations (id, interface, started_at, ended_at) VALUES ('c1', 'claude_code', ?, ?)",
  ).run("2026-09-03T10:00:00.000000Z", "2026-09-03T10:10:00.000000Z");
  const path = join(dir, "t.jsonl");
  writeFileSync(
    path,
    [
      JSON.stringify({
        type: "assistant",
        timestamp: "2026-09-03T10:01:00.000000Z",
        message: { content: [{ type: "text", text: "landed" }] },
      }),
      JSON.stringify({
        type: "assistant",
        timestamp: "2026-09-03T10:02:00.000000Z",
        message: null,
      }),
      JSON.stringify({
        type: "assistant",
        timestamp: "2026-09-03T10:03:00.000000Z",
        message: { content: [{ type: "text", text: "never reached" }] },
      }),
    ].join("\n"),
  );

  // Python: `entry.get("message", {}).get(...)` on None raises AttributeError
  // with the first message already committed by `add_message`.
  assert.throws(() => backfillAssistantMessages(db, path, frozenDeps()), TypeError);
  assert.deepEqual(messagesOf(db, "c1"), ["landed"]);
  db.close();
});

test("an entry without a timestamp neither widens the window nor gets appended", () => {
  const { db, dir } = fixture();
  db.prepare(
    "INSERT INTO conversations (id, interface, started_at, ended_at) VALUES ('c1', 'claude_code', ?, NULL)",
  ).run("2026-09-03T10:00:00.000000Z");
  const path = join(dir, "t.jsonl");
  writeFileSync(
    path,
    [
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "no ts" }] },
      }),
      JSON.stringify({ type: "summary", summary: "also no ts" }),
    ].join("\n"),
  );
  // No timestamps at all: Python returns before touching the database.
  backfillAssistantMessages(db, path, frozenDeps());
  assert.deepEqual(messagesOf(db, "c1"), []);
  db.close();
});
