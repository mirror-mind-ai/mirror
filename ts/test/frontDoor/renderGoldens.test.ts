import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite } from "../../src/db/database.ts";
import { KNOWN_MIGRATION_IDS } from "../../src/db/schemaState.ts";
import { buildRenderFixture } from "../helpers/renderFixture.ts";

const CLI = "src/frontDoor/cli.ts";
const GOLDEN_DIR = "test/goldens/render";
const UPDATE = process.env.UPDATE_GOLDENS === "1";

// The database is passed via DB_PATH env, not --db-path, so no flag token can
// pollute the detect-persona query text (a real leak the renderer has today,
// fixed under CR002). This keeps the render goldens deterministic.
function render(dbPath: string, args: string[]): string {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "--no-warnings", DB_PATH: dbPath },
  });
  assert.equal(result.status, 0, `render failed: ${result.stderr}`);
  return result.stdout;
}

function withFixture(fn: (dbPath: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-render-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  try {
    fn(join(tmpDir, "copy.db"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Compare rendered output to a committed golden, or (re)write it under UPDATE_GOLDENS=1. */
function assertGolden(name: string, actual: string): void {
  const path = join(GOLDEN_DIR, `${name}.txt`);
  if (UPDATE || !existsSync(path)) {
    mkdirSync(GOLDEN_DIR, { recursive: true });
    writeFileSync(path, actual);
    return;
  }
  assert.equal(actual, readFileSync(path, "utf8"), `render output drifted from ${path}`);
}

test("journeys render output matches the golden", () => {
  withFixture((dbPath) => {
    buildRenderFixture(dbPath);
    assertGolden("journeys", render(dbPath, ["journeys"]));
  });
});

test("memories render output matches the golden", () => {
  withFixture((dbPath) => {
    buildRenderFixture(dbPath);
    assertGolden("memories", render(dbPath, ["memories"]));
  });
});

test("detect-persona render output matches the golden", () => {
  withFixture((dbPath) => {
    buildRenderFixture(dbPath);
    assertGolden("detect-persona", render(dbPath, ["detect-persona", "code", "refactor"]));
  });
});

/** A schema-valid database with no journeys or memories (empty-state edges). */
function buildEmptyFixture(dbPath: string): void {
  const db = openDatabaseCopyForWrite(dbPath);
  db.exec(
    "CREATE TABLE identity (id TEXT PRIMARY KEY, layer TEXT NOT NULL, key TEXT NOT NULL, " +
      "content TEXT NOT NULL, version TEXT DEFAULT '1.0.0', created_at TEXT NOT NULL, " +
      "updated_at TEXT NOT NULL, metadata TEXT, UNIQUE(layer, key));" +
      "CREATE TABLE memories (id TEXT PRIMARY KEY, memory_type TEXT NOT NULL, layer TEXT NOT NULL, " +
      "title TEXT NOT NULL, content TEXT NOT NULL, context TEXT, journey TEXT, persona TEXT, " +
      "tags TEXT, created_at TEXT NOT NULL);" +
      "CREATE TABLE _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  for (const id of KNOWN_MIGRATION_IDS) {
    db.prepare("INSERT INTO _migrations (id, applied_at) VALUES (?, 't')").run(id);
  }
  db.close();
}

test("journeys on an empty database reports no journeys", () => {
  withFixture((dbPath) => {
    buildEmptyFixture(dbPath);
    assert.equal(render(dbPath, ["journeys"]), "No journeys found.\n");
  });
});

test("memories on an empty database reports no memories", () => {
  withFixture((dbPath) => {
    buildEmptyFixture(dbPath);
    assert.equal(render(dbPath, ["memories"]), "No memories found.\n");
  });
});
