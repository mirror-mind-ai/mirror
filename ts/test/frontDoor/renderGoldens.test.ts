import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite } from "../../src/db/database.ts";
import { createIdentityTable, seedKnownMigrations } from "../helpers/identitySchema.ts";
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

test("identity list render output matches the golden (all layers)", () => {
  withFixture((dbPath) => {
    buildRenderFixture(dbPath);
    assertGolden("identity-list", render(dbPath, ["identity", "list"]));
  });
});

test("identity list --layer render output matches the golden (one layer)", () => {
  withFixture((dbPath) => {
    buildRenderFixture(dbPath);
    assertGolden(
      "identity-list-persona",
      render(dbPath, ["identity", "list", "--layer", "persona"]),
    );
  });
});

test("identity get render output matches the golden", () => {
  withFixture((dbPath) => {
    buildRenderFixture(dbPath);
    assertGolden(
      "identity-get-persona-engineer",
      render(dbPath, ["identity", "get", "persona", "engineer"]),
    );
  });
});

test("identity get on a missing entry exits 1 with a stderr message, no stdout", () => {
  withFixture((dbPath) => {
    buildRenderFixture(dbPath);
    const result = spawnSync(process.execPath, [CLI, "identity", "get", "persona", "ghost"], {
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "--no-warnings", DB_PATH: dbPath },
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr.trim(), "No identity entry found for persona/ghost");
  });
});

test("descriptor list (all layers) render output matches the golden, excluding the orphan", () => {
  withFixture((dbPath) => {
    buildRenderFixture(dbPath);
    assertGolden("descriptor-list", render(dbPath, ["descriptor", "list"]));
  });
});

test("descriptor list --layer render output matches the golden, including the orphan", () => {
  withFixture((dbPath) => {
    buildRenderFixture(dbPath);
    assertGolden(
      "descriptor-list-persona",
      render(dbPath, ["descriptor", "list", "--layer", "persona"]),
    );
  });
});

test("list personas render output matches the golden", () => {
  withFixture((dbPath) => {
    buildRenderFixture(dbPath);
    assertGolden("list-personas", render(dbPath, ["list", "personas"]));
  });
});

test("list personas --verbose render output matches the golden", () => {
  withFixture((dbPath) => {
    buildRenderFixture(dbPath);
    assertGolden("list-personas-verbose", render(dbPath, ["list", "personas", "--verbose"]));
  });
});

test("list journeys render output matches the golden", () => {
  withFixture((dbPath) => {
    buildRenderFixture(dbPath);
    assertGolden("list-journeys", render(dbPath, ["list", "journeys"]));
  });
});

test("inspect persona render output matches the golden", () => {
  withFixture((dbPath) => {
    buildRenderFixture(dbPath);
    assertGolden("inspect-persona", render(dbPath, ["inspect", "persona", "engineer"]));
  });
});

test("inspect persona on a missing entry prints to stdout and exits 1", () => {
  withFixture((dbPath) => {
    buildRenderFixture(dbPath);
    const result = spawnSync(process.execPath, [CLI, "inspect", "persona", "ghost"], {
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "--no-warnings", DB_PATH: dbPath },
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "persona/ghost not found\n");
    assert.equal(result.stderr, "");
  });
});

test("recall render output matches the golden (full history, persona+journey, no summary)", () => {
  withFixture((dbPath) => {
    buildRenderFixture(dbPath);
    assertGolden("recall-full", render(dbPath, ["recall", "conv-aaaa1111"]));
  });
});

test("recall render output matches the golden (prefix match, untitled, summary, no persona/journey)", () => {
  withFixture((dbPath) => {
    buildRenderFixture(dbPath);
    assertGolden("recall-untitled-summary", render(dbPath, ["recall", "conv-bbbb"]));
  });
});

test("recall render output matches the golden (no messages)", () => {
  withFixture((dbPath) => {
    buildRenderFixture(dbPath);
    assertGolden("recall-no-messages", render(dbPath, ["recall", "conv-cccc3333"]));
  });
});

test("recall render output matches the golden (--limit 1, tail message only)", () => {
  withFixture((dbPath) => {
    buildRenderFixture(dbPath);
    assertGolden("recall-limit-1", render(dbPath, ["recall", "conv-aaaa1111", "--limit", "1"]));
  });
});

test("recall on a missing conversation exits 1 with a stderr message, no stdout", () => {
  withFixture((dbPath) => {
    buildRenderFixture(dbPath);
    const result = spawnSync(process.execPath, [CLI, "recall", "zzz-missing"], {
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "--no-warnings", DB_PATH: dbPath },
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr.trim(), "Conversation 'zzz-missing' not found.");
  });
});

/** A schema-valid database with no journeys or memories (empty-state edges). */
function buildEmptyFixture(dbPath: string): void {
  const db = openDatabaseCopyForWrite(dbPath);
  createIdentityTable(db);
  db.exec(
    "CREATE TABLE memories (id TEXT PRIMARY KEY, memory_type TEXT NOT NULL, layer TEXT NOT NULL, " +
      "title TEXT NOT NULL, content TEXT NOT NULL, context TEXT, journey TEXT, persona TEXT, " +
      "tags TEXT, created_at TEXT NOT NULL)",
  );
  seedKnownMigrations(db);
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
