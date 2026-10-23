import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { openDatabaseCopyForWrite } from "#db/database.ts";
import { frontDoorLogPath, logFrontDoor } from "#frontDoor/frontDoorLog.ts";
import { createIdentityTable, seedKnownMigrations } from "#helpers/identitySchema.ts";

const CLI = fileURLToPath(new URL("../../src/frontDoor/cli.ts", import.meta.url));

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
  createIdentityTable(db);
  seedKnownMigrations(db);
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

test("a verdict is logged at INFO: a non-zero exit that is the command's answer, not a failure", () => {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-fdlog-"));
  const logPath = join(dir, "front-door.log");
  try {
    logFrontDoor(logPath, {
      command: "runtime",
      route: "ts",
      exitCode: 1,
      detail: "verdict=attention",
      verdict: true,
    });
    logFrontDoor(logPath, { command: "runtime", route: "ts", exitCode: 1, detail: "ENOENT" });
    const [verdict, failure] = readFileSync(logPath, "utf8").trimEnd().split("\n");
    assert.match(verdict ?? "", /\tINFO\truntime\tts\texit=1\tverdict=attention$/);
    assert.match(failure ?? "", /\tERROR\truntime\tts\texit=1\tENOENT$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("`runtime diagnose` with findings exits 1 and does not count itself as a front-door error", () => {
  // Each diagnose with findings logged `ERROR runtime ts exit=1`, and
  // `front_door_errors` -- which counts ERROR lines -- reported one more
  // error on the next run: the finding fed itself, one line per run.
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-fdlog-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  // The home diagnose reads is MIRROR_HOME's, and its front-door log sits
  // beside the home's memory.db: the same file the CLI logs to for --db-path.
  const copyPath = join(tmpDir, "copy.db");
  const db = openDatabaseCopyForWrite(copyPath);
  createIdentityTable(db);
  seedKnownMigrations(db);
  db.close();
  const dbPath = join(tmpDir, "memory.db");
  renameSync(copyPath, dbPath);
  try {
    // A home whose Node cannot be found is one sure finding (hook_node_unresolvable).
    const env = {
      ...process.env,
      NODE_OPTIONS: "--no-warnings",
      MIRROR_HOME: tmpDir,
      MIRROR_USER: "",
      PATH: dir,
      MIRROR_NODE: "",
    };
    const first = spawnSync(process.execPath, [CLI, "runtime", "diagnose", "--db-path", dbPath], {
      encoding: "utf8",
      env,
    });
    assert.equal(first.status, 1, first.stderr);
    assert.match(first.stdout, /Status: attention needed/);
    const log = readFileSync(frontDoorLogPath(dbPath), "utf8");
    assert.match(log, /\tINFO\truntime\tts\texit=1\tverdict=attention/);
    assert.doesNotMatch(log, /\tERROR\t/);

    const second = spawnSync(process.execPath, [CLI, "runtime", "diagnose", "--db-path", dbPath], {
      encoding: "utf8",
      env,
    });
    assert.doesNotMatch(second.stdout, /front_door_errors/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
