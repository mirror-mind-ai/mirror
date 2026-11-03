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

test("a byte-order mark at the head of stdin is not stored as content", () => {
  // PowerShell writes one at the head of what it pipes or redirects; stored, it
  // became the first character of an identity entry.
  const { dbPath, cleanup } = identityDbCopy();
  try {
    const result = spawnFrontDoor(
      ["identity", "set", "ego", "probe", "--db-path", dbPath],
      {},
      "\uFEFF# From PowerShell\n",
    );
    assert.equal(result.status, 0, result.stderr);
    const db = openDatabaseReadOnly(dbPath);
    const row = db
      .prepare("SELECT content FROM identity WHERE layer = ? AND key = ?")
      .get("ego", "probe") as { content: string } | undefined;
    db.close();
    assert.equal(row?.content, "# From PowerShell\n");

    // A stdin that is nothing but the mark is empty content, and refused as such.
    const bare = spawnFrontDoor(
      ["identity", "set", "ego", "bare", "--db-path", dbPath],
      {},
      "\uFEFF",
    );
    assert.notEqual(bare.status, 0, "a bare BOM is not content");
    const again = openDatabaseReadOnly(dbPath);
    const none = again
      .prepare("SELECT 1 FROM identity WHERE layer = ? AND key = ?")
      .get("ego", "bare");
    again.close();
    assert.equal(none, undefined, "nothing was written");
  } finally {
    cleanup();
  }
});

// CR194: what PowerShell 5.1 and an editor on Windows put on stdin or in a file.
const ACCENTED = "# Perfil\n\nNão há transição sem ação.\n";

function readIdentity(dbPath: string, key: string): string | undefined {
  const db = openDatabaseReadOnly(dbPath);
  const row = db
    .prepare("SELECT content FROM identity WHERE layer = ? AND key = ?")
    .get("ego", key) as { content: string } | undefined;
  db.close();
  return row?.content;
}

test("UTF-16LE with a mark on stdin is stored as the text, accents intact, no mark", () => {
  const { dbPath, cleanup } = identityDbCopy();
  try {
    const bytes = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(ACCENTED, "utf16le")]);
    const result = spawnFrontDoor(
      ["identity", "set", "ego", "utf16", "--db-path", dbPath],
      {},
      bytes,
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readIdentity(dbPath, "utf16"), ACCENTED);
  } finally {
    cleanup();
  }
});

test("`identity set --file` reads the file as bytes, so the shell's pipe encoding never touches it", () => {
  const { dbPath, cleanup } = identityDbCopy();
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-identity-file-"));
  try {
    const utf8 = join(dir, "perfil.md");
    writeFileSync(utf8, ACCENTED, "utf8");
    let result = spawnFrontDoor([
      "identity",
      "set",
      "ego",
      "from-file",
      "--file",
      utf8,
      "--db-path",
      dbPath,
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readIdentity(dbPath, "from-file"), ACCENTED);

    // The same file as PowerShell 5.1's `>` would have written it.
    const utf16 = join(dir, "perfil-ps.md");
    writeFileSync(
      utf16,
      Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(ACCENTED, "utf16le")]),
    );
    result = spawnFrontDoor([
      "identity",
      "set",
      "ego",
      "from-ps-file",
      "--file",
      utf16,
      "--db-path",
      dbPath,
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readIdentity(dbPath, "from-ps-file"), ACCENTED);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    cleanup();
  }
});

test("`identity set --file` refuses a missing file, a directory, and --content beside it, writing nothing", () => {
  const { dbPath, cleanup } = identityDbCopy();
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-identity-file-"));
  try {
    const missing = join(dir, "no-such.md");
    let result = spawnFrontDoor([
      "identity",
      "set",
      "ego",
      "r1",
      "--file",
      missing,
      "--db-path",
      dbPath,
    ]);
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      new RegExp(`cannot read ${missing.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    );
    assert.doesNotMatch(result.stderr, /ENOENT|errno/);

    result = spawnFrontDoor(["identity", "set", "ego", "r2", "--file", dir, "--db-path", dbPath]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /cannot read /);
    assert.doesNotMatch(result.stderr, /EISDIR|errno/);

    const file = join(dir, "x.md");
    writeFileSync(file, "x\n");
    result = spawnFrontDoor([
      "identity",
      "set",
      "ego",
      "r3",
      "--file",
      file,
      "--content",
      "y",
      "--db-path",
      dbPath,
    ]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /--file and --content/);

    for (const key of ["r1", "r2", "r3"])
      assert.equal(readIdentity(dbPath, key), undefined, `${key} was not written`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
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
