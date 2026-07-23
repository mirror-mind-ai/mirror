import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import { upsertIdentity } from "../../src/identity/identityStore.ts";
import { listPersonas } from "../../src/identity/personaListing.ts";
import { createIdentityTable } from "../helpers/identitySchema.ts";

const NOW = "2026-06-23T12:00:00.123000Z";

function tempDb(): { db: WritableDatabase; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-personas-"));
  const tmp = join(dir, "tmp");
  mkdirSync(tmp);
  const db = openDatabaseCopyForWrite(join(tmp, "copy.db"));
  createIdentityTable(db);
  return { db, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function seed(db: WritableDatabase, key: string, metadata: string | null, version = "1.0.0"): void {
  upsertIdentity(db, { id: key, layer: "persona", key, content: "x", version, metadata }, NOW);
}

test("listPersonas orders by key and parses routing_keywords", () => {
  const { db, cleanup } = tempDb();
  try {
    seed(db, "writer", '{"routing_keywords": ["prose", "essay"]}');
    seed(db, "engineer", '{"routing_keywords": ["code", "refactor"]}', "2.0.0");
    assert.deepEqual(listPersonas(db), [
      { key: "engineer", version: "2.0.0", routingKeywords: ["code", "refactor"] },
      { key: "writer", version: "1.0.0", routingKeywords: ["prose", "essay"] },
    ]);
  } finally {
    db.close();
    cleanup();
  }
});

test("listPersonas tolerates null/malformed/non-array metadata as no keywords", () => {
  const { db, cleanup } = tempDb();
  try {
    seed(db, "a-null", null);
    seed(db, "b-malformed", "{not json");
    seed(db, "c-non-array", '{"routing_keywords": "not-an-array"}');
    seed(db, "d-mixed", '{"routing_keywords": ["ok", 2, "fine"]}');
    assert.deepEqual(
      listPersonas(db).map((r) => r.routingKeywords),
      [[], [], [], ["ok", "fine"]],
    );
  } finally {
    db.close();
    cleanup();
  }
});
