import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import { listJourneyOptions } from "../../src/journey/journeyOptions.ts";
import {
  createJourney,
  JourneyNotFoundError,
  journeyMetadata,
  setProjectPath,
} from "../../src/journey/journeyWrite.ts";
import { resolveParentJourney } from "../../src/journey/parentJourney.ts";
import { createIdentityTable } from "../helpers/identitySchema.ts";

const NOW = "2026-06-23T12:00:00.123456Z";
const LATER = "2026-06-24T09:30:00.500000Z";

function tempCopy(): { dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-jw-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  return {
    dbPath: join(tmpDir, "copy.db"),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function seedIdentity(db: WritableDatabase): void {
  createIdentityTable(db);
}

test("setProjectPath throws a typed JourneyNotFoundError carrying the slug", () => {
  const { dbPath, cleanup } = tempCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  seedIdentity(db);
  try {
    let caught: unknown;
    try {
      setProjectPath(db, "nope", "/x", NOW);
    } catch (error) {
      caught = error;
    }
    assert.ok(caught instanceof JourneyNotFoundError);
    assert.equal(caught.slug, "nope");
  } finally {
    db.close();
    cleanup();
  }
});

test("journeyMetadata keeps only non-empty trimmed fields", () => {
  assert.deepEqual(journeyMetadata({ icon: " star ", parentJourney: "", color: "blue" }), {
    icon: "star",
    color: "blue",
  });
});

test("createJourney inserts an identity row with canonical (JSON.stringify) metadata", () => {
  const { dbPath, cleanup } = tempCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    seedIdentity(db);
    createJourney(
      db,
      { id: "j-1", slug: "demo", content: "# Demo", icon: "🚀", color: "blue" },
      NOW,
    );
    assert.deepEqual(
      db
        .prepare(
          "SELECT id, layer, key, content, version, created_at, updated_at, metadata " +
            "FROM identity WHERE key = ?",
        )
        .get("demo"),
      {
        id: "j-1",
        layer: "journey",
        key: "demo",
        content: "# Demo",
        version: "1.0.0",
        created_at: NOW,
        updated_at: NOW,
        // CV22.DS6.US1 canonical JSON.stringify: insertion order (icon, color),
        // raw UTF-8, no spaces — no longer the Python json.dumps byte-dialect.
        metadata: '{"icon":"🚀","color":"blue"}',
      },
    );
  } finally {
    db.close();
    cleanup();
  }
});

test("createJourney stores null metadata when no fields are set", () => {
  const { dbPath, cleanup } = tempCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    seedIdentity(db);
    createJourney(db, { id: "j-1", slug: "bare", content: "# Bare" }, NOW);
    assert.equal(
      db.prepare("SELECT metadata FROM identity WHERE key = ?").get("bare")?.metadata,
      null,
    );
  } finally {
    db.close();
    cleanup();
  }
});

test("setProjectPath updates project_path in place and re-serializes canonically", () => {
  const { dbPath, cleanup } = tempCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    seedIdentity(db);
    // create stores canonical JSON in insertion order: {"project_path":"/old","icon":"star"}
    createJourney(
      db,
      { id: "j-1", slug: "demo", content: "# Demo", projectPath: "/old", icon: "star" },
      NOW,
    );
    setProjectPath(db, "demo", "/new/resolved", LATER);
    assert.deepEqual(
      db.prepare("SELECT metadata, updated_at FROM identity WHERE key = ?").get("demo"),
      { metadata: '{"project_path":"/new/resolved","icon":"star"}', updated_at: LATER },
    );
  } finally {
    db.close();
    cleanup();
  }
});

test("create -> set-path round-trips through canonical JSON with values intact", () => {
  const { dbPath, cleanup } = tempCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    seedIdentity(db);
    createJourney(
      db,
      { id: "j-1", slug: "demo", content: "# Demo", projectPath: "/old", parentJourney: "root" },
      NOW,
    );
    setProjectPath(db, "demo", "/new", LATER);
    const row = db
      .prepare("SELECT metadata, parent_journey FROM identity WHERE key = ?")
      .get("demo");
    // parent_journey survives the round-trip in the JSON, AND the column set at
    // create time is untouched by a later set_project_path (which never writes
    // parent_journey itself).
    assert.deepEqual(JSON.parse(row?.metadata as string), {
      project_path: "/new",
      parent_journey: "root",
    });
    assert.equal(row?.parent_journey, "root");
  } finally {
    db.close();
    cleanup();
  }
});

// CV22.DS6.US3 rider (activated in DS7.US1): createJourney atomically mirrors
// parent_journey into the first-class column in the same transaction as the
// JSON metadata write.

test("createJourney atomically sets the parent_journey column alongside the JSON", () => {
  const { dbPath, cleanup } = tempCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    seedIdentity(db);
    createJourney(db, { id: "j-1", slug: "child", content: "# Child", parentJourney: "root" }, NOW);
    const row = db
      .prepare("SELECT metadata, parent_journey FROM identity WHERE key = ?")
      .get("child");
    assert.equal(row?.parent_journey, "root");
    assert.equal(JSON.parse(row?.metadata as string).parent_journey, "root");
  } finally {
    db.close();
    cleanup();
  }
});

test("createJourney leaves the column NULL (not empty string) when no parent is given", () => {
  const { dbPath, cleanup } = tempCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    seedIdentity(db);
    createJourney(db, { id: "j-1", slug: "root-journey", content: "# Root" }, NOW);
    const row = db.prepare("SELECT parent_journey FROM identity WHERE key = ?").get("root-journey");
    assert.equal(row?.parent_journey, null);
  } finally {
    db.close();
    cleanup();
  }
});

test("end to end: createJourney's write and resolveParentJourney's read genuinely agree via the DB", () => {
  const { dbPath, cleanup } = tempCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    seedIdentity(db);
    createJourney(db, { id: "j-root", slug: "root", content: "# Root\n**Status:** active" }, NOW);
    createJourney(
      db,
      {
        id: "j-child",
        slug: "child",
        content: "# Child\n**Status:** active",
        parentJourney: "root",
      },
      NOW,
    );
    const rows = db
      .prepare(
        "SELECT key, content, metadata, parent_journey FROM identity WHERE layer = 'journey' ORDER BY key",
      )
      .all();
    const childRow = rows.find((r) => r.key === "child");
    assert.ok(childRow, "expected the child row to exist");
    assert.equal(resolveParentJourney(childRow), "root");
    const options = listJourneyOptions(
      rows.map((row) => ({
        key: row.key as string,
        content: row.content as string,
        metadata: row.metadata as string | null,
        parent_journey: row.parent_journey as string | null,
      })),
    );
    const child = options.find((o) => o.id === "child");
    assert.equal(
      child?.parent_journey,
      "root",
      "the full write-then-read path must agree on the parent",
    );
  } finally {
    db.close();
    cleanup();
  }
});

test("createJourney rolls back the WHOLE write when the column statement fails mid-transaction", () => {
  const { dbPath, cleanup } = tempCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    // A pre-migration schema: identity WITHOUT parent_journey, simulating a
    // database this rider's migration hasn't reached yet. The metadata upsert
    // (statement 1) would succeed in isolation; the column update (statement 2)
    // cannot. Proves withTransaction rolls back statement 1 too -- the failure
    // must leave NEITHER side updated, not a metadata-only partial write.
    db.exec(
      "CREATE TABLE identity (id TEXT PRIMARY KEY, layer TEXT NOT NULL, key TEXT NOT NULL, " +
        "content TEXT NOT NULL, version TEXT DEFAULT '1.0.0', created_at TEXT NOT NULL, " +
        "updated_at TEXT NOT NULL, metadata TEXT, UNIQUE(layer, key))",
    );
    assert.throws(() =>
      createJourney(db, { id: "j-1", slug: "demo", content: "# Demo", parentJourney: "root" }, NOW),
    );
    const row = db.prepare("SELECT COUNT(*) AS c FROM identity WHERE key = ?").get("demo");
    assert.equal(row?.c, 0, "the INSERT from statement 1 must not survive the rollback");
  } finally {
    db.close();
    cleanup();
  }
});
