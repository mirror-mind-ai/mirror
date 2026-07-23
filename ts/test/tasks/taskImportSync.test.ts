import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import { upsertIdentity } from "../../src/identity/identityStore.ts";
import { JOURNEY_PATH_LAYER } from "../../src/journey/journeyStatus.ts";
import { JOURNEY_LAYER } from "../../src/journey/journeySyncFile.ts";
import {
  importTasksFromJourneyPath,
  NoSyncFileConfiguredError,
  SyncFileNotFoundError,
  syncTasksFromFile,
} from "../../src/tasks/taskImportSync.ts";
import { createTask, getTasksByJourney, type Task } from "../../src/tasks/taskStore.ts";
import { createIdentityTable } from "../helpers/identitySchema.ts";
import { createTasksTable } from "../helpers/tasksSchema.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = join(HERE, "..", "goldens", "task-import-sync.golden.json");

interface TaskSummary {
  title: string;
  journey: string | null;
  stage: string | null;
  source: string;
  status: string;
}

interface Golden {
  scenarios: Array<Record<string, unknown>>;
}

const golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8")) as Golden;

function scenario(name: string): Record<string, unknown> {
  const found = golden.scenarios.find((s) => s.name === name);
  if (!found) throw new Error(`golden scenario not found: ${name}`);
  return found;
}

function summarize(t: Task): TaskSummary {
  return { title: t.title, journey: t.journey, stage: t.stage, source: t.source, status: t.status };
}

function tempWorkspace(): { dir: string; dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-import-sync-"));
  const tmp = join(dir, "tmp");
  mkdirSync(tmp);
  return {
    dir,
    dbPath: join(tmp, "copy.db"),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function seedJourneyAndPath(
  db: WritableDatabase,
  journey: string,
  pathContent: string,
  syncFile: string | null = null,
): void {
  const metadata = syncFile ? JSON.stringify({ sync_file: syncFile }) : null;
  upsertIdentity(
    db,
    {
      id: `id-${journey}-journey`,
      layer: JOURNEY_LAYER,
      key: journey,
      content: `# ${journey}`,
      version: "1.0.0",
      metadata,
    },
    "2026-01-01T00:00:00.000000Z",
  );
  upsertIdentity(
    db,
    {
      id: `id-${journey}-path`,
      layer: JOURNEY_PATH_LAYER,
      key: journey,
      content: pathContent,
      version: "1.0.0",
      metadata: null,
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

test("task-import-sync golden is well-formed", () => {
  assert.ok(golden.scenarios.length > 0);
});

test("importTasksFromJourneyPath: DB-backed content, dedup by (title, journey) only", () => {
  const s = scenario("import_db_backed_with_dedup");
  withDb((db) => {
    seedJourneyAndPath(db, "alpha", "\n### Etapa 1: Início\n- [ ] Existing Task\n- [ ] New Task\n");
    createTask(
      db,
      { title: "Existing Task", journey: "alpha" },
      "existing-1",
      "2026-01-01T00:00:00.000000Z",
    );
    // Same title, different journey -- must not block creation under "alpha".
    createTask(
      db,
      { title: "New Task", journey: "beta" },
      "other-1",
      "2026-01-01T00:00:00.000000Z",
    );

    const created = importTasksFromJourneyPath(db, s.journey_arg as string);
    assert.deepEqual(created.map(summarize), s.created as TaskSummary[]);
  });
});

test("importTasksFromJourneyPath: a configured, readable sync file wins over the DB journey_path content", () => {
  const s = scenario("import_sync_file_wins_over_db");
  withDb((db, dir) => {
    const syncFilePath = join(dir, "external-journey-path.md");
    writeFileSync(syncFilePath, "\n### Etapa 1\n- [ ] From External File\n", "utf8");
    seedJourneyAndPath(
      db,
      "gamma",
      "\n### Etapa 1\n- [ ] From DB (should be ignored)\n",
      syncFilePath,
    );

    const created = importTasksFromJourneyPath(db, s.journey_arg as string);
    assert.deepEqual(created.map(summarize), s.created as TaskSummary[]);
  });
});

test("importTasksFromJourneyPath: enumerating all known 'journey'-layer keys, per-journey", () => {
  const s = scenario("import_all_journeys");
  withDb((db) => {
    seedJourneyAndPath(db, "zed", "\n### Etapa 1\n- [ ] Zed Task\n");
    seedJourneyAndPath(db, "alpha", "\n### Etapa 1\n- [ ] Alpha Task\n");

    const perJourney = s.per_journey_created as Record<string, TaskSummary[]>;
    for (const journey of Object.keys(perJourney)) {
      const created = importTasksFromJourneyPath(db, journey);
      assert.deepEqual(created.map(summarize), perJourney[journey]);
    }
  });
});

test("syncTasksFromFile: reconciliation counts AND the stale-snapshot semantic (a title created by the pending loop is invisible to the SAME call's done loop)", () => {
  const s = scenario("sync_reconciliation");
  withDb((db, dir) => {
    const syncFilePath = join(dir, "sync-source.md");
    writeFileSync(
      syncFilePath,
      "\n### Etapa 1: Sprint\n" +
        "- [ ] Brand New Task\n" +
        "- [ ] Already Have This\n" +
        "- [ ] Both New And Done\n" +
        "- [x] Already Have This\n" +
        "- [x] Already Done Already\n" +
        "- [x] Both New And Done\n" +
        "- [x] Unknown Done Item\n",
      "utf8",
    );
    seedJourneyAndPath(db, "delta", "\n### Etapa 1\n- [ ] unused DB content\n", syncFilePath);
    createTask(
      db,
      { title: "Already Have This", journey: "delta" },
      "e1",
      "2026-01-01T00:00:00.000000Z",
    );
    const doneTask = createTask(
      db,
      { title: "Already Done Already", journey: "delta" },
      "e2",
      "2026-01-01T00:00:00.000000Z",
    );
    // Mark e2 done directly at the storage level (createTask always starts "todo").
    db.prepare("UPDATE tasks SET status = 'done' WHERE id = ?").run(doneTask.id);

    const result = syncTasksFromFile(db, s.journey_arg as string);
    assert.deepEqual(result, s.result);

    const finalTasks = getTasksByJourney(db, "delta")
      .map(summarize)
      .sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0));
    assert.deepEqual(finalTasks, s.final_tasks_by_title);
  });
});

test("syncTasksFromFile throws NoSyncFileConfiguredError with Python's exact message when no sync file is configured", () => {
  const s = scenario("sync_no_file_configured_raises");
  withDb((db) => {
    upsertIdentity(
      db,
      {
        id: "id-epsilon",
        layer: JOURNEY_LAYER,
        key: "epsilon",
        content: "# epsilon",
        version: "1.0.0",
        metadata: null,
      },
      "2026-01-01T00:00:00.000000Z",
    );
    assert.throws(
      () => syncTasksFromFile(db, s.journey_arg as string),
      (err: unknown) => err instanceof NoSyncFileConfiguredError && err.message === s.error_message,
    );
  });
});

test("syncTasksFromFile throws SyncFileNotFoundError with Python's exact message shape when the file is missing on disk", () => {
  withDb((db, dir) => {
    const missingPath = join(dir, "does-not-exist.md");
    upsertIdentity(
      db,
      {
        id: "id-zeta",
        layer: JOURNEY_LAYER,
        key: "zeta",
        content: "# zeta",
        version: "1.0.0",
        metadata: JSON.stringify({ sync_file: missingPath }),
      },
      "2026-01-01T00:00:00.000000Z",
    );
    assert.throws(
      () => syncTasksFromFile(db, "zeta"),
      (err: unknown) =>
        err instanceof SyncFileNotFoundError && err.message === `File not found: ${missingPath}`,
    );
  });
});
