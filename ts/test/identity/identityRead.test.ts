import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import {
  getIdentityContent,
  listAllIdentity,
  listIdentityByLayer,
} from "../../src/identity/identityRead.ts";
import { upsertIdentity } from "../../src/identity/identityStore.ts";
import { createIdentityTable } from "../helpers/identitySchema.ts";

const NOW = "2026-06-23T12:00:00.123000Z";

function tempDb(): { db: WritableDatabase; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-idread-"));
  const tmp = join(dir, "tmp");
  mkdirSync(tmp);
  const db = openDatabaseCopyForWrite(join(tmp, "copy.db"));
  createIdentityTable(db);
  return { db, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function seedRow(db: WritableDatabase, layer: string, key: string, content: string): void {
  upsertIdentity(
    db,
    { id: `${layer}-${key}`, layer, key, content, version: "1.0.0", metadata: null },
    NOW,
  );
}

test("listAllIdentity orders by layer then key across mixed layers", () => {
  const { db, cleanup } = tempDb();
  try {
    seedRow(db, "persona", "writer", "# Writer");
    seedRow(db, "ego", "behavior", "# Behavior");
    seedRow(db, "ego", "identity", "# Identity");
    assert.deepEqual(
      listAllIdentity(db).map((r) => [r.layer, r.key]),
      [
        ["ego", "behavior"],
        ["ego", "identity"],
        ["persona", "writer"],
      ],
    );
  } finally {
    db.close();
    cleanup();
  }
});

test("listIdentityByLayer filters to one layer, ordered by key", () => {
  const { db, cleanup } = tempDb();
  try {
    seedRow(db, "journey", "b-journey", "# B");
    seedRow(db, "journey", "a-journey", "# A");
    seedRow(db, "persona", "writer", "# Writer");
    assert.deepEqual(
      listIdentityByLayer(db, "journey").map((r) => r.key),
      ["a-journey", "b-journey"],
    );
  } finally {
    db.close();
    cleanup();
  }
});

test("getIdentityContent returns content for an existing row and null when absent", () => {
  const { db, cleanup } = tempDb();
  try {
    seedRow(db, "self", "soul", "# Soul\n\nI am a mirror.");
    assert.equal(getIdentityContent(db, "self", "soul"), "# Soul\n\nI am a mirror.");
    assert.equal(getIdentityContent(db, "self", "missing"), null);
  } finally {
    db.close();
    cleanup();
  }
});
