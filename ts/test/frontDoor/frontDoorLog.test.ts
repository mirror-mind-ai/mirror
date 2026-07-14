import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite } from "../../src/db/database.ts";
import { KNOWN_MIGRATION_IDS } from "../../src/db/schemaState.ts";
import { frontDoorLogPath, logFrontDoor } from "../../src/frontDoor/frontDoorLog.ts";

const CLI = "src/frontDoor/cli.ts";

test("logFrontDoor is fail-quietly on an unwritable path and skips a null path", () => {
  assert.doesNotThrow(() => logFrontDoor(null, { command: "x", route: "ts", exitCode: 0 }));
  assert.doesNotThrow(() =>
    logFrontDoor("/nonexistent-dir-xyz/front-door.log", {
      command: "x",
      route: "ts",
      exitCode: 1,
    }),
  );
});

test("the front-door log records metadata but never the --content payload (CR033 rider)", () => {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-fdlog-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  const dbPath = join(tmpDir, "copy.db");
  const db = openDatabaseCopyForWrite(dbPath);
  db.exec(
    "CREATE TABLE identity (id TEXT PRIMARY KEY, layer TEXT NOT NULL, key TEXT NOT NULL, " +
      "content TEXT NOT NULL, version TEXT DEFAULT '1.0.0', created_at TEXT NOT NULL, " +
      "updated_at TEXT NOT NULL, metadata TEXT, UNIQUE(layer, key));" +
      "CREATE TABLE _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  for (const id of KNOWN_MIGRATION_IDS) {
    db.prepare("INSERT INTO _migrations (id, applied_at) VALUES (?, 't')").run(id);
  }
  db.close();

  const secret = "TOPSECRET-soul-content-42";
  try {
    const result = spawnSync(
      process.execPath,
      [CLI, "identity", "set", "ego", "probe", "--content", secret, "--db-path", dbPath],
      { encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "--no-warnings" } },
    );
    assert.equal(result.status, 0);

    const log = readFileSync(frontDoorLogPath(dbPath), "utf8");
    assert.match(log, /\tidentity\t/); // command name is recorded
    assert.match(log, /exit=0/); // outcome is recorded
    assert.ok(!log.includes(secret), "the log must never contain the --content payload");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
