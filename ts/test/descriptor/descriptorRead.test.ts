import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import { allDescriptors, descriptorsByLayer } from "../../src/descriptor/descriptorRead.ts";
import { upsertIdentity } from "../../src/identity/identityStore.ts";
import { createIdentityTable } from "../helpers/identitySchema.ts";

const NOW = "2026-06-23T12:00:00.123000Z";

function tempDb(): { db: WritableDatabase; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-descread-"));
  const tmp = join(dir, "tmp");
  mkdirSync(tmp);
  const db = openDatabaseCopyForWrite(join(tmp, "copy.db"));
  createIdentityTable(db);
  db.exec(
    "CREATE TABLE identity_descriptors (layer TEXT NOT NULL, key TEXT NOT NULL, " +
      "descriptor TEXT NOT NULL, generated_at TEXT NOT NULL, PRIMARY KEY (layer, key))",
  );
  return { db, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function seedIdentity(db: WritableDatabase, layer: string, key: string): void {
  upsertIdentity(
    db,
    { id: `${layer}-${key}`, layer, key, content: "x", version: "1.0.0", metadata: null },
    NOW,
  );
}

function seedDescriptor(
  db: WritableDatabase,
  layer: string,
  key: string,
  descriptor: string,
): void {
  db.prepare(
    "INSERT INTO identity_descriptors (layer, key, descriptor, generated_at) VALUES (?, ?, ?, ?)",
  ).run(layer, key, descriptor, NOW);
}

test("descriptorsByLayer returns one layer's descriptors ordered by key", () => {
  const { db, cleanup } = tempDb();
  try {
    seedDescriptor(db, "persona", "writer", "Writes prose.");
    seedDescriptor(db, "persona", "engineer", "Ships code.");
    seedDescriptor(db, "journey", "demo", "A demo journey.");
    assert.deepEqual(descriptorsByLayer(db, "persona"), [
      { layer: "persona", key: "engineer", descriptor: "Ships code." },
      { layer: "persona", key: "writer", descriptor: "Writes prose." },
    ]);
  } finally {
    db.close();
    cleanup();
  }
});

test("allDescriptors is driven by identity order and excludes an orphaned descriptor", () => {
  const { db, cleanup } = tempDb();
  try {
    seedIdentity(db, "ego", "behavior");
    seedIdentity(db, "persona", "engineer");
    seedDescriptor(db, "ego", "behavior", "How I act.");
    seedDescriptor(db, "persona", "engineer", "Ships code.");
    // Orphaned: a descriptor with no matching identity row.
    seedDescriptor(db, "persona", "ghost", "No identity row for this one.");
    assert.deepEqual(allDescriptors(db), [
      { layer: "ego", key: "behavior", descriptor: "How I act." },
      { layer: "persona", key: "engineer", descriptor: "Ships code." },
    ]);
  } finally {
    db.close();
    cleanup();
  }
});

test("allDescriptors returns nothing when no identity row has a descriptor", () => {
  const { db, cleanup } = tempDb();
  try {
    seedIdentity(db, "ego", "behavior");
    assert.deepEqual(allDescriptors(db), []);
  } finally {
    db.close();
    cleanup();
  }
});
