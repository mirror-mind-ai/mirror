import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  findConversationByIdPrefix,
  getMessagesForConversation,
  pythonTailSliceStart,
} from "../../src/conversation/recall.ts";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import {
  createConversationTables,
  insertConversation,
  insertMessage,
} from "../helpers/conversationSchema.ts";

function tempDb(): { db: WritableDatabase; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-recall-"));
  const tmp = join(dir, "tmp");
  mkdirSync(tmp);
  const db = openDatabaseCopyForWrite(join(tmp, "copy.db"));
  createConversationTables(db);
  return { db, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("findConversationByIdPrefix matches a LIKE prefix and returns null when absent", () => {
  const { db, cleanup } = tempDb();
  try {
    insertConversation(db, { id: "abc12345", startedAt: "2026-01-01T00:00:00Z", title: "Demo" });
    assert.equal(findConversationByIdPrefix(db, "abc1")?.id, "abc12345");
    assert.equal(findConversationByIdPrefix(db, "zzz"), null);
  } finally {
    db.close();
    cleanup();
  }
});

test("findConversationByIdPrefix returns the latest match by started_at when a prefix is ambiguous", () => {
  const { db, cleanup } = tempDb();
  try {
    insertConversation(db, { id: "abc-old", startedAt: "2026-01-01T00:00:00Z" });
    insertConversation(db, { id: "abc-new", startedAt: "2026-02-01T00:00:00Z" });
    assert.equal(findConversationByIdPrefix(db, "abc")?.id, "abc-new");
  } finally {
    db.close();
    cleanup();
  }
});

test("getMessagesForConversation returns messages oldest first", () => {
  const { db, cleanup } = tempDb();
  try {
    insertConversation(db, { id: "c1", startedAt: "2026-01-01T00:00:00Z" });
    insertMessage(db, {
      id: "m2",
      conversationId: "c1",
      role: "assistant",
      content: "second",
      createdAt: "2026-01-01T00:02:00Z",
    });
    insertMessage(db, {
      id: "m1",
      conversationId: "c1",
      role: "user",
      content: "first",
      createdAt: "2026-01-01T00:01:00Z",
    });
    assert.deepEqual(
      getMessagesForConversation(db, "c1").map((m) => m.content),
      ["first", "second"],
    );
  } finally {
    db.close();
    cleanup();
  }
});

test("pythonTailSliceStart reproduces Python's arr[-n:] including the n=0 => whole-array quirk", () => {
  assert.equal(pythonTailSliceStart(5, 50), 0); // limit far exceeds length: take all
  assert.equal(pythonTailSliceStart(5, 2), 3); // last 2 of 5
  assert.equal(pythonTailSliceStart(5, 0), 0); // -0 == 0 in Python: arr[0:], i.e. ALL elements
  assert.equal(pythonTailSliceStart(5, -3), 3); // negative n: arr[3:], drops the first 3
  assert.equal(pythonTailSliceStart(0, 50), 0); // empty array stays empty regardless
});
