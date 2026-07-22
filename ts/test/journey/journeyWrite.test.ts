import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import {
  createJourney,
  JourneyNotFoundError,
  journeyMetadata,
  setProjectPath,
} from "../../src/journey/journeyWrite.ts";
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
    const meta = db.prepare("SELECT metadata FROM identity WHERE key = ?").get("demo")
      ?.metadata as string;
    // parent_journey survives the round-trip (US2 will graduate it to a column).
    assert.deepEqual(JSON.parse(meta), { project_path: "/new", parent_journey: "root" });
  } finally {
    db.close();
    cleanup();
  }
});
