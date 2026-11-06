// CV22.DS7.US10 slice E, rescoped by CR151 — assistant-turn backfill from a
// Claude transcript.
//
// The backfill fills ONE conversation, the one its caller names (the ending
// session's bound conversation), and only with the transcript's assistant
// entries inside that conversation's own window, each stamped with its
// transcript timestamp. The slice-E fixture corpus is kept: its seven
// conversations sit on every window boundary, so it grades both the window
// and the scoping -- naming one conversation must leave the other six exactly
// as they were. The golden that recorded Python filling all of them at once is
// a frozen record of the defect (see `backfillFixture.ts`), not an oracle.
//
// The failure semantics (skip a corrupt LINE, raise on a structurally invalid
// ENTRY after earlier appends committed) are pinned separately.

import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { getMessagesForConversation } from "#conversation/recall.ts";
import {
  assistantText,
  backfillAssistantMessages,
  normalizeTimestamp,
  parseJsonl,
} from "#conversation/transcriptBackfill.ts";
import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import {
  type BackfillState,
  frozenDeps,
  seedTranscriptConversations,
  snapshotState,
  TRANSCRIPT_PATH,
} from "#helpers/backfillFixture.ts";
import { createRuntimeTables } from "#helpers/runtimeSchema.ts";
import { tempDir } from "#helpers/tempDir.ts";

function fixture(): { db: WritableDatabase; dir: string } {
  const dir = tempDir("transcript-backfill-");
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

function assistantRows(
  db: WritableDatabase,
  conversationId: string,
): { content: string; created_at: string }[] {
  return db
    .prepare(
      "SELECT content, created_at FROM messages WHERE conversation_id = ? AND role = 'assistant' ORDER BY rowid",
    )
    .all(conversationId)
    .map((row) => ({ content: String(row.content), created_at: String(row.created_at) }));
}

/** The snapshot with one conversation (by its insertion alias) left out. */
function withoutConversation(state: BackfillState, alias: string): BackfillState {
  return { ...state, conversations: state.conversations.filter((c) => c.id !== alias) };
}

// The corpus, in seed order, with the aliases `snapshotState` gives them.
const CORPUS = [
  "conv-closed-empty",
  "conv-has-assistant",
  "conv-before",
  "conv-ends-at-window-start",
  "conv-open",
  "conv-starts-at-window-end",
  "conv-after",
] as const;

// What each conversation receives when it is the one named: its own window
// over the transcript, never anyone else's.
const EXPECTED: Record<(typeof CORPUS)[number], { prefix: string; created_at: string }[]> = {
  // 10:00..10:10: everything from 10:00:30 to 10:07, not 10:20.
  "conv-closed-empty": [
    { prefix: "Window-start ", created_at: "2026-09-03T10:00:30.000000Z" },
    { prefix: "First answer,", created_at: "2026-09-03T10:02:00.000000Z" },
    { prefix: "Boundary answ", created_at: "2026-09-03T10:05:00.000000Z" },
    { prefix: "Shared answer", created_at: "2026-09-03T10:07:00.000000Z" },
  ],
  // Already logged a reply of its own: untouched.
  "conv-has-assistant": [],
  // Ended before the transcript began.
  "conv-before": [],
  // Ends at 10:00:30.000Z (milliseconds): the entry at that exact instant lands.
  "conv-ends-at-window-start": [
    { prefix: "Window-start ", created_at: "2026-09-03T10:00:30.000000Z" },
  ],
  // Open from 10:05: the entry exactly at its start, then everything after,
  // including the 13:00 answer past the frozen clock.
  "conv-open": [
    { prefix: "Boundary answ", created_at: "2026-09-03T10:05:00.000000Z" },
    { prefix: "Shared answer", created_at: "2026-09-03T10:07:00.000000Z" },
    { prefix: "Late answer: ", created_at: "2026-09-03T10:20:00.000000Z" },
    { prefix: "Future answer", created_at: "2026-09-03T13:00:00.000000Z" },
  ],
  // Starts at 13:00:00.000Z (milliseconds): the entry at that instant lands.
  "conv-starts-at-window-end": [
    { prefix: "Future answer", created_at: "2026-09-03T13:00:00.000000Z" },
  ],
  // Started after the transcript's last entry.
  "conv-after": [],
};

for (const [index, conversationId] of CORPUS.entries()) {
  test(`naming ${conversationId} fills only it, inside its own window, at transcript time`, () => {
    const { db } = fixture();
    seedTranscriptConversations(db);
    const alias = `<conversation-${index + 1}>`;
    const before = snapshotState(db);

    backfillAssistantMessages(db, TRANSCRIPT_PATH, conversationId, frozenDeps());
    const after = snapshotState(db);

    // CR151: the other six conversations are exactly as they were, open and
    // reply-less ones included.
    assert.deepEqual(withoutConversation(after, alias), withoutConversation(before, alias));
    const landed = assistantRows(db, conversationId).map((row) => ({
      prefix: row.content.slice(0, 13),
      created_at: row.created_at,
    }));
    const seeded =
      conversationId === "conv-has-assistant"
        ? [{ prefix: "assistant lin", created_at: "2026-09-03T10:00:31.000000Z" }]
        : [];
    assert.deepEqual(landed, [...seeded, ...EXPECTED[conversationId]]);

    // A second run is a no-op: the conversation now has its reply.
    backfillAssistantMessages(db, TRANSCRIPT_PATH, conversationId, frozenDeps());
    assert.deepEqual(snapshotState(db), after);
    db.close();
  });
}

test("a conversation that does not exist is not created and nothing is written", () => {
  const { db } = fixture();
  seedTranscriptConversations(db);
  const before = snapshotState(db);
  backfillAssistantMessages(db, TRANSCRIPT_PATH, "no-such-conversation", frozenDeps());
  assert.deepEqual(snapshotState(db), before);
  db.close();
});

test("backfilled replies interleave with the prompts they answer for created_at readers", () => {
  const { db, dir } = fixture();
  db.prepare(
    "INSERT INTO conversations (id, interface, started_at, ended_at) VALUES ('c1', 'claude_code', ?, ?)",
  ).run("2026-09-03T10:00:00.000000Z", "2026-09-03T10:10:00.000000Z");
  const prompt = (id: string, content: string, createdAt: string) =>
    db
      .prepare(
        "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, 'c1', 'user', ?, ?)",
      )
      .run(id, content, createdAt);
  prompt("u1", "first prompt", "2026-09-03T10:00:10.000000Z");
  // A second prompt 456 µs after the first reply's millisecond: a raw `.123Z`
  // would sort after it; normalized `.123000Z` sorts before.
  prompt("u2", "second prompt", "2026-09-03T10:00:40.123456Z");
  const path = join(dir, "t.jsonl");
  writeFileSync(
    path,
    [
      JSON.stringify({
        type: "assistant",
        timestamp: "2026-09-03T10:00:40.123Z",
        message: { content: [{ type: "text", text: "first reply" }] },
      }),
      JSON.stringify({
        type: "assistant",
        timestamp: "2026-09-03T10:01:00.5Z",
        message: { content: [{ type: "text", text: "second reply" }] },
      }),
    ].join("\n"),
  );

  backfillAssistantMessages(db, path, "c1", frozenDeps());

  // Under the `now` stamp both replies sorted after both prompts.
  assert.deepEqual(
    getMessagesForConversation(db, "c1").map((m) => `${m.role}: ${m.content}`),
    [
      "user: first prompt",
      "assistant: first reply",
      "user: second prompt",
      "assistant: second reply",
    ],
  );
  assert.deepEqual(
    assistantRows(db, "c1").map((row) => row.created_at),
    ["2026-09-03T10:00:40.123000Z", "2026-09-03T10:01:00.500000Z"],
  );
  db.close();
});

test("normalizeTimestamp writes every readable instant in the logger's microsecond form", () => {
  assert.equal(normalizeTimestamp("2026-09-03T10:00:30.123Z"), "2026-09-03T10:00:30.123000Z");
  assert.equal(normalizeTimestamp("2026-09-03T10:00:30.123456Z"), "2026-09-03T10:00:30.123456Z");
  assert.equal(normalizeTimestamp("2026-09-03T10:00:30Z"), "2026-09-03T10:00:30.000000Z");
  // Beyond microseconds is truncated, not rounded.
  assert.equal(normalizeTimestamp("2026-09-03T10:00:30.1234567Z"), "2026-09-03T10:00:30.123456Z");
  // An offset is read as the instant it names.
  assert.equal(normalizeTimestamp("2026-09-03T12:00:30.5+02:00"), "2026-09-03T10:00:30.500000Z");
  assert.equal(normalizeTimestamp("yesterday-ish"), null);
});

test("parseJsonl skips blank and unparseable lines and keeps everything else", () => {
  const dir = tempDir("transcript-parse-");
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
  assert.throws(() => backfillAssistantMessages(db, path, "c1", frozenDeps()), TypeError);
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
  // No readable timestamp: nothing can be placed in the window.
  backfillAssistantMessages(db, path, "c1", frozenDeps());
  assert.deepEqual(messagesOf(db, "c1"), []);
  db.close();
});
