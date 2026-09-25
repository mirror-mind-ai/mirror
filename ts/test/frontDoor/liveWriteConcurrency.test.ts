// CV22.DS10.TS5, finding F21 -- concurrent routed writes must not collide on the
// pre-write snapshot.
//
// Every routed live write snapshots the database before it opens a writable
// handle. Until F21 that snapshot went to ONE fixed file, removed and recreated
// with `VACUUM INTO` by every writer with no coordination, so two writers at the
// same instant broke each other: the second `VACUUM INTO` found the tables the
// first was still creating ("table conversations already exists"), or one
// writer removed the file the other was still writing ("disk I/O error"). The
// losing write was aborted. Claude Code made that routine -- it runs its two
// prompt hooks at once, and both write -- and the Navigator walk measured it:
// two of three prompts lost their Mirror context. Pi had been losing turns the
// same way in daily use.
//
// These are real OS processes, released at the same instant, against a
// database big enough that each snapshot takes long enough to overlap.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

import { openDatabaseCopyForWrite, openDatabaseReadOnly } from "#db/database.ts";
import { backupPathFor } from "#frontDoor/liveBackup.ts";

const WORKER = join(import.meta.dirname, "liveWriteWorker.ts");
const WRITERS = 8;
/** ~8 MB of filler, so one snapshot takes long enough for others to overlap it. */
const FILLER_ROWS = 400;
const FILLER_BYTES = 20_000;

function buildDatabase(): { dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-live-write-race-"));
  // Under tmp/: the copy guard refuses to seed a database anywhere else.
  mkdirSync(join(dir, "tmp"));
  const dbPath = join(dir, "tmp", "live.db");
  const db = openDatabaseCopyForWrite(dbPath);
  db.exec("PRAGMA journal_mode=WAL");
  // `conversations` first, so a collision reads exactly as it did in the field.
  db.exec("CREATE TABLE conversations (id TEXT PRIMARY KEY)");
  db.exec("CREATE TABLE probe (id INTEGER PRIMARY KEY, label TEXT NOT NULL)");
  db.exec("CREATE TABLE filler (id INTEGER PRIMARY KEY, body BLOB NOT NULL)");
  const insert = db.prepare("INSERT INTO filler (body) VALUES (?)");
  for (let row = 0; row < FILLER_ROWS; row += 1) insert.run(randomBytes(FILLER_BYTES));
  db.close();
  return { dbPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function runWriter(
  dbPath: string,
  startAt: number,
  label: string,
): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [WORKER, dbPath, String(startAt), label], {
      env: { ...process.env, NODE_OPTIONS: "--no-warnings" },
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (code) => resolve({ code, stderr }));
  });
}

test("writers released at the same instant all land, and leave one whole snapshot", async () => {
  const ws = buildDatabase();
  try {
    // Far enough ahead that every worker has started and is spinning.
    const startAt = Date.now() + 2500;
    const results = await Promise.all(
      Array.from({ length: WRITERS }, (_, index) => runWriter(ws.dbPath, startAt, `w${index}`)),
    );

    const failures = results.filter((result) => result.code !== 0);
    assert.deepEqual(
      failures.map((result) => result.stderr.trim()),
      [],
      `${failures.length} of ${WRITERS} concurrent writes failed`,
    );

    const db = openDatabaseReadOnly(ws.dbPath);
    const landed = db.prepare("SELECT count(*) AS n FROM probe").get() as { n: number };
    db.close();
    assert.equal(landed.n, WRITERS, "every write landed");

    // The fixed backup is a whole database, not the half-written result of a
    // collision -- and it is readable as one.
    const backupPath = backupPathFor(ws.dbPath);
    const backup = openDatabaseReadOnly(backupPath);
    const check = backup.prepare("PRAGMA quick_check").get() as { quick_check: string };
    backup.close();
    assert.equal(check.quick_check, "ok");

    // No writer's staging file outlives its write.
    const leftovers = readdirSync(dirname(backupPath)).filter(
      (name) => name !== "frontdoor-pre-write-backup.db",
    );
    assert.deepEqual(leftovers, [], "staging files were left behind");
    assert.ok(existsSync(backupPath));
  } finally {
    ws.cleanup();
  }
});
