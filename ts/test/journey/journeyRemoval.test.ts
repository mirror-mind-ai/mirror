import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import { createSchema } from "#db/schema.ts";
import {
  countJourneyAssociations,
  type JourneyAssociationCounts,
  JourneyRemovalError,
  removeJourney,
} from "#journey/journeyRemoval.ts";
import { createJourney } from "#journey/journeyWrite.ts";

const NOW = "2026-06-25T12:00:00.000000Z";
const TABLES = [
  "identity",
  "conversations",
  "memories",
  "tasks",
  "attachments",
  "runtime_sessions",
  "exploratory_stories",
  "builder_refinement_stories",
  "builder_change_requests",
  "builder_refinement_cursors",
] as const;

function tempDatabase(): {
  db: WritableDatabase;
  dbPath: string;
  dir: string;
  cleanup: () => void;
} {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-jr-"));
  const tmp = join(dir, "tmp");
  mkdirSync(tmp);
  const dbPath = join(tmp, "copy.db");
  const db = openDatabaseCopyForWrite(dbPath);
  createSchema(db);
  return { db, dbPath, dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function seedJourney(db: WritableDatabase, slug = "leaf", parentJourney?: string): void {
  createJourney(
    db,
    {
      id: `j-${slug}`,
      slug,
      content: `# ${slug}`,
      ...(parentJourney ? { parentJourney } : {}),
    },
    NOW,
  );
}

function snapshot(db: WritableDatabase): Record<string, unknown[]> {
  return Object.fromEntries(
    TABLES.map((table) => [table, db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]),
  );
}

type AssociationName = Exclude<keyof JourneyAssociationCounts, "child_journeys">;

const ASSOCIATIONS: readonly [AssociationName, (db: WritableDatabase) => void][] = [
  [
    "journey_paths",
    (db) =>
      db
        .prepare(
          "INSERT INTO identity (id, layer, key, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run("jp-leaf", "journey_path", "leaf", "# Path", NOW, NOW),
  ],
  [
    "identity_integrations",
    (db) =>
      db
        .prepare(
          "INSERT INTO identity_integrations (id, layer, key, content, source, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run("ii-leaf", "journey", "leaf", "Keep", "soul_mode", NOW),
  ],
  [
    "conversations",
    (db) =>
      db
        .prepare(
          "INSERT INTO conversations (id, started_at, interface, journey) VALUES (?, ?, ?, ?)",
        )
        .run("c-leaf", NOW, "test", "leaf"),
  ],
  [
    "memories",
    (db) =>
      db
        .prepare(
          "INSERT INTO memories (id, memory_type, title, content, journey, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run("m-leaf", "note", "Memory", "Keep", "leaf", NOW),
  ],
  [
    "tasks",
    (db) =>
      db
        .prepare(
          "INSERT INTO tasks (id, journey, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run("t-leaf", "leaf", "Keep", NOW, NOW),
  ],
  [
    "attachments",
    (db) =>
      db
        .prepare(
          "INSERT INTO attachments (id, journey_id, name, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run("a-leaf", "leaf", "keep.md", "Keep", NOW, NOW),
  ],
  [
    "runtime_sessions",
    (db) =>
      db
        .prepare(
          "INSERT INTO runtime_sessions (session_id, journey, started_at, updated_at) VALUES (?, ?, ?, ?)",
        )
        .run("s-leaf", "leaf", NOW, NOW),
  ],
  [
    "explorer_stories",
    (db) =>
      db
        .prepare(
          "INSERT INTO exploratory_stories (id, journey, created_at, updated_at) VALUES (?, ?, ?, ?)",
        )
        .run("e-leaf", "leaf", NOW, NOW),
  ],
  [
    "refinement_stories",
    (db) =>
      db
        .prepare(
          "INSERT INTO builder_refinement_stories (id, journey, display_code, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run("rs-leaf", "leaf", "RS001", "Keep", NOW, NOW),
  ],
  [
    "change_requests",
    (db) =>
      db
        .prepare(
          "INSERT INTO builder_change_requests (id, journey, display_code, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run("cr-leaf", "leaf", "CR001", "Keep", "Body", NOW, NOW),
  ],
  [
    "refinement_cursors",
    (db) =>
      db
        .prepare("INSERT INTO builder_refinement_cursors (journey, updated_at) VALUES (?, ?)")
        .run("leaf", NOW),
  ],
];

test("countJourneyAssociations returns the closed association inventory", () => {
  const { db, cleanup } = tempDatabase();
  try {
    seedJourney(db);
    for (const [, seed] of ASSOCIATIONS) seed(db);
    seedJourney(db, "child", "leaf");

    assert.deepEqual(countJourneyAssociations(db, "leaf"), {
      child_journeys: 1,
      journey_paths: 1,
      identity_integrations: 1,
      conversations: 1,
      memories: 1,
      tasks: 1,
      attachments: 1,
      runtime_sessions: 1,
      explorer_stories: 1,
      refinement_stories: 1,
      change_requests: 1,
      refinement_cursors: 1,
    });
  } finally {
    db.close();
    cleanup();
  }
});

test("removeJourney rejects a missing journey with the released message and zero writes", () => {
  const { db, cleanup } = tempDatabase();
  try {
    const before = snapshot(db);
    assert.throws(
      () => removeJourney(db, "missing"),
      (error: unknown) =>
        error instanceof JourneyRemovalError && error.message === "Journey 'missing' not found",
    );
    assert.deepEqual(snapshot(db), before);
  } finally {
    db.close();
    cleanup();
  }
});

test("removeJourney refuses children before other associations and preserves all state", () => {
  const { db, cleanup } = tempDatabase();
  try {
    seedJourney(db, "parent");
    seedJourney(db, "child", "parent");
    ASSOCIATIONS[3][1](db); // task for leaf does not affect parent
    db.prepare("UPDATE tasks SET journey = ? WHERE id = ?").run("parent", "t-leaf");
    const before = snapshot(db);
    assert.throws(
      () => removeJourney(db, "parent"),
      (error: unknown) =>
        error instanceof JourneyRemovalError &&
        error.message === "Journey 'parent' has child journeys; move or remove them first",
    );
    assert.deepEqual(snapshot(db), before);
  } finally {
    db.close();
    cleanup();
  }
});

for (const [name, seedAssociation] of ASSOCIATIONS) {
  test(`removeJourney refuses ${name} without mutation`, () => {
    const { db, cleanup } = tempDatabase();
    try {
      seedJourney(db);
      seedAssociation(db);
      const before = snapshot(db);
      assert.throws(
        () => removeJourney(db, "leaf"),
        (error: unknown) =>
          error instanceof JourneyRemovalError &&
          error.message === `Journey 'leaf' has associated records: ${name}=1`,
      );
      assert.deepEqual(snapshot(db), before);
    } finally {
      db.close();
      cleanup();
    }
  });
}

function seedAssociation(db: WritableDatabase, name: AssociationName): void {
  const entry = ASSOCIATIONS.find(([candidate]) => candidate === name);
  if (!entry) throw new Error(`no seeder registered for association '${name}'`);
  entry[1](db);
}

test("associated-record details use the released deterministic order", () => {
  const { db, cleanup } = tempDatabase();
  try {
    seedJourney(db);
    seedAssociation(db, "attachments");
    seedAssociation(db, "journey_paths");
    seedAssociation(db, "tasks");
    assert.throws(
      () => removeJourney(db, "leaf"),
      /associated records: journey_paths=1, tasks=1, attachments=1$/,
    );
  } finally {
    db.close();
    cleanup();
  }
});

test("child detection uses metadata authority and never the stale projection column", () => {
  const { db, cleanup } = tempDatabase();
  try {
    seedJourney(db, "metadata-parent");
    seedJourney(db, "column-parent");
    seedJourney(db, "child", "metadata-parent");
    db.prepare("UPDATE identity SET parent_journey = ? WHERE layer = 'journey' AND key = ?").run(
      "column-parent",
      "child",
    );

    assert.equal(countJourneyAssociations(db, "metadata-parent").child_journeys, 1);
    assert.equal(countJourneyAssociations(db, "column-parent").child_journeys, 0);
    assert.throws(() => removeJourney(db, "metadata-parent"), /has child journeys/);
    assert.equal(removeJourney(db, "column-parent"), true);
  } finally {
    db.close();
    cleanup();
  }
});

test("malformed and non-object child metadata do not fall back to the projection", () => {
  const { db, cleanup } = tempDatabase();
  try {
    seedJourney(db, "parent");
    seedJourney(db, "malformed");
    seedJourney(db, "array");
    db.prepare("UPDATE identity SET metadata = ?, parent_journey = ? WHERE key = ?").run(
      "{bad",
      "parent",
      "malformed",
    );
    db.prepare("UPDATE identity SET metadata = ?, parent_journey = ? WHERE key = ?").run(
      '[["parent_journey","parent"]]',
      "parent",
      "array",
    );
    assert.equal(countJourneyAssociations(db, "parent").child_journeys, 0);
    assert.equal(removeJourney(db, "parent"), true);
  } finally {
    db.close();
    cleanup();
  }
});

test("removeJourney deletes exactly one empty leaf and never touches filesystem content", () => {
  const { db, dir, cleanup } = tempDatabase();
  try {
    const project = join(dir, "project");
    const sentinel = join(project, "keep.txt");
    mkdirSync(project);
    writeFileSync(sentinel, "keep");
    createJourney(
      db,
      {
        id: "j-leaf",
        slug: "leaf",
        content: "# Leaf",
        projectPath: project,
        syncFile: join(project, "JOURNEY.md"),
        icon: "leaf",
        color: "green",
      },
      NOW,
    );
    seedJourney(db, "other");

    assert.equal(removeJourney(db, "leaf"), true);
    assert.equal(
      db.prepare("SELECT 1 FROM identity WHERE layer = 'journey' AND key = ?").get("leaf"),
      undefined,
    );
    assert.ok(
      db.prepare("SELECT 1 FROM identity WHERE layer = 'journey' AND key = ?").get("other"),
    );
    assert.equal(existsSync(sentinel), true);
  } finally {
    db.close();
    cleanup();
  }
});

test("an association writer that wins the lock is observed before removal", async () => {
  const { db, dbPath, cleanup } = tempDatabase();
  try {
    seedJourney(db);
    const workerPath = join(import.meta.dirname, "journeyRemovalContentionWorker.ts");
    const worker = spawn(process.execPath, [workerPath, dbPath, "leaf"], {
      env: { ...process.env, NODE_OPTIONS: "--no-warnings" },
    });
    let stderr = "";
    worker.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    const closed = new Promise<number | null>((resolve) => worker.on("close", resolve));
    await new Promise<void>((resolve, reject) => {
      worker.stdout.on("data", (chunk) => {
        if (String(chunk).includes("locked")) resolve();
      });
      worker.on("error", reject);
      worker.on("close", (code) => {
        if (code !== 0) reject(new Error(`contention worker failed (${code}): ${stderr}`));
      });
    });

    assert.throws(() => removeJourney(db, "leaf"), /associated records: tasks=1$/);
    assert.equal(await closed, 0, stderr);
    assert.ok(db.prepare("SELECT 1 FROM identity WHERE layer = 'journey' AND key = ?").get("leaf"));
    assert.ok(db.prepare("SELECT 1 FROM tasks WHERE id = 'contending-task'").get());
  } finally {
    db.close();
    cleanup();
  }
});

test("a database error during DELETE rolls the whole removal back", () => {
  const { db, cleanup } = tempDatabase();
  try {
    seedJourney(db);
    db.exec(`CREATE TRIGGER refuse_journey_delete BEFORE DELETE ON identity
      WHEN OLD.layer = 'journey' AND OLD.key = 'leaf'
      BEGIN SELECT RAISE(ABORT, 'injected delete failure'); END`);
    const before = snapshot(db);
    assert.throws(() => removeJourney(db, "leaf"), /injected delete failure/);
    assert.deepEqual(snapshot(db), before);
  } finally {
    db.close();
    cleanup();
  }
});
