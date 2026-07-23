import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import { upsertIdentity } from "../../src/identity/identityStore.ts";
import { listJourneysForListCommand } from "../../src/identity/journeyListing.ts";
import { createIdentityTable } from "../helpers/identitySchema.ts";

const NOW = "2026-06-23T12:00:00.123000Z";

function tempDb(): { db: WritableDatabase; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-journeylisting-"));
  const tmp = join(dir, "tmp");
  mkdirSync(tmp);
  const db = openDatabaseCopyForWrite(join(tmp, "copy.db"));
  createIdentityTable(db);
  return { db, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function seed(db: WritableDatabase, key: string, content: string): void {
  upsertIdentity(
    db,
    { id: key, layer: "journey", key, content, version: "1.0.0", metadata: null },
    NOW,
  );
}

test("extracts a **Status:** word and defaults to unknown when absent", () => {
  const { db, cleanup } = tempDb();
  try {
    seed(db, "with-status", "# Demo\n**Status:** active\n");
    seed(db, "without-status", "# Demo\nNo status line here.");
    assert.deepEqual(
      listJourneysForListCommand(db).map((r) => [r.key, r.status]),
      [
        ["with-status", "active"],
        ["without-status", "unknown"],
      ],
    );
  } finally {
    db.close();
    cleanup();
  }
});

test("prefers a Portuguese ## Descrição section over an English ## Description one", () => {
  const { db, cleanup } = tempDb();
  try {
    seed(
      db,
      "both-headers",
      "# Demo\n**Status:** active\n\n## Description\n\nEnglish text.\n\n## Descrição\n\nTexto em português.\n\n## Next",
    );
    assert.equal(listJourneysForListCommand(db)[0].description, "Texto em português.");
  } finally {
    db.close();
    cleanup();
  }
});

test("falls back to ## Description when no ## Descrição is present, capped at 120 chars", () => {
  const { db, cleanup } = tempDb();
  try {
    const long = "x".repeat(200);
    seed(db, "long-desc", `# Demo\n**Status:** active\n\n## Description\n\n${long}\n\n## Next`);
    const row = listJourneysForListCommand(db)[0];
    assert.equal(row.description.length, 120);
    assert.equal(row.description, "x".repeat(120));
  } finally {
    db.close();
    cleanup();
  }
});

test("returns an empty description when neither heading is present", () => {
  const { db, cleanup } = tempDb();
  try {
    seed(db, "no-desc", "# Demo\n**Status:** paused\nJust a status line.");
    assert.equal(listJourneysForListCommand(db)[0].description, "");
  } finally {
    db.close();
    cleanup();
  }
});
