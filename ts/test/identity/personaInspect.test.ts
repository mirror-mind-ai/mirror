import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import { upsertIdentity } from "../../src/identity/identityStore.ts";
import { getPersonaInspect } from "../../src/identity/personaInspect.ts";
import { createIdentityTable } from "../helpers/identitySchema.ts";

const NOW = "2026-06-23T12:00:00.123000Z";

function tempDb(): { db: WritableDatabase; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-personainspect-"));
  const tmp = join(dir, "tmp");
  mkdirSync(tmp);
  const db = openDatabaseCopyForWrite(join(tmp, "copy.db"));
  createIdentityTable(db);
  return { db, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("getPersonaInspect returns null for a missing persona", () => {
  const { db, cleanup } = tempDb();
  try {
    assert.equal(getPersonaInspect(db, "ghost"), null);
  } finally {
    db.close();
    cleanup();
  }
});

test("getPersonaInspect parses object metadata", () => {
  const { db, cleanup } = tempDb();
  try {
    upsertIdentity(
      db,
      {
        id: "p1",
        layer: "persona",
        key: "engineer",
        content: "# Engineer",
        version: "1.0.0",
        metadata: '{"name": "Engineer", "routing_keywords": ["code"]}',
      },
      NOW,
    );
    const row = getPersonaInspect(db, "engineer");
    assert.deepEqual(row, {
      version: "1.0.0",
      updatedAt: NOW,
      content: "# Engineer",
      metadata: { name: "Engineer", routing_keywords: ["code"] },
    });
  } finally {
    db.close();
    cleanup();
  }
});

test("getPersonaInspect treats null/malformed/array metadata as {}", () => {
  const { db, cleanup } = tempDb();
  try {
    upsertIdentity(
      db,
      { id: "a", layer: "persona", key: "a", content: "x", version: "1.0.0", metadata: null },
      NOW,
    );
    upsertIdentity(
      db,
      {
        id: "b",
        layer: "persona",
        key: "b",
        content: "x",
        version: "1.0.0",
        metadata: "{not json",
      },
      NOW,
    );
    upsertIdentity(
      db,
      { id: "c", layer: "persona", key: "c", content: "x", version: "1.0.0", metadata: "[1,2,3]" },
      NOW,
    );
    assert.deepEqual(getPersonaInspect(db, "a")?.metadata, {});
    assert.deepEqual(getPersonaInspect(db, "b")?.metadata, {});
    assert.deepEqual(getPersonaInspect(db, "c")?.metadata, {});
  } finally {
    db.close();
    cleanup();
  }
});
