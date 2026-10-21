// CR154 — `conversations imported` through the real front door process.
//
// Subcommands of a claimed family are allowlisted, never inherited: `append`
// once rendered the plain listing, exited 0, and dropped the caller's messages.
// These pin the same for `imported`, both ways -- it is never the plain listing,
// and the plain listing still answers -- and run one real removal through the
// live-write seam, its dated backup included.

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import { openDatabaseReadOnly, type WritableDatabase } from "#db/database.ts";
import { spawnFrontDoor } from "#helpers/frontDoor.ts";

interface Home {
  dir: string;
  dbPath: string;
  cleanup: () => void;
}

/** A Pi conversation an earlier version imported: it started after its own last message. */
function seedImport(db: WritableDatabase, id: string, folder: string): void {
  db.prepare(
    "INSERT INTO conversations (id, title, started_at, ended_at, interface) VALUES (?, 'Copied from another home', '2026-10-20T10:00:00.000Z', '2026-10-19T09:00:00+00:00', 'pi')",
  ).run(id);
  for (const [index, role] of ["user", "assistant"].entries()) {
    db.prepare(
      "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, 'x', '2026-10-19T09:00:00+00:00')",
    ).run(`${id}-m${index}`, id, role);
  }
  db.prepare(
    "INSERT INTO runtime_sessions (session_id, conversation_id, interface, mirror_active, hook_injected, active, started_at, updated_at, closed_at) VALUES (?, ?, 'pi', 0, 0, 0, '2026-10-20T10:00:00.000Z', '2026-10-20T10:00:00.000Z', '2026-10-19T09:00:00+00:00')",
  ).run(`/home/p/.pi/agent/sessions/--${folder}--/${id}.jsonl`, id);
}

/** A Pi conversation this home logged live. */
function seedLive(db: WritableDatabase, id: string): void {
  db.prepare(
    "INSERT INTO conversations (id, title, started_at, ended_at, interface) VALUES (?, 'Logged here', '2026-10-18T08:00:00.000Z', '2026-10-18T09:00:00.000Z', 'pi')",
  ).run(id);
  db.prepare(
    "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, 'user', 'x', '2026-10-18T08:00:00.000Z')",
  ).run(`${id}-m0`, id);
}

function makeHome(): Home {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-imported-"));
  const dbPath = join(dir, "home", "memory.db");
  const db = bootstrapDatabase(dbPath);
  seedImport(db, "aaaaaaaa1111", "Users-p-dev-other");
  seedImport(db, "bbbbbbbb2222", "Users-p-dev-other");
  seedLive(db, "cccccccc3333");
  db.close();
  return { dir, dbPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function conversationIds(dbPath: string): string[] {
  const db = openDatabaseReadOnly(dbPath);
  try {
    return db
      .prepare("SELECT id FROM conversations ORDER BY id")
      .all()
      .map((row) => String(row.id));
  } finally {
    db.close();
  }
}

test("`conversations imported` is never rendered as the plain listing", () => {
  const home = makeHome();
  try {
    const result = spawnFrontDoor(["conversations", "imported", "--db-path", home.dbPath]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^Imported Pi conversations: 2 \(4 messages\)/);
    assert.doesNotMatch(result.stdout, /^\*\*\d{4}-\d{2}-\d{2}\*\* \|/m);
  } finally {
    home.cleanup();
  }
});

test("the plain `conversations` listing still answers", () => {
  const home = makeHome();
  try {
    const result = spawnFrontDoor(["conversations", "--db-path", home.dbPath]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^\*\*\d{4}-\d{2}-\d{2}\*\* \| `[0-9a-z]{8}`/);
  } finally {
    home.cleanup();
  }
});

test("a typo'd option refuses with the usage and removes nothing", () => {
  const home = makeHome();
  try {
    const result = spawnFrontDoor([
      "conversations",
      "imported",
      "remove",
      "--all",
      "--projet",
      "Users-p-dev-other",
      "--apply",
      "--db-path",
      home.dbPath,
    ]);
    assert.equal(result.status, 2);
    // The folder after the typo reads as an id; the typo is what is refused.
    assert.match(result.stderr, /error: unrecognized arguments: --projet$/m);
    assert.deepEqual(conversationIds(home.dbPath), [
      "aaaaaaaa1111",
      "bbbbbbbb2222",
      "cccccccc3333",
    ]);
  } finally {
    home.cleanup();
  }
});

test("a real --apply through the front door: a dated backup first, then only the imports go", () => {
  const home = makeHome();
  try {
    const result = spawnFrontDoor([
      "conversations",
      "imported",
      "remove",
      "--all",
      "--project",
      "Users-p-dev-other",
      "--apply",
      "--db-path",
      home.dbPath,
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Removed 2 imported Pi conversations \(4 messages\)/);
    assert.deepEqual(conversationIds(home.dbPath), ["cccccccc3333"]);
    const backups = readdirSync(join(home.dir, "home", "backups"));
    assert.ok(
      backups.some((name) => /^memory_\d{8}_\d{6}\.zip$/.test(name)),
      `a dated backup: ${backups.join(", ")}`,
    );
    assert.ok(existsSync(join(home.dir, "home", "backups", "frontdoor-pre-write-backup.db")));
  } finally {
    home.cleanup();
  }
});
