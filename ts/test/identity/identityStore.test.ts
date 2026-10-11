import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import { createIdentityTable } from "#helpers/identitySchema.ts";
import { InvalidIdentityKeyError } from "#identity/identityKey.ts";
import { updateIdentityMetadata, upsertIdentity } from "#identity/identityStore.ts";

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
  createIdentityTable(db);
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

// --- CR104: a new journey or persona key must fit the grammar ------------------

function row(layer: string, key: string, content = "# Row") {
  return { id: `id-${layer}`, layer, key, content, version: "1.0.0", metadata: null };
}

function keys(db: WritableDatabase): string[] {
  return db
    .prepare("SELECT layer || '/' || key AS name FROM identity ORDER BY name")
    .all()
    .map((entry) => String(entry.name));
}

test("CR104: upsertIdentity refuses to INSERT a journey or persona key outside the grammar", () => {
  const { dbPath, cleanup } = tempCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    seed(db);
    for (const [layer, key] of [
      ["journey", "x;touch PWNED"],
      ["persona", "Mixed_Case"],
    ] as const) {
      assert.throws(
        () => upsertIdentity(db, row(layer, key), NOW),
        (error: unknown) =>
          error instanceof InvalidIdentityKeyError &&
          error.layer === layer &&
          error.key === key &&
          error.message.startsWith(`no ${layer} was created: `),
      );
    }
    assert.deepEqual(keys(db), [], "a refused key writes no row");
  } finally {
    db.close();
    cleanup();
  }
});

test("CR104: a key that predates the grammar stays writable", () => {
  const { dbPath, cleanup } = tempCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    seed(db);
    db.prepare(
      "INSERT INTO identity (id, layer, key, content, version, created_at, updated_at) " +
        "VALUES ('planted', 'journey', 'x;touch PWNED', '# One', '1.0.0', ?, ?)",
    ).run(NOW, NOW);
    upsertIdentity(db, row("journey", "x;touch PWNED", "# Two"), LATER);
    const planted = db
      .prepare("SELECT id, content FROM identity WHERE layer = 'journey' AND key = ?")
      .get("x;touch PWNED");
    assert.deepEqual({ ...planted }, { id: "planted", content: "# Two" });
  } finally {
    db.close();
    cleanup();
  }
});

test("CR104: a kebab-case key is created, and other layers keep any key", () => {
  const { dbPath, cleanup } = tempCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    seed(db);
    upsertIdentity(db, row("journey", "mixed-case"), NOW);
    upsertIdentity(db, row("persona", "ai-engineer"), NOW);
    upsertIdentity(db, row("ego", "Anything Goes"), NOW);
    assert.deepEqual(keys(db), ["ego/Anything Goes", "journey/mixed-case", "persona/ai-engineer"]);
  } finally {
    db.close();
    cleanup();
  }
});
