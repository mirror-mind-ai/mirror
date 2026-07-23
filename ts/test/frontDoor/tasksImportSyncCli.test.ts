import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite, openDatabaseReadOnly } from "../../src/db/database.ts";
import { upsertIdentity } from "../../src/identity/identityStore.ts";
import { JOURNEY_PATH_LAYER } from "../../src/journey/journeyStatus.ts";
import { JOURNEY_LAYER } from "../../src/journey/journeySyncFile.ts";
import { spawnFrontDoor } from "../helpers/frontDoor.ts";
import { createIdentityTable, seedKnownMigrations } from "../helpers/identitySchema.ts";
import { createTasksTable } from "../helpers/tasksSchema.ts";

function workspace(): { dir: string; tmpDir: string; dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-taskimportsynccli-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  const dbPath = join(tmpDir, "copy.db");
  const db = openDatabaseCopyForWrite(dbPath);
  createIdentityTable(db);
  seedKnownMigrations(db);
  createTasksTable(db);
  db.close();
  return { dir, tmpDir, dbPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function seedJourneyPathContent(dbPath: string, journey: string, content: string): void {
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    upsertIdentity(
      db,
      {
        id: `id-${journey}`,
        layer: JOURNEY_PATH_LAYER,
        key: journey,
        content,
        version: "1.0.0",
        metadata: null,
      },
      "2026-01-01T00:00:00.000000Z",
    );
    upsertIdentity(
      db,
      {
        id: `id-${journey}-j`,
        layer: JOURNEY_LAYER,
        key: journey,
        content: `# ${journey}`,
        version: "1.0.0",
        metadata: null,
      },
      "2026-01-01T00:00:00.000000Z",
    );
  } finally {
    db.close();
  }
}

function taskTitles(dbPath: string): string[] {
  const db = openDatabaseReadOnly(dbPath);
  try {
    return db
      .prepare("SELECT title FROM tasks ORDER BY title")
      .all()
      .map((r) => r.title as string);
  } finally {
    db.close();
  }
}

test("front door `tasks import <journey>` creates tasks from the DB journey_path content", () => {
  const ws = workspace();
  try {
    seedJourneyPathContent(ws.dbPath, "cv22", "\n### Etapa 1\n- [ ] Write the plan\n");
    const result = spawnFrontDoor(["tasks", "import", "cv22", "--db-path", ws.dbPath]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /🧭 cv22: 1 tasks imported/);
    assert.match(result.stdout, /Write the plan/);
    assert.match(result.stdout, /📋 Total: 1 tasks imported/);
    assert.deepEqual(taskTitles(ws.dbPath), ["Write the plan"]);
  } finally {
    ws.cleanup();
  }
});

test("front door `tasks import` with no checkboxes anywhere prints 'No new tasks found'", () => {
  const ws = workspace();
  try {
    const result = spawnFrontDoor(["tasks", "import", "--db-path", ws.dbPath]);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "No new tasks found in journey paths.\n");
  } finally {
    ws.cleanup();
  }
});

test("front door `tasks sync-config` then `tasks sync` end to end: creates + completes from an external file", () => {
  const ws = workspace();
  try {
    seedJourneyPathContent(ws.dbPath, "cv22", "\n### Etapa 1\n- [ ] unused\n");
    const refPath = join(ws.tmpDir, "ref.md");
    writeFileSync(refPath, "\n### Etapa 1\n- [ ] From The Reference File\n", "utf8");

    const configResult = spawnFrontDoor([
      "tasks",
      "sync-config",
      "cv22",
      refPath,
      "--db-path",
      ws.dbPath,
    ]);
    assert.equal(configResult.status, 0);
    assert.match(configResult.stdout, /🔗 cv22 → /);

    const syncResult = spawnFrontDoor(["tasks", "sync", "cv22", "--db-path", ws.dbPath]);
    assert.equal(syncResult.status, 0);
    assert.match(syncResult.stdout, /🔄 cv22 \(← /);
    assert.match(syncResult.stdout, /\+1 new \| ✓0 completed \| =0 unchanged/);
    assert.deepEqual(taskTitles(ws.dbPath), ["From The Reference File"]);

    // Mark it checked in the reference file and sync again -> completed.
    writeFileSync(refPath, "\n### Etapa 1\n- [x] From The Reference File\n", "utf8");
    const secondSync = spawnFrontDoor(["tasks", "sync", "cv22", "--db-path", ws.dbPath]);
    assert.equal(secondSync.status, 0);
    assert.match(secondSync.stdout, /\+0 new \| ✓1 completed \| =0 unchanged/);
  } finally {
    ws.cleanup();
  }
});

test("front door `tasks sync-config` on an unknown journey exits 1 without a fabricated Python traceback", () => {
  const ws = workspace();
  try {
    const refPath = join(ws.tmpDir, "ref.md");
    writeFileSync(refPath, "# ref\n", "utf8");
    const result = spawnFrontDoor([
      "tasks",
      "sync-config",
      "nope",
      refPath,
      "--db-path",
      ws.dbPath,
    ]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /journey 'nope' not found/);
  } finally {
    ws.cleanup();
  }
});

test("front door `tasks sync` with nothing configured prints 'No journey has sync configured.'", () => {
  const ws = workspace();
  try {
    const result = spawnFrontDoor(["tasks", "sync", "--db-path", ws.dbPath]);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "No journey has sync configured.\n");
  } finally {
    ws.cleanup();
  }
});

test("front door writes for import/sync/sync-config are backup-gated and never log task/file content", () => {
  const ws = workspace();
  try {
    seedJourneyPathContent(ws.dbPath, "cv22", "\n### Etapa 1\n- [ ] SECRET-CONTENT-marker\n");
    spawnFrontDoor(["tasks", "import", "cv22", "--db-path", ws.dbPath]);
    const backupContent = readFileSync(join(ws.tmpDir, "backups", "frontdoor-pre-write-backup.db"));
    assert.ok(backupContent.length > 0);

    const logContent = readFileSync(join(ws.tmpDir, "front-door.log"), "utf8");
    assert.doesNotMatch(logContent, /SECRET-CONTENT-marker/);
    assert.match(logContent, /\btasks\t/);
  } finally {
    ws.cleanup();
  }
});
