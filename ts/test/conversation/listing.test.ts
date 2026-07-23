import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  buildListRecentConversationsQuery,
  listRecentConversationSummaries,
} from "../../src/conversation/listing.ts";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import {
  createConversationTables,
  insertConversation,
  insertMessage,
} from "../helpers/conversationSchema.ts";

function tempDb(): { db: WritableDatabase; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-convlisting-"));
  const tmp = join(dir, "tmp");
  mkdirSync(tmp);
  const db = openDatabaseCopyForWrite(join(tmp, "copy.db"));
  createConversationTables(db);
  return { db, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("buildListRecentConversationsQuery adds clauses in journey -> persona order", () => {
  assert.deepEqual(
    buildListRecentConversationsQuery({ journey: "demo", persona: "engineer", limit: 5 }),
    {
      sql:
        "SELECT id, title, started_at, persona, journey, " +
        "(SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count " +
        "FROM conversations c WHERE 1=1 AND journey = ? AND persona = ? ORDER BY started_at DESC LIMIT ?",
      params: ["demo", "engineer", 5],
    },
  );
});

test("listRecentConversationSummaries orders newest first and counts messages per conversation", () => {
  const { db, cleanup } = tempDb();
  try {
    insertConversation(db, { id: "old", startedAt: "2026-01-01T00:00:00Z", journey: "demo" });
    insertConversation(db, { id: "new", startedAt: "2026-02-01T00:00:00Z", journey: "demo" });
    insertMessage(db, {
      id: "m1",
      conversationId: "new",
      role: "user",
      content: "a",
      createdAt: "2026-02-01T00:01:00Z",
    });
    insertMessage(db, {
      id: "m2",
      conversationId: "new",
      role: "assistant",
      content: "b",
      createdAt: "2026-02-01T00:02:00Z",
    });
    const rows = listRecentConversationSummaries(db);
    assert.deepEqual(
      rows.map((r) => [r.id, r.message_count]),
      [
        ["new", 2],
        ["old", 0],
      ],
    );
  } finally {
    db.close();
    cleanup();
  }
});

test("listRecentConversationSummaries filters by journey and persona", () => {
  const { db, cleanup } = tempDb();
  try {
    insertConversation(db, {
      id: "a",
      startedAt: "2026-01-01T00:00:00Z",
      journey: "demo",
      persona: "engineer",
    });
    insertConversation(db, {
      id: "b",
      startedAt: "2026-01-02T00:00:00Z",
      journey: "other",
      persona: "engineer",
    });
    insertConversation(db, {
      id: "c",
      startedAt: "2026-01-03T00:00:00Z",
      journey: "demo",
      persona: "therapist",
    });
    assert.deepEqual(
      listRecentConversationSummaries(db, { journey: "demo" }).map((r) => r.id),
      ["c", "a"],
    );
    assert.deepEqual(
      listRecentConversationSummaries(db, { journey: "demo", persona: "engineer" }).map(
        (r) => r.id,
      ),
      ["a"],
    );
  } finally {
    db.close();
    cleanup();
  }
});
