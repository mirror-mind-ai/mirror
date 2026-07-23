import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import { renderConversationsListing } from "../../src/frontDoor/render/conversations.ts";
import { createConversationTables, insertConversation } from "../helpers/conversationSchema.ts";

function tempDb(): { db: WritableDatabase; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-convrender-"));
  const tmp = join(dir, "tmp");
  mkdirSync(tmp);
  const db = openDatabaseCopyForWrite(join(tmp, "copy.db"));
  createConversationTables(db);
  return { db, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("renderConversationsListing reports no conversations found", () => {
  const { db, cleanup } = tempDb();
  try {
    assert.equal(renderConversationsListing(db, {}), "No conversations found.\n");
  } finally {
    db.close();
    cleanup();
  }
});

test("renderConversationsListing formats journey before persona, and defaults title/date", () => {
  const { db, cleanup } = tempDb();
  try {
    insertConversation(db, {
      id: "conv12345678",
      startedAt: "2026-06-01T09:00:00Z",
      title: "Demo",
      persona: "engineer",
      journey: "mirror-ts-core",
    });
    insertConversation(db, { id: "bareconv0000", startedAt: "2026-05-01T09:00:00Z", title: null });
    assert.equal(
      renderConversationsListing(db, {}),
      // id.slice(0, 8): "conv12345678" -> "conv1234"; "bareconv0000" -> "bareconv".
      "**2026-06-01** | `conv1234`" +
        " [mirror-ts-core] \u25c7 engineer (0 msgs)\n" +
        "  Demo\n\n" +
        "**2026-05-01** | `bareconv`" +
        " (0 msgs)\n" +
        "  (untitled)\n\n",
    );
  } finally {
    db.close();
    cleanup();
  }
});
