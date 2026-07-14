import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import { applyIdentitySet } from "../../src/frontDoor/identityWrite.ts";
import { upsertIdentity } from "../../src/identity/identityStore.ts";
import { createIdentityTable } from "../helpers/identitySchema.ts";

const NOW = "2026-06-23T12:00:00.123000Z";
const LATER = "2026-06-24T09:30:00.500000Z";

function tempCopy(): { dbPath: string; tmpDir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-fdiw-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  return {
    dbPath: join(tmpDir, "copy.db"),
    tmpDir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function seed(db: WritableDatabase): void {
  createIdentityTable(db);
}

test("applyIdentitySet reports 'created' for a new key, INSERTing the row", () => {
  const { dbPath, cleanup } = tempCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    seed(db);
    const outcome = applyIdentitySet(db, {
      layer: "persona",
      key: "writer",
      content: "# Writer",
      id: "id-1",
      nowIso: NOW,
    });
    assert.deepEqual(outcome, { action: "created", layer: "persona", key: "writer" });
    assert.deepEqual(
      db.prepare("SELECT id, content, created_at, updated_at, metadata FROM identity").get(),
      { id: "id-1", content: "# Writer", created_at: NOW, updated_at: NOW, metadata: null },
    );
  } finally {
    db.close();
    cleanup();
  }
});

test("applyIdentitySet reports 'updated' and inherits stored metadata (metadata=None)", () => {
  const { dbPath, cleanup } = tempCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    seed(db);
    upsertIdentity(
      db,
      {
        id: "id-1",
        layer: "ego",
        key: "identity",
        content: "# Old",
        version: "1.0.0",
        metadata: '{"kept": true}',
      },
      NOW,
    );
    const outcome = applyIdentitySet(db, {
      layer: "ego",
      key: "identity",
      content: "# New",
      id: "id-IGNORED",
      nowIso: LATER,
    });
    assert.equal(outcome.action, "updated");
    assert.deepEqual(
      db.prepare("SELECT id, content, created_at, updated_at, metadata FROM identity").get(),
      {
        id: "id-1",
        content: "# New",
        created_at: NOW,
        updated_at: LATER,
        metadata: '{"kept": true}',
      },
    );
  } finally {
    db.close();
    cleanup();
  }
});
