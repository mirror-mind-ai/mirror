import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import { updateIdentityMetadata, upsertIdentity } from "../../src/identity/identityStore.ts";

const NOW = "2026-06-23T12:00:00.123456Z";
const LATER = "2026-06-24T09:30:00.500000Z";

function tempCopy(): { dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-ident-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  return {
    dbPath: join(tmpDir, "copy.db"),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function seed(db: WritableDatabase): void {
  db.exec(
    "CREATE TABLE identity (id TEXT PRIMARY KEY, layer TEXT NOT NULL, key TEXT NOT NULL, " +
      "content TEXT NOT NULL, version TEXT DEFAULT '1.0.0', created_at TEXT NOT NULL, " +
      "updated_at TEXT NOT NULL, metadata TEXT, UNIQUE(layer, key))",
  );
}

test("upsertIdentity INSERTs a new identity with the injected id and now", () => {
  const { dbPath, cleanup } = tempCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    seed(db);
    upsertIdentity(
      db,
      {
        id: "id-1",
        layer: "journey",
        key: "demo",
        content: "# Demo",
        version: "1.0.0",
        metadata: '{"project_path": "/x"}',
      },
      NOW,
    );
    assert.deepEqual(
      db
        .prepare(
          "SELECT id, layer, key, content, version, created_at, updated_at, metadata " +
            "FROM identity WHERE layer = ? AND key = ?",
        )
        .get("journey", "demo"),
      {
        id: "id-1",
        layer: "journey",
        key: "demo",
        content: "# Demo",
        version: "1.0.0",
        created_at: NOW,
        updated_at: NOW,
        metadata: '{"project_path": "/x"}',
      },
    );
  } finally {
    db.close();
    cleanup();
  }
});

test("upsertIdentity UPDATEs an existing identity, preserving id and created_at", () => {
  const { dbPath, cleanup } = tempCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    seed(db);
    upsertIdentity(
      db,
      {
        id: "id-1",
        layer: "journey",
        key: "demo",
        content: "# Demo",
        version: "1.0.0",
        metadata: null,
      },
      NOW,
    );
    upsertIdentity(
      db,
      {
        id: "id-IGNORED",
        layer: "journey",
        key: "demo",
        content: "# Updated",
        version: "1.0.1",
        metadata: '{"a": 1}',
      },
      LATER,
    );
    assert.deepEqual(
      db
        .prepare(
          "SELECT id, content, version, created_at, updated_at, metadata FROM identity " +
            "WHERE layer = ? AND key = ?",
        )
        .get("journey", "demo"),
      {
        id: "id-1",
        content: "# Updated",
        version: "1.0.1",
        created_at: NOW,
        updated_at: LATER,
        metadata: '{"a": 1}',
      },
    );
  } finally {
    db.close();
    cleanup();
  }
});

test("updateIdentityMetadata updates only metadata and updated_at", () => {
  const { dbPath, cleanup } = tempCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    seed(db);
    upsertIdentity(
      db,
      {
        id: "id-1",
        layer: "journey",
        key: "demo",
        content: "# Demo",
        version: "1.0.0",
        metadata: '{"project_path": "/x"}',
      },
      NOW,
    );
    updateIdentityMetadata(db, "journey", "demo", '{"project_path": "/y"}', LATER);
    assert.deepEqual(
      db
        .prepare(
          "SELECT content, created_at, updated_at, metadata FROM identity WHERE layer = ? AND key = ?",
        )
        .get("journey", "demo"),
      {
        content: "# Demo",
        created_at: NOW,
        updated_at: LATER,
        metadata: '{"project_path": "/y"}',
      },
    );
  } finally {
    db.close();
    cleanup();
  }
});
