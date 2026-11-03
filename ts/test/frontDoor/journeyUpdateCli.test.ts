import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite, openDatabaseReadOnly } from "#db/database.ts";
import { spawnFrontDoor } from "#helpers/frontDoor.ts";
import { createIdentityTable, seedKnownMigrations } from "#helpers/identitySchema.ts";

function journeyDbCopy(): { dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-journeyupdatecli-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  const dbPath = join(tmpDir, "copy.db");
  const db = openDatabaseCopyForWrite(dbPath);
  createIdentityTable(db);
  seedKnownMigrations(db);
  db.close();
  return { dbPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function frontDoor(
  dbPath: string,
  args: string[],
): { status: number | null; stdout: string; stderr: string } {
  return spawnFrontDoor([...args, "--db-path", dbPath]);
}

test("front door `journey update` creates then updates journey_path via TS, always reporting 'updated'", () => {
  const { dbPath, cleanup } = journeyDbCopy();
  try {
    const created = frontDoor(dbPath, ["journey", "update", "demo", "First path content"]);
    assert.equal(created.status, 0);
    assert.match(created.stderr, /Journey path 'demo' updated\./);

    const updated = frontDoor(dbPath, ["journey", "update", "demo", "Second path content"]);
    assert.equal(updated.status, 0);
    assert.match(updated.stderr, /Journey path 'demo' updated\./);

    const db = openDatabaseReadOnly(dbPath);
    const row = db
      .prepare("SELECT content FROM identity WHERE layer = 'journey_path' AND key = 'demo'")
      .get();
    db.close();
    assert.equal(row?.content, "Second path content");
  } finally {
    cleanup();
  }
});

test("front door `journey update` does not require the journey slug to already exist", () => {
  const { dbPath, cleanup } = journeyDbCopy();
  try {
    const result = frontDoor(dbPath, ["journey", "update", "no-such-journey", "Some content"]);
    assert.equal(result.status, 0);
    const db = openDatabaseReadOnly(dbPath);
    const row = db
      .prepare(
        "SELECT content FROM identity WHERE layer = 'journey_path' AND key = 'no-such-journey'",
      )
      .get();
    db.close();
    assert.equal(row?.content, "Some content");
  } finally {
    cleanup();
  }
});

test("front door `journey update` reads content from stdin when given '-'", () => {
  const { dbPath, cleanup } = journeyDbCopy();
  try {
    const result = spawnFrontDoor(
      ["journey", "update", "demo", "-", "--db-path", dbPath],
      {},
      "Piped content\n",
    );
    assert.equal(result.status, 0);
    const db = openDatabaseReadOnly(dbPath);
    const row = db
      .prepare("SELECT content FROM identity WHERE layer = 'journey_path' AND key = 'demo'")
      .get();
    db.close();
    assert.equal(row?.content, "Piped content\n");
  } finally {
    cleanup();
  }
});

test("front door `journey update --file` reads the file as bytes (CR194)", () => {
  const { dbPath, cleanup } = journeyDbCopy();
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-journey-file-"));
  try {
    const text = "Caminho: ação, não reação.\n";
    const file = join(dir, "caminho.md");
    writeFileSync(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]));
    const result = spawnFrontDoor([
      "journey",
      "update",
      "demo",
      "--file",
      file,
      "--db-path",
      dbPath,
    ]);
    assert.equal(result.status, 0, result.stderr);
    const db = openDatabaseReadOnly(dbPath);
    const row = db
      .prepare("SELECT content FROM identity WHERE layer = 'journey_path' AND key = 'demo'")
      .get() as { content: string } | undefined;
    db.close();
    assert.equal(row?.content, text);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    cleanup();
  }
});

test("front door `journey update --file` with '-' or a missing file is refused without writing (CR194)", () => {
  const { dbPath, cleanup } = journeyDbCopy();
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-journey-file-"));
  try {
    const file = join(dir, "caminho.md");
    writeFileSync(file, "x\n");
    let result = spawnFrontDoor(
      ["journey", "update", "demo", "-", "--file", file, "--db-path", dbPath],
      {},
      "y\n",
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /--file and '-'/);
    result = spawnFrontDoor([
      "journey",
      "update",
      "demo",
      "--file",
      join(dir, "nope.md"),
      "--db-path",
      dbPath,
    ]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /cannot read /);
    const db = openDatabaseReadOnly(dbPath);
    const row = db
      .prepare("SELECT 1 FROM identity WHERE layer = 'journey_path' AND key = 'demo'")
      .get();
    db.close();
    assert.equal(row, undefined, "nothing was written");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    cleanup();
  }
});

test("front door `journey update` requires both a slug and content, exiting 1 like the oracle", () => {
  // Python's `journey update` prints its usage and `sys.exit(1)`. This route
  // returned 2 until CR073 -- a parity divergence on a flipped write path that
  // the golden (journeyUpdateGolden.test.ts, "usage: no content") now pins.
  const { dbPath, cleanup } = journeyDbCopy();
  try {
    const result = frontDoor(dbPath, ["journey", "update", "demo"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Pass '-' as <content> to read it from stdin/);
    assert.doesNotMatch(result.stderr, /-stdin/);
  } finally {
    cleanup();
  }
});
