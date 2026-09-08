// RS009 CR059 — the front door records command and route, never the payload.
//
// Moving the Pi extension and the Gemini hooks onto the front door means the
// user's prompt now travels as an argv token through `logFrontDoor`'s caller
// on every turn. `front-door.log` is a plain file in the mirror home, so a
// leak here would write conversation text to disk outside the database. This
// pins the contract at the process boundary rather than at the unit that
// happens to build the line today.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite } from "#db/database.ts";
import { spawnFrontDoor } from "#helpers/frontDoor.ts";
import { createIdentityTable, seedKnownMigrations } from "#helpers/identitySchema.ts";
import { createRuntimeTables } from "#helpers/runtimeSchema.ts";

const MARKER = "zebracrossing-secret-payload-42";

function hookHome(): { home: string; dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-hookredaction-"));
  const home = join(dir, "tmp");
  mkdirSync(home);
  const dbPath = join(home, "copy.db");
  const db = openDatabaseCopyForWrite(dbPath);
  createRuntimeTables(db);
  createIdentityTable(db);
  seedKnownMigrations(db);
  db.close();
  return { home, dbPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("a hook payload passed as argv never reaches front-door.log", () => {
  const ws = hookHome();
  try {
    const logged = spawnFrontDoor([
      "conversation-logger",
      "log-user",
      "session-redaction",
      MARKER,
      "--interface",
      "pi",
      "--db-path",
      ws.dbPath,
    ]);
    assert.equal(logged.status, 0, logged.stderr);

    const log = readFileSync(join(ws.home, "front-door.log"), "utf8");
    assert.match(log, /\tconversation-logger\tts\texit=0/, "the route is recorded");
    assert.doesNotMatch(log, new RegExp(MARKER), "the payload is not");
    assert.doesNotMatch(log, /copy\.db|session-redaction/, "neither is the path or the session id");

    // The message itself did land in the database: the redaction is in the
    // log, not a dropped write (the failure mode CR055 was captured for).
    const db = openDatabaseCopyForWrite(ws.dbPath);
    const row = db.prepare("SELECT content FROM messages WHERE role = 'user'").get();
    db.close();
    assert.equal(row?.content, MARKER);
  } finally {
    ws.cleanup();
  }
});

test("a failing hook logs the error category, not the payload", () => {
  const ws = hookHome();
  try {
    // `--limit` with a non-integer makes repair-journeys fail after routing.
    const failed = spawnFrontDoor([
      "conversation-logger",
      "repair-journeys",
      "--limit",
      MARKER,
      "--db-path",
      ws.dbPath,
    ]);
    assert.notEqual(failed.status, 0);
    const log = readFileSync(join(ws.home, "front-door.log"), "utf8");
    assert.doesNotMatch(log, new RegExp(MARKER), "the bad argument value stays out of the log");
  } finally {
    ws.cleanup();
  }
});
