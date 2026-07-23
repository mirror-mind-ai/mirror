import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import {
  applyTasksImport,
  applyTasksSyncConfig,
  applyTasksSyncForJourney,
  resolveImportJourneys,
  resolveSyncJourneys,
} from "../../src/frontDoor/tasksImportSyncRoute.ts";
import { upsertIdentity } from "../../src/identity/identityStore.ts";
import { JOURNEY_PATH_LAYER } from "../../src/journey/journeyStatus.ts";
import { JOURNEY_LAYER } from "../../src/journey/journeySyncFile.ts";
import { JourneyNotFoundError } from "../../src/journey/journeyWrite.ts";
import { createIdentityTable } from "../helpers/identitySchema.ts";
import { createTasksTable } from "../helpers/tasksSchema.ts";

function tempWorkspace(): { dir: string; dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-import-sync-route-"));
  const tmp = join(dir, "tmp");
  mkdirSync(tmp);
  return {
    dir,
    dbPath: join(tmp, "copy.db"),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function seedJourney(db: WritableDatabase, journey: string, syncFile: string | null = null): void {
  const metadata = syncFile ? JSON.stringify({ sync_file: syncFile }) : null;
  upsertIdentity(
    db,
    {
      id: `id-${journey}`,
      layer: JOURNEY_LAYER,
      key: journey,
      content: `# ${journey}`,
      version: "1.0.0",
      metadata,
    },
    "2026-01-01T00:00:00.000000Z",
  );
}

function withDb(fn: (db: WritableDatabase, dir: string) => void): void {
  const { dir, dbPath, cleanup } = tempWorkspace();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    createIdentityTable(db);
    createTasksTable(db);
    fn(db, dir);
  } finally {
    db.close();
    cleanup();
  }
}

test("resolveImportJourneys returns [explicit] when given, else every 'journey'-layer key", () => {
  withDb((db) => {
    assert.deepEqual(resolveImportJourneys(db, "only-this"), ["only-this"]);
    seedJourney(db, "zed");
    seedJourney(db, "alpha");
    assert.deepEqual(resolveImportJourneys(db, null), ["alpha", "zed"]); // ORDER BY key
  });
});

test("applyTasksImport only includes journeys that actually created a task", () => {
  withDb((db) => {
    upsertIdentity(
      db,
      {
        id: "id-a",
        layer: JOURNEY_PATH_LAYER,
        key: "a",
        content: "\n### S\n- [ ] Do it\n",
        version: "1.0.0",
        metadata: null,
      },
      "2026-01-01T00:00:00.000000Z",
    );
    upsertIdentity(
      db,
      {
        id: "id-b",
        layer: JOURNEY_PATH_LAYER,
        key: "b",
        content: "\n### S\nno checkboxes here\n",
        version: "1.0.0",
        metadata: null,
      },
      "2026-01-01T00:00:00.000000Z",
    );
    const results = applyTasksImport(db, null);
    // Explicit journeys (no "journey"-layer enumeration needed for an explicit call).
    const a = applyTasksImport(db, "a");
    assert.equal(a.length, 1);
    assert.equal(a[0].created.length, 1);
    const b = applyTasksImport(db, "b");
    assert.deepEqual(b, []); // zero created -> not included at all
    void results;
  });
});

test("resolveSyncJourneys: explicit journey is returned regardless of sync-file configuration", () => {
  withDb((db) => {
    seedJourney(db, "no-sync-configured");
    assert.deepEqual(resolveSyncJourneys(db, "no-sync-configured"), ["no-sync-configured"]);
  });
});

test("resolveSyncJourneys: no explicit journey filters to only journeys WITH a sync file configured", () => {
  withDb((db, dir) => {
    const syncFilePath = join(dir, "ref.md");
    writeFileSync(syncFilePath, "# ref\n", "utf8");
    seedJourney(db, "has-sync", syncFilePath);
    seedJourney(db, "no-sync");
    assert.deepEqual(resolveSyncJourneys(db, null), ["has-sync"]);
  });
});

test("applyTasksSyncForJourney reports 'no_sync_file' for a journey with none configured", () => {
  withDb((db) => {
    seedJourney(db, "bare");
    assert.deepEqual(applyTasksSyncForJourney(db, "bare"), {
      kind: "no_sync_file",
      journey: "bare",
    });
  });
});

test("applyTasksSyncForJourney reports 'synced' with the result on success", () => {
  withDb((db, dir) => {
    const syncFilePath = join(dir, "ref.md");
    writeFileSync(syncFilePath, "\n### S\n- [ ] New One\n", "utf8");
    seedJourney(db, "configured", syncFilePath);
    const outcome = applyTasksSyncForJourney(db, "configured");
    assert.equal(outcome.kind, "synced");
    if (outcome.kind === "synced") {
      assert.equal(outcome.syncFile, syncFilePath);
      assert.deepEqual(outcome.result, { created: 1, completed: 0, unchanged: 0 });
    }
  });
});

test("applyTasksSyncForJourney reports 'error' with the message when the sync file is missing on disk", () => {
  withDb((db, dir) => {
    const missingPath = join(dir, "gone.md");
    seedJourney(db, "broken", missingPath);
    const outcome = applyTasksSyncForJourney(db, "broken");
    assert.deepEqual(outcome, {
      kind: "error",
      journey: "broken",
      message: `File not found: ${missingPath}`,
    });
  });
});

test("applyTasksSyncConfig normalizes the path, reports fileExisted, and configures the journey", () => {
  withDb((db, dir) => {
    seedJourney(db, "cv22");
    const refPath = join(dir, "ref.md");
    writeFileSync(refPath, "# ref\n", "utf8");
    const outcome = applyTasksSyncConfig(db, "cv22", refPath, "2026-02-01T00:00:00.000000Z");
    assert.equal(outcome.journey, "cv22");
    assert.equal(outcome.fileExisted, true);
    assert.match(outcome.resolvedPath, /ref\.md$/);
  });
});

test("applyTasksSyncConfig reports fileExisted=false for a not-yet-created reference file, but still configures it", () => {
  withDb((db, dir) => {
    seedJourney(db, "cv22");
    const refPath = join(dir, "not-yet.md");
    const outcome = applyTasksSyncConfig(db, "cv22", refPath, "2026-02-01T00:00:00.000000Z");
    assert.equal(outcome.fileExisted, false);
  });
});

test("applyTasksSyncConfig throws JourneyNotFoundError for an unknown journey", () => {
  withDb((db, dir) => {
    const refPath = join(dir, "ref.md");
    writeFileSync(refPath, "# ref\n", "utf8");
    assert.throws(
      () => applyTasksSyncConfig(db, "nope", refPath, "2026-02-01T00:00:00.000000Z"),
      JourneyNotFoundError,
    );
  });
});
