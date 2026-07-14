import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import { upsertIdentity } from "../../src/identity/identityStore.ts";
import { setIdentity } from "../../src/identity/setIdentity.ts";
import { createIdentityTable } from "../helpers/identitySchema.ts";

const NOW = "2026-06-23T12:00:00.123456Z";
const LATER = "2026-06-24T09:30:00.500000Z";

function tempCopy(): { dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-setident-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  return {
    dbPath: join(tmpDir, "copy.db"),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function seed(db: WritableDatabase): void {
  createIdentityTable(db);
}

function readRow(db: WritableDatabase, layer: string, key: string): unknown {
  return db
    .prepare(
      "SELECT id, layer, key, content, version, created_at, updated_at, metadata " +
        "FROM identity WHERE layer = ? AND key = ?",
    )
    .get(layer, key);
}

test("setIdentity INSERTs a new identity with injected id + now and default version", () => {
  const { dbPath, cleanup } = tempCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    seed(db);
    setIdentity(db, { id: "id-1", layer: "persona", key: "engineer", content: "# Engineer" }, NOW);
    assert.deepEqual(readRow(db, "persona", "engineer"), {
      id: "id-1",
      layer: "persona",
      key: "engineer",
      content: "# Engineer",
      version: "1.0.0",
      created_at: NOW,
      updated_at: NOW,
      metadata: null,
    });
  } finally {
    db.close();
    cleanup();
  }
});

test("setIdentity INSERTs with an explicit metadata string and version", () => {
  const { dbPath, cleanup } = tempCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    seed(db);
    setIdentity(
      db,
      {
        id: "id-1",
        layer: "persona",
        key: "engineer",
        content: "# Engineer",
        version: "2.1.0",
        metadata: '{"routing_keywords": ["code", "bug"]}',
      },
      NOW,
    );
    assert.deepEqual(readRow(db, "persona", "engineer"), {
      id: "id-1",
      layer: "persona",
      key: "engineer",
      content: "# Engineer",
      version: "2.1.0",
      created_at: NOW,
      updated_at: NOW,
      metadata: '{"routing_keywords": ["code", "bug"]}',
    });
  } finally {
    db.close();
    cleanup();
  }
});

test("setIdentity UPDATEs an existing identity, preserving id + created_at", () => {
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
        metadata: '{"a": 1}',
      },
      NOW,
    );
    setIdentity(
      db,
      {
        id: "id-IGNORED",
        layer: "ego",
        key: "identity",
        content: "# New",
        version: "1.0.1",
        metadata: '{"b": 2}',
      },
      LATER,
    );
    assert.deepEqual(readRow(db, "ego", "identity"), {
      id: "id-1",
      layer: "ego",
      key: "identity",
      content: "# New",
      version: "1.0.1",
      created_at: NOW,
      updated_at: LATER,
      metadata: '{"b": 2}',
    });
  } finally {
    db.close();
    cleanup();
  }
});

test("setIdentity with metadata undefined inherits the existing row's metadata", () => {
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
    // No metadata argument => inherit (mirrors Python set_identity metadata=None).
    setIdentity(db, { id: "id-2", layer: "ego", key: "identity", content: "# New" }, LATER);
    assert.deepEqual(readRow(db, "ego", "identity"), {
      id: "id-1",
      layer: "ego",
      key: "identity",
      content: "# New",
      version: "1.0.0",
      created_at: NOW,
      updated_at: LATER,
      metadata: '{"kept": true}',
    });
  } finally {
    db.close();
    cleanup();
  }
});

test("setIdentity with metadata null also inherits (explicit None)", () => {
  const { dbPath, cleanup } = tempCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    seed(db);
    upsertIdentity(
      db,
      {
        id: "id-1",
        layer: "self",
        key: "soul",
        content: "# Soul",
        version: "1.0.0",
        metadata: '{"kept": 1}',
      },
      NOW,
    );
    setIdentity(
      db,
      { id: "id-2", layer: "self", key: "soul", content: "# Soul v2", metadata: null },
      LATER,
    );
    assert.equal(
      (readRow(db, "self", "soul") as { metadata: string | null }).metadata,
      '{"kept": 1}',
    );
  } finally {
    db.close();
    cleanup();
  }
});

test("setIdentity with metadata omitted and no existing row stores null metadata", () => {
  const { dbPath, cleanup } = tempCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    seed(db);
    setIdentity(db, { id: "id-1", layer: "persona", key: "writer", content: "# Writer" }, NOW);
    assert.equal((readRow(db, "persona", "writer") as { metadata: string | null }).metadata, null);
  } finally {
    db.close();
    cleanup();
  }
});
