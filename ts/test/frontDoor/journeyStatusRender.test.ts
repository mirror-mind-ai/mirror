import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import {
  renderJourneyStatus,
  resolveJourneyStatusSlug,
} from "../../src/frontDoor/render/journeyStatus.ts";
import { createConversationTables } from "../helpers/conversationSchema.ts";
import { createIdentityTable } from "../helpers/identitySchema.ts";

test("resolveJourneyStatusSlug: 'status <slug>' (2+ tokens) uses the slug", () => {
  assert.equal(resolveJourneyStatusSlug(["status", "demo"]), "demo");
});

test("resolveJourneyStatusSlug: a bare slug with no 'status' keyword is used directly", () => {
  assert.equal(resolveJourneyStatusSlug(["demo"]), "demo");
});

test("resolveJourneyStatusSlug: no tokens at all means every journey (null)", () => {
  assert.equal(resolveJourneyStatusSlug([]), null);
});

test("resolveJourneyStatusSlug: the verified quirk -- bare 'status' alone becomes the slug 'status', not 'show all'", () => {
  assert.equal(resolveJourneyStatusSlug(["status"]), "status");
});

function tempDb(): { db: WritableDatabase; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-journeystatusrender-"));
  const tmp = join(dir, "tmp");
  mkdirSync(tmp);
  const db = openDatabaseCopyForWrite(join(tmp, "copy.db"));
  createIdentityTable(db);
  createConversationTables(db);
  db.exec(
    "CREATE TABLE memories (id TEXT PRIMARY KEY, journey TEXT, title TEXT NOT NULL, created_at TEXT NOT NULL)",
  );
  return { db, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("renderJourneyStatus on a nonexistent slug renders an empty-history block, not an error", () => {
  const { db, cleanup } = tempDb();
  try {
    assert.equal(
      renderJourneyStatus(db, "totally-ghost"),
      "=== journey: totally-ghost ===\n" +
        "\n--- recent memories ---\n" +
        "  No recent memories.\n" +
        "\n--- recent conversations ---\n" +
        "  No recent conversations.\n" +
        "\n",
    );
  } finally {
    db.close();
    cleanup();
  }
});
