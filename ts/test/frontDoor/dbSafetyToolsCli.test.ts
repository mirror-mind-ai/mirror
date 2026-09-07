// CV22.DS7.TS1 plateau 3 — `backup`, `repair-encoding`, and the
// `repair-journeys --apply` injection through the real front door process.
//
// The routes are gated OFF by default until the flip, so every spawn here
// turns its gate on explicitly. Stdout is graded against the same goldens the
// unit tests use; the front-door log is graded for redaction (command and
// engine only — never a path, never a preview line).

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  openDatabaseCopyForWrite,
  openDatabaseReadOnly,
  type SqlValue,
  type WritableDatabase,
} from "#db/database.ts";
import { spawnFrontDoor } from "#helpers/frontDoor.ts";
import { createIdentityTable, seedKnownMigrations } from "#helpers/identitySchema.ts";
import { createRuntimeTables } from "#helpers/runtimeSchema.ts";
import { inspectZip } from "#helpers/zipInspect.ts";

const REPAIR_GOLDEN = JSON.parse(
  readFileSync(new URL("../goldens/repair-encoding.golden.json", import.meta.url), "utf8"),
);
const JOURNEY_GOLDEN = JSON.parse(
  readFileSync(new URL("../goldens/journey-repair.golden.json", import.meta.url), "utf8"),
);

const BACKUP_ON = { MIRROR_TS_BACKUP: "1" };
const REPAIR_ON = { MIRROR_TS_REPAIR_ENCODING: "1" };

interface Home {
  home: string;
  dbPath: string;
  cleanup: () => void;
}

/** A mirror-home-shaped temp dir whose database is a copy the guard accepts. */
function makeHome(label: string, seed: (db: WritableDatabase) => void): Home {
  const dir = mkdtempSync(join(tmpdir(), `mirror-core-${label}-`));
  const home = join(dir, "tmp");
  mkdirSync(home);
  const dbPath = join(home, "copy.db");
  const db = openDatabaseCopyForWrite(dbPath);
  seed(db);
  db.close();
  return { home, dbPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function seedRepairFixture(db: WritableDatabase): void {
  for (const ddl of REPAIR_GOLDEN.fixture.ddl as string[]) db.exec(ddl);
  for (const row of REPAIR_GOLDEN.fixture.rows as {
    table: string;
    values: Record<string, SqlValue>;
  }[]) {
    const columns = Object.keys(row.values);
    db.prepare(
      `INSERT INTO "${row.table}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
    ).run(...columns.map((c) => row.values[c] as SqlValue));
  }
  seedKnownMigrations(db);
}

function seedJourneyRepairFixture(db: WritableDatabase): void {
  createRuntimeTables(db);
  createIdentityTable(db);
  seedKnownMigrations(db);
  let counter = 0;
  for (const [slug, content] of Object.entries(JOURNEY_GOLDEN.journeys as Record<string, string>)) {
    counter += 1;
    db.prepare(
      "INSERT INTO identity (id, layer, key, content, created_at, updated_at) VALUES (?, 'journey', ?, ?, ?, ?)",
    ).run(
      `id-${counter}`,
      slug,
      content,
      "2026-09-03T12:00:00.000000Z",
      "2026-09-03T12:00:00.000000Z",
    );
  }
  for (const seed of JOURNEY_GOLDEN.repair.seeds as {
    id: string;
    started_at: string;
    title: string | null;
    first_user: string;
    message_count: number;
  }[]) {
    db.prepare(
      "INSERT INTO conversations (id, interface, journey, title, started_at) VALUES (?, 'pi', NULL, ?, ?)",
    ).run(seed.id, seed.title, seed.started_at);
    for (let index = 0; index < seed.message_count; index += 1) {
      db.prepare(
        "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      ).run(
        `${seed.id}-m${String(index).padStart(2, "0")}`,
        seed.id,
        index % 2 === 0 ? "user" : "assistant",
        index === 0 ? seed.first_user : `line ${index}`,
        `2026-09-03T12:00:${String(index).padStart(2, "0")}.000000Z`,
      );
    }
  }
}

function archives(home: string): string[] {
  const dir = join(home, "backups");
  return existsSync(dir) ? readdirSync(dir).filter((n) => /^memory_\d{8}_\d{6}\.zip$/.test(n)) : [];
}

function partials(home: string): string[] {
  const dir = join(home, "backups");
  return existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith(".partial")) : [];
}

function frontDoorLog(home: string): string {
  return readFileSync(join(home, "front-door.log"), "utf8");
}

test("backup: dated archive beside the database, staging gone, log redacted", () => {
  const ws = makeHome("backup", (db) => {
    db.exec("CREATE TABLE t (x)");
    db.prepare("INSERT INTO t VALUES (?)").run("payload-that-must-not-appear-in-the-log");
  });
  try {
    const result = spawnFrontDoor(["backup", "--db-path", ws.dbPath], BACKUP_ON);
    assert.equal(result.status, 0, result.stderr);
    assert.match(
      result.stdout,
      /^Mirror home: .*\nDatabase: .*copy\.db\nBackup dir: .*backups\nBackup created: memory_\d{8}_\d{6}\.zip \(\d+ KB\)\n$/,
    );
    const [archive] = archives(ws.home);
    assert.ok(archive, "archive created");
    assert.deepEqual(partials(ws.home), []);
    const members = inspectZip(join(ws.home, "backups", archive as string));
    assert.deepEqual(
      members.map((m) => m.name),
      ["memory.db"],
      "member is always memory.db whatever the file is called",
    );

    const log = frontDoorLog(ws.home);
    assert.match(log, /\tbackup\tts\texit=0\t/);
    assert.doesNotMatch(log, /copy\.db|backups|payload/);
  } finally {
    ws.cleanup();
  }
});

test("backup --silent: nothing printed, archive created; a missing database exits 1 (0 when silent)", () => {
  const ws = makeHome("backup-silent", (db) => db.exec("CREATE TABLE t (x)"));
  try {
    const silent = spawnFrontDoor(["backup", "--silent", "--db-path", ws.dbPath], BACKUP_ON);
    assert.equal(silent.status, 0, silent.stderr);
    assert.equal(silent.stdout, "");
    assert.equal(archives(ws.home).length, 1);

    const missing = join(ws.home, "nope.db");
    const loud = spawnFrontDoor(["backup", "--db-path", missing], BACKUP_ON);
    assert.equal(loud.status, 1);
    assert.match(loud.stdout, /Database not found: .*nope\.db\n$/);
    const quiet = spawnFrontDoor(["backup", "--silent", "--db-path", missing], BACKUP_ON);
    assert.equal(quiet.status, 0);
    assert.equal(quiet.stdout, "");
    assert.equal(archives(ws.home).length, 1, "no archive for a missing database");
  } finally {
    ws.cleanup();
  }
});

test("backup rejects unknown arguments with a usage error, like argparse", () => {
  const ws = makeHome("backup-usage", (db) => db.exec("CREATE TABLE t (x)"));
  try {
    const result = spawnFrontDoor(["backup", "--bogus", "--db-path", ws.dbPath], BACKUP_ON);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /unrecognized arguments: --bogus/);
    assert.equal(archives(ws.home).length, 0);
  } finally {
    ws.cleanup();
  }
});

test("repair-encoding dry run: oracle stdout, rows untouched, log redacted", () => {
  const ws = makeHome("repair-dry", seedRepairFixture);
  try {
    const result = spawnFrontDoor(["repair-encoding", "--db-path", ws.dbPath], REPAIR_ON);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      result.stdout,
      String(REPAIR_GOLDEN.dry_run.default_limit.stdout).replaceAll("<db>", ws.dbPath),
    );

    const limited = spawnFrontDoor(
      ["repair-encoding", "--limit", "2", "--db-path", ws.dbPath],
      REPAIR_ON,
    );
    assert.equal(
      limited.stdout,
      String(REPAIR_GOLDEN.dry_run.limit_2.stdout).replaceAll("<db>", ws.dbPath),
    );

    const db = openDatabaseReadOnly(ws.dbPath);
    const row = db.prepare("SELECT title FROM conversations WHERE id = 'c1'").get();
    db.close();
    assert.equal(row?.title, "T\u00c3\u00adtulo", "dry run must not change rows");

    const log = frontDoorLog(ws.home);
    assert.match(log, /\trepair-encoding\tts\texit=0\t/);
    assert.doesNotMatch(log, /copy\.db|Ã|Título|row=/);
  } finally {
    ws.cleanup();
  }
});

test("repair-encoding --apply: zip backup first, one transaction, then nothing left to repair", () => {
  const ws = makeHome("repair-apply", seedRepairFixture);
  try {
    const result = spawnFrontDoor(
      ["repair-encoding", "--apply", "--db-path", ws.dbPath],
      REPAIR_ON,
    );
    assert.equal(result.status, 0, result.stderr);
    const [archive] = archives(ws.home);
    assert.ok(archive, "dated zip backup created before the repair");
    const expectedTail = String(REPAIR_GOLDEN.apply.stdout).replaceAll("<db>", ws.dbPath);
    // Python prints the scan report, then backup()'s lines, then the apply line.
    const scanReport = expectedTail.slice(0, expectedTail.lastIndexOf("Applied repairs:"));
    assert.ok(result.stdout.startsWith(scanReport), "scan report first");
    assert.match(
      result.stdout,
      new RegExp(
        `Database: .*copy\\.db\\nBackup dir: .*backups\\nBackup created: ${archive} \\(\\d+ KB\\)\\nApplied repairs: 11\\n$`,
      ),
    );
    assert.doesNotMatch(
      result.stdout,
      /Mirror home:/,
      "no --mirror-home given, so Python prints none",
    );

    const again = spawnFrontDoor(["repair-encoding", "--apply", "--db-path", ws.dbPath], REPAIR_ON);
    assert.equal(
      again.stdout,
      String(REPAIR_GOLDEN.apply.noop_stdout).replaceAll("<db>", ws.dbPath),
    );
    assert.equal(archives(ws.home).length, 1, "no backup when there is nothing to apply");

    const db = openDatabaseReadOnly(ws.dbPath);
    const row = db.prepare("SELECT title, persona FROM conversations WHERE id = 'c1'").get();
    db.close();
    assert.deepEqual(row, { title: "Título", persona: "Ética" });
  } finally {
    ws.cleanup();
  }
});

test("repair-encoding --apply --no-backup skips the zip; a bad --limit is an argparse error", () => {
  const ws = makeHome("repair-nobackup", seedRepairFixture);
  try {
    const result = spawnFrontDoor(
      ["repair-encoding", "--apply", "--no-backup", "--db-path", ws.dbPath],
      REPAIR_ON,
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, String(REPAIR_GOLDEN.apply.stdout).replaceAll("<db>", ws.dbPath));
    assert.equal(archives(ws.home).length, 0);

    const bad = spawnFrontDoor(
      ["repair-encoding", "--limit", "x", "--db-path", ws.dbPath],
      REPAIR_ON,
    );
    assert.equal(bad.status, 2);
    assert.match(bad.stderr, /argument --limit: invalid int value: 'x'/);

    const missing = spawnFrontDoor(
      ["repair-encoding", "--db-path", join(ws.home, "nope.db")],
      REPAIR_ON,
    );
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /Database not found: .*nope\.db\n$/);
    assert.equal(missing.stdout, "");
  } finally {
    ws.cleanup();
  }
});

test("repair-journeys --apply routes to TS under the backup gate and takes the dated zip first", () => {
  const ws = makeHome("journey-apply", seedJourneyRepairFixture);
  try {
    const result = spawnFrontDoor(
      ["conversation-logger", "repair-journeys", "--apply", "--db-path", ws.dbPath],
      BACKUP_ON,
    );
    assert.equal(result.status, 0, result.stderr);
    const [archive] = archives(ws.home);
    assert.ok(archive, "dated zip backup created before the repair");
    const rendered = String(JOURNEY_GOLDEN.repair.rendered.applied);
    assert.ok(
      result.stdout.endsWith(rendered),
      `stdout should end with the applied findings:\n${result.stdout}`,
    );
    assert.match(
      result.stdout,
      new RegExp(
        `^Mirror home: .*\\nDatabase: .*copy\\.db\\nBackup dir: .*backups\\nBackup created: ${archive} \\(\\d+ KB\\)\\n`,
      ),
    );

    const db = openDatabaseReadOnly(ws.dbPath);
    const state = Object.fromEntries(
      db
        .prepare("SELECT id, journey FROM conversations ORDER BY id")
        .all()
        .map((r) => [r.id, r.journey]),
    );
    db.close();
    assert.deepEqual(state, JOURNEY_GOLDEN.repair.journey_after_apply);
    assert.match(frontDoorLog(ws.home), /\tconversation-logger\tts\texit=0\t/);
  } finally {
    ws.cleanup();
  }
});
