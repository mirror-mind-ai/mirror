// CV24.DS5 — migrate a home on request, behind a verified, retained backup.
//
// See the decision "A host migrates a home only behind a verified, retained
// backup". The call applies exactly the pending list the host showed the
// person, refuses when that list changed, and migrates nothing until a uniquely
// named backup has been prepared, quick_checked, hashed, and confirmed to read
// the same pending list as the live home.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";

import { ensureConversation } from "#conversation/hostCalls.ts";
import { readJourneyTree } from "#conversation/hostReads.ts";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import { openDatabaseForBootstrap, openDatabaseReadOnly } from "#db/database.ts";
import { MigrateHomeRejectedError, migrateHome } from "#db/migrateHome.ts";
import { inspectMigrationState } from "#db/migrationReport.ts";
import { regressTo016 } from "#helpers/legacyDb.ts";
import { tempDir } from "#helpers/tempDir.ts";

const PENDING = ["017_journey_parent_column", "018_drop_hook_injected"];

function homeAt016(prefix = "mirror-migrate-home-", name = "memory.db"): string {
  const dbPath = join(tempDir(prefix), name);
  const db = bootstrapDatabase(dbPath);
  db.prepare(
    "INSERT INTO conversations (id, title, started_at, interface, journey) VALUES (?, ?, ?, ?, ?)",
  ).run("conv-keep-00001", "Kept", "2026-10-28T00:00:00Z", "test", "journey-one");
  db.prepare(
    "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES ('m1', 'conv-keep-00001', 'user', 'x', '2026-10-28T00:00:01Z')",
  ).run();
  db.close();
  regressTo016(dbPath);
  return dbPath;
}

function sha(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function counts(dbPath: string): Record<string, number> {
  const db = openDatabaseReadOnly(dbPath);
  try {
    return Object.fromEntries(
      ["identity", "conversations", "messages"].map((table) => [
        table,
        Number((db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n),
      ]),
    );
  } finally {
    db.close();
  }
}

function backups(dbPath: string): string[] {
  const dir = join(dirname(dbPath), "backups");
  return existsSync(dir)
    ? readdirSync(dir)
        .filter((name) => name.endsWith(".db"))
        .sort()
    : [];
}

function rejection(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof MigrateHomeRejectedError) return error.reason;
    throw error;
  }
  throw new Error("expected a rejection");
}

test("a home at 016 migrates to current, and the other calls then accept it", () => {
  const dbPath = homeAt016();
  const receipt = migrateHome(dbPath, { expectedPending: PENDING });
  assert.deepEqual(receipt.appliedIds, PENDING);
  assert.equal(receipt.before.state, "pending");
  assert.equal(receipt.after.state, "current");
  assert.equal(inspectMigrationState(dbPath).state, "current");
  assert.ok(Array.isArray(readJourneyTree(dbPath).roots));
  assert.ok(
    ensureConversation(dbPath, {
      sessionId: "s",
      journeyId: "journey-one",
      title: "t",
      interface: "test",
    }).conversationId,
  );
});

test("the backup is a true, verified pre-image under a unique name", () => {
  const dbPath = homeAt016();
  const before = counts(dbPath);
  const { backup } = migrateHome(dbPath, { expectedPending: PENDING });

  assert.equal(dirname(backup.path), join(dirname(dbPath), "backups"));
  assert.match(
    backup.path.split("/").pop() as string,
    /^pre-migration-016_builder_workbench_display_codes-\d{8}T\d{6}Z-[0-9a-f]{12}\.db$/,
  );
  assert.equal(statSync(backup.path).mode & 0o777, 0o600);
  assert.equal(sha(backup.path), backup.sha256);
  assert.equal(statSync(backup.path).size, backup.sizeBytes);
  // WAL recorded in the header (byte 18 == 2), as a restorable copy of a WAL home.
  assert.equal(readFileSync(backup.path)[18], 2);
  const report = inspectMigrationState(backup.path);
  assert.equal(report.state, "pending");
  assert.deepEqual(report.pending, PENDING);
  assert.deepEqual(counts(backup.path), before);
  const db = openDatabaseReadOnly(backup.path);
  try {
    assert.equal(
      (db.prepare("PRAGMA quick_check").get() as Record<string, string>).quick_check,
      "ok",
    );
  } finally {
    db.close();
  }
});

test("backups are retained: a second migration of the same home keeps the first", () => {
  const dbPath = homeAt016();
  const first = migrateHome(dbPath, { expectedPending: PENDING }).backup.path;
  regressTo016(dbPath);
  const second = migrateHome(dbPath, { expectedPending: PENDING }).backup.path;
  assert.notEqual(first, second);
  assert.ok(existsSync(first) && existsSync(second));
  assert.equal(backups(dbPath).length, 2);
});

test("a changed pending list is refused, and changes nothing", () => {
  const dbPath = homeAt016();
  const hash = sha(dbPath);
  for (const expected of [[PENDING[0]], [...PENDING].reverse(), [...PENDING, "019_x"], []]) {
    assert.equal(
      rejection(() => migrateHome(dbPath, { expectedPending: expected as string[] })),
      "pending_changed",
      JSON.stringify(expected),
    );
  }
  assert.equal(
    rejection(() => migrateHome(dbPath, {} as never)),
    "pending_changed",
  );
  assert.equal(sha(dbPath), hash);
  assert.deepEqual(backups(dbPath), []);
});

test("a current, missing, foreign or ahead home is refused, and keeps its bytes", () => {
  const current = join(tempDir("mirror-migrate-current-"), "memory.db");
  bootstrapDatabase(current).close();
  const currentHash = sha(current);
  assert.equal(
    rejection(() => migrateHome(current, { expectedPending: [] })),
    "nothing_pending",
  );
  assert.equal(sha(current), currentHash);
  assert.deepEqual(backups(current), []);

  const missingDir = tempDir("mirror-migrate-missing-");
  assert.equal(
    rejection(() => migrateHome(join(missingDir, "memory.db"), { expectedPending: PENDING })),
    "not_migratable",
  );
  assert.deepEqual(readdirSync(missingDir), []);

  const ahead = homeAt016("mirror-migrate-ahead-");
  const db = openDatabaseForBootstrap(ahead);
  db.prepare("INSERT INTO _migrations (id, applied_at) VALUES ('999_future', 'x')").run();
  db.close();
  const aheadHash = sha(ahead);
  assert.equal(
    rejection(() => migrateHome(ahead, { expectedPending: PENDING })),
    "not_migratable",
  );
  assert.equal(sha(ahead), aheadHash);
  assert.deepEqual(backups(ahead), []);
});

test("a backup that cannot be written refuses the migration, and leaves no file", () => {
  const dbPath = homeAt016();
  const hash = sha(dbPath);
  const dir = join(dirname(dbPath), "backups");
  mkdirSync(dir, { mode: 0o700 });
  chmodSync(dir, 0o500);
  try {
    assert.equal(
      rejection(() => migrateHome(dbPath, { expectedPending: PENDING })),
      "backup_failed",
    );
  } finally {
    chmodSync(dir, 0o700);
  }
  assert.equal(sha(dbPath), hash);
  assert.equal(inspectMigrationState(dbPath).state, "pending");
  assert.deepEqual(readdirSync(dir), []);
  assert.ok(!existsSync(`${dbPath}.bootstrap.lock`), "the lock was left");
});

test("the call uses the path it is given, never MIRROR_HOME", () => {
  const canary = homeAt016("mirror-migrate-canary-");
  const canaryHash = sha(canary);
  const target = homeAt016("mirror-migrate-target-");
  const saved = { home: process.env.MIRROR_HOME, db: process.env.DB_PATH };
  process.env.MIRROR_HOME = dirname(canary);
  process.env.DB_PATH = canary;
  try {
    migrateHome(target, { expectedPending: PENDING });
  } finally {
    for (const [key, value] of [
      ["MIRROR_HOME", saved.home],
      ["DB_PATH", saved.db],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  assert.equal(sha(canary), canaryHash);
  assert.deepEqual(backups(canary), []);
  assert.equal(inspectMigrationState(target).state, "current");
});

test("two processes migrating one home apply it once, with one backup", async () => {
  const dbPath = homeAt016("mirror-migrate-race-");
  const module = new URL("../../src/db/migrateHome.ts", import.meta.url).href;
  const script = `
const { migrateHome } = await import(${JSON.stringify(module)});
try { const r = migrateHome(process.argv[1], { expectedPending: ${JSON.stringify(PENDING)} }); console.log("applied:" + r.appliedIds.length); }
catch (e) { console.log("refused:" + (e.reason ?? e.message)); }`;
  const run = () =>
    new Promise<string>((resolve) => {
      const child = spawn(
        process.execPath,
        ["--no-warnings", "--input-type=module", "-e", script, dbPath],
        {
          env: { PATH: process.env.PATH ?? "", HOME: dirname(dbPath) },
        },
      );
      let out = "";
      child.stdout.on("data", (chunk) => {
        out += chunk;
      });
      child.on("close", () => resolve(out.trim()));
    });
  const results = (await Promise.all([run(), run()])).sort();
  assert.equal(results.filter((r) => r === "applied:2").length, 1, results.join(" "));
  assert.ok(
    results.some((r) => r === "refused:nothing_pending" || r === "refused:pending_changed"),
    results.join(" "),
  );
  assert.equal(backups(dbPath).length, 1);
  assert.equal(inspectMigrationState(dbPath).state, "current");
});
