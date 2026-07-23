import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import { ConversationNotFoundError, renderRecall } from "../../src/frontDoor/render/recall.ts";
import {
  createConversationTables,
  insertConversation,
  insertMessage,
} from "../helpers/conversationSchema.ts";

function tempDb(): { db: WritableDatabase; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-recallrender-"));
  const tmp = join(dir, "tmp");
  mkdirSync(tmp);
  const db = openDatabaseCopyForWrite(join(tmp, "copy.db"));
  createConversationTables(db);
  return { db, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("renderRecall throws ConversationNotFoundError with the original prefix argument", () => {
  const { db, cleanup } = tempDb();
  try {
    assert.throws(
      () => renderRecall(db, "zzz", 50),
      (error: unknown) =>
        error instanceof ConversationNotFoundError &&
        error.message === "Conversation 'zzz' not found.",
    );
  } finally {
    db.close();
    cleanup();
  }
});

test("renderRecall renders header fields, omits absent persona/journey/summary, reports no messages", () => {
  const { db, cleanup } = tempDb();
  try {
    insertConversation(db, { id: "c1", startedAt: "2026-06-01T12:00:00Z", title: null });
    assert.equal(
      renderRecall(db, "c1", 50),
      "# Conversation: (untitled)\n**Date:** 2026-06-01\n**ID:** `c1`\n\n---\n\n(conversation has no messages)\n",
    );
  } finally {
    db.close();
    cleanup();
  }
});

test("renderRecall includes persona/journey/summary when present, and labels roles", () => {
  const { db, cleanup } = tempDb();
  try {
    insertConversation(db, {
      id: "c1",
      startedAt: "2026-06-01T12:00:00Z",
      title: "Demo",
      persona: "engineer",
      journey: "mirror-ts-core",
      summary: "A short summary.",
    });
    insertMessage(db, {
      id: "m1",
      conversationId: "c1",
      role: "user",
      content: "hi",
      createdAt: "2026-06-01T12:01:00Z",
    });
    insertMessage(db, {
      id: "m2",
      conversationId: "c1",
      role: "assistant",
      content: "hello",
      createdAt: "2026-06-01T12:02:00Z",
    });
    insertMessage(db, {
      id: "m3",
      conversationId: "c1",
      role: "system",
      content: "sys note",
      createdAt: "2026-06-01T12:03:00Z",
    });
    assert.equal(
      renderRecall(db, "c1", 50),
      "# Conversation: Demo\n" +
        "**Date:** 2026-06-01\n" +
        "**Persona:** engineer\n" +
        "**Journey:** mirror-ts-core\n" +
        "**ID:** `c1`\n" +
        "\n**Summary:** A short summary.\n" +
        "\n---\n\n" +
        "**User:**\nhi\n\n" +
        "**Mirror:**\nhello\n\n" +
        "**Mirror:**\nsys note\n\n",
    );
  } finally {
    db.close();
    cleanup();
  }
});

test("renderRecall applies the limit as a message tail, including the limit=0 whole-history quirk", () => {
  const { db, cleanup } = tempDb();
  try {
    insertConversation(db, { id: "c1", startedAt: "2026-06-01T12:00:00Z" });
    insertMessage(db, {
      id: "m1",
      conversationId: "c1",
      role: "user",
      content: "one",
      createdAt: "2026-06-01T12:01:00Z",
    });
    insertMessage(db, {
      id: "m2",
      conversationId: "c1",
      role: "assistant",
      content: "two",
      createdAt: "2026-06-01T12:02:00Z",
    });
    const limited = renderRecall(db, "c1", 1);
    assert.ok(limited.includes("two") && !limited.includes("one"));
    const zero = renderRecall(db, "c1", 0);
    assert.ok(zero.includes("one") && zero.includes("two"));
  } finally {
    db.close();
    cleanup();
  }
});
