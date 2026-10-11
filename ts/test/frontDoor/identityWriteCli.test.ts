import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite, openDatabaseReadOnly } from "#db/database.ts";
import { spawnFrontDoor } from "#helpers/frontDoor.ts";
import { createIdentityTable, seedKnownMigrations } from "#helpers/identitySchema.ts";
import { newIdentityKeyProblem } from "#identity/identityKey.ts";

function identityDbCopy(): { dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-fdcli-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  const dbPath = join(tmpDir, "copy.db");
  const db = openDatabaseCopyForWrite(dbPath);
  createIdentityTable(db);
  seedKnownMigrations(db);
  db.close();
  return { dbPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function frontDoor(dbPath: string, args: string[]): { status: number | null; stdout: string } {
  return spawnFrontDoor([...args, "--db-path", dbPath]);
}

test("front door `identity set` writes to the live DB via TS (create, then update)", () => {
  const { dbPath, cleanup } = identityDbCopy();
  try {
    const created = frontDoor(dbPath, ["identity", "set", "ego", "probe", "--content", "# One"]);
    assert.equal(created.status, 0);
    assert.match(created.stdout, /ego\/probe created/);

    const updated = frontDoor(dbPath, ["identity", "set", "ego", "probe", "--content", "# Two"]);
    assert.equal(updated.status, 0);
    assert.match(updated.stdout, /ego\/probe updated/);

    const db = openDatabaseReadOnly(dbPath);
    const row = db
      .prepare("SELECT content FROM identity WHERE layer = ? AND key = ?")
      .get("ego", "probe");
    db.close();
    assert.equal(row?.content, "# Two");
    // The pre-write backup was taken under the home's backups/ convention.
    assert.ok(existsSync(join(dbPath, "..", "backups", "frontdoor-pre-write-backup.db")));
  } finally {
    cleanup();
  }
});

test("front door rejects an empty `identity set` content without writing", () => {
  const { dbPath, cleanup } = identityDbCopy();
  try {
    const result = frontDoor(dbPath, ["identity", "set", "ego", "probe", "--content", "   "]);
    assert.equal(result.status, 1);
    const db = openDatabaseReadOnly(dbPath);
    const count = db.prepare("SELECT COUNT(*) AS c FROM identity").get()?.c;
    db.close();
    assert.equal(count, 0);
  } finally {
    cleanup();
  }
});

// --- CR104: a new journey or persona key must fit the grammar ------------------

function preWriteBackup(dbPath: string): string {
  return join(dbPath, "..", "backups", "frontdoor-pre-write-backup.db");
}

function identityKeys(dbPath: string): string[] {
  const db = openDatabaseReadOnly(dbPath);
  try {
    return db
      .prepare("SELECT layer || '/' || key AS name FROM identity ORDER BY name")
      .all()
      .map((row) => String(row.name));
  } finally {
    db.close();
  }
}

function plant(dbPath: string, layer: string, key: string): void {
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    db.prepare(
      "INSERT INTO identity (id, layer, key, content, version, created_at, updated_at) " +
        "VALUES ('planted', ?, ?, '# Planted', '1.0.0', 't', 't')",
    ).run(layer, key);
  } finally {
    db.close();
  }
}

test("CR104: identity set refuses a new key outside the grammar, before the write seam opens", () => {
  const { dbPath, cleanup } = identityDbCopy();
  try {
    for (const [layer, key, noun] of [
      ["journey", "x;touch PWNED", "journey slug"],
      ["journey", "-x", "journey slug"],
      ["persona", "Mixed_Case", "persona id"],
    ] as const) {
      const result = spawnFrontDoor([
        "identity",
        "set",
        layer,
        key,
        "--content",
        "# X",
        "--db-path",
        dbPath,
      ]);
      assert.equal(result.status, 1, result.stderr);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, `Error: ${newIdentityKeyProblem(layer, key)}\n`);
      assert.ok(result.stderr.startsWith(`Error: no ${layer} was created: `), result.stderr);
      assert.ok(result.stderr.includes(` is not a ${noun}. `), result.stderr);
    }
    assert.deepEqual(identityKeys(dbPath), [], "a refused key writes no row");
    assert.equal(existsSync(preWriteBackup(dbPath)), false, "a refusal takes no snapshot");
  } finally {
    cleanup();
  }
});

test("CR104: identity set creates a kebab-case key, and updates one that predates the grammar", () => {
  const { dbPath, cleanup } = identityDbCopy();
  try {
    plant(dbPath, "journey", "x;touch PWNED");
    const created = frontDoor(dbPath, ["identity", "set", "journey", "ai", "--content", "# AI"]);
    assert.equal(created.status, 0);
    assert.match(created.stdout, /journey\/ai created/u);
    const updated = frontDoor(dbPath, [
      "identity",
      "set",
      "journey",
      "x;touch PWNED",
      "--content",
      "# Two",
    ]);
    assert.equal(updated.status, 0);
    assert.match(updated.stdout, /journey\/x;touch PWNED updated/u);
    assert.deepEqual(identityKeys(dbPath), ["journey/ai", "journey/x;touch PWNED"]);
  } finally {
    cleanup();
  }
});

test("CR104: identity edit refuses a new key outside the grammar before the editor starts", () => {
  const { dbPath, cleanup } = identityDbCopy();
  const marker = `${dbPath}.editor-ran`;
  const editor = `${dbPath}.editor`;
  writeFileSync(editor, `#!/bin/sh\ntouch "${marker}"\nprintf '# J\\n' > "$1"\n`);
  chmodSync(editor, 0o755);
  try {
    const refused = spawnFrontDoor(
      ["identity", "edit", "journey", "Bad Slug", "--db-path", dbPath],
      {
        EDITOR: editor,
      },
    );
    assert.equal(refused.status, 1, refused.stderr);
    assert.match(
      refused.stderr,
      /^Error: no journey was created: 'Bad Slug' is not a journey slug\./u,
    );
    assert.equal(existsSync(marker), false, "the editor never started");
    assert.equal(existsSync(preWriteBackup(dbPath)), false, "a refusal takes no snapshot");

    plant(dbPath, "journey", "Bad Slug");
    const edited = spawnFrontDoor(
      ["identity", "edit", "journey", "Bad Slug", "--db-path", dbPath],
      {
        EDITOR: editor,
      },
    );
    assert.equal(edited.status, 0, edited.stderr);
    assert.equal(existsSync(marker), true, "a key that predates the grammar stays editable");
    assert.match(edited.stdout, /journey\/Bad Slug updated/u);
  } finally {
    cleanup();
  }
});
