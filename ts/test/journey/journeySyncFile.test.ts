import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import { upsertIdentity } from "../../src/identity/identityStore.ts";
import { JOURNEY_PATH_LAYER } from "../../src/journey/journeyStatus.ts";
import {
  getJourneyPath,
  getSyncFile,
  JOURNEY_LAYER,
  setSyncFile,
} from "../../src/journey/journeySyncFile.ts";
import { JourneyNotFoundError } from "../../src/journey/journeyWrite.ts";
import { createIdentityTable } from "../helpers/identitySchema.ts";

function tempWorkspace(): { dir: string; dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-journeysyncfile-"));
  const tmp = join(dir, "tmp");
  mkdirSync(tmp);
  return {
    dir,
    dbPath: join(tmp, "copy.db"),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function withDb(fn: (db: WritableDatabase, dir: string) => void): void {
  const { dir, dbPath, cleanup } = tempWorkspace();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    createIdentityTable(db);
    fn(db, dir);
  } finally {
    db.close();
    cleanup();
  }
}

test("getSyncFile returns null when the journey has no 'journey'-layer row at all", () => {
  withDb((db) => {
    assert.equal(getSyncFile(db, "nope"), null);
  });
});

test("getSyncFile returns null when the row has no metadata", () => {
  withDb((db) => {
    upsertIdentity(
      db,
      {
        id: "id-1",
        layer: JOURNEY_LAYER,
        key: "cv22",
        content: "# cv22",
        version: "1.0.0",
        metadata: null,
      },
      "2026-01-01T00:00:00.000000Z",
    );
    assert.equal(getSyncFile(db, "cv22"), null);
  });
});

test("getSyncFile returns null on malformed metadata JSON, matching Python's except-and-return-None", () => {
  withDb((db) => {
    upsertIdentity(
      db,
      {
        id: "id-1",
        layer: JOURNEY_LAYER,
        key: "cv22",
        content: "# cv22",
        version: "1.0.0",
        metadata: "{not json",
      },
      "2026-01-01T00:00:00.000000Z",
    );
    assert.equal(getSyncFile(db, "cv22"), null);
  });
});

test("getSyncFile returns the configured sync_file path", () => {
  withDb((db) => {
    upsertIdentity(
      db,
      {
        id: "id-1",
        layer: JOURNEY_LAYER,
        key: "cv22",
        content: "# cv22",
        version: "1.0.0",
        metadata: JSON.stringify({ sync_file: "/path/to/ref.md" }),
      },
      "2026-01-01T00:00:00.000000Z",
    );
    assert.equal(getSyncFile(db, "cv22"), "/path/to/ref.md");
  });
});

test("setSyncFile throws JourneyNotFoundError when the journey has no 'journey'-layer row", () => {
  withDb((db) => {
    assert.throws(
      () => setSyncFile(db, "nope", "/x", "2026-01-01T00:00:00.000000Z"),
      JourneyNotFoundError,
    );
  });
});

test("setSyncFile preserves every other existing metadata key (read-modify-write)", () => {
  withDb((db) => {
    upsertIdentity(
      db,
      {
        id: "id-1",
        layer: JOURNEY_LAYER,
        key: "cv22",
        content: "# cv22",
        version: "1.0.0",
        metadata: JSON.stringify({ icon: "🚀", project_path: "/proj" }),
      },
      "2026-01-01T00:00:00.000000Z",
    );
    setSyncFile(db, "cv22", "/path/to/ref.md", "2026-02-01T00:00:00.000000Z");
    assert.equal(getSyncFile(db, "cv22"), "/path/to/ref.md");
    const row = db
      .prepare("SELECT metadata, updated_at FROM identity WHERE layer = ? AND key = ?")
      .get(JOURNEY_LAYER, "cv22");
    assert.deepEqual(JSON.parse(row?.metadata as string), {
      icon: "🚀",
      project_path: "/proj",
      sync_file: "/path/to/ref.md",
    });
    assert.equal(row?.updated_at, "2026-02-01T00:00:00.000000Z");
  });
});

test("setSyncFile starts from an empty object when existing metadata is malformed", () => {
  withDb((db) => {
    upsertIdentity(
      db,
      {
        id: "id-1",
        layer: JOURNEY_LAYER,
        key: "cv22",
        content: "# cv22",
        version: "1.0.0",
        metadata: "{not json",
      },
      "2026-01-01T00:00:00.000000Z",
    );
    setSyncFile(db, "cv22", "/x", "2026-02-01T00:00:00.000000Z");
    assert.equal(getSyncFile(db, "cv22"), "/x");
  });
});

test("getJourneyPath falls back to the DB journey_path layer when no sync file is configured", () => {
  withDb((db) => {
    upsertIdentity(
      db,
      {
        id: "id-1",
        layer: JOURNEY_PATH_LAYER,
        key: "cv22",
        content: "# The Path\n",
        version: "1.0.0",
        metadata: null,
      },
      "2026-01-01T00:00:00.000000Z",
    );
    assert.equal(getJourneyPath(db, "cv22"), "# The Path\n");
  });
});

test("getJourneyPath returns null when neither a sync file nor a journey_path row exists", () => {
  withDb((db) => {
    assert.equal(getJourneyPath(db, "cv22"), null);
  });
});

test("getJourneyPath reads the external sync file when configured and readable", () => {
  withDb((db, dir) => {
    const syncFilePath = join(dir, "external.md");
    writeFileSync(syncFilePath, "# External Content\n", "utf8");
    upsertIdentity(
      db,
      {
        id: "id-1",
        layer: JOURNEY_LAYER,
        key: "cv22",
        content: "# cv22",
        version: "1.0.0",
        metadata: JSON.stringify({ sync_file: syncFilePath }),
      },
      "2026-01-01T00:00:00.000000Z",
    );
    upsertIdentity(
      db,
      {
        id: "id-2",
        layer: JOURNEY_PATH_LAYER,
        key: "cv22",
        content: "# DB Content (ignored)\n",
        version: "1.0.0",
        metadata: null,
      },
      "2026-01-01T00:00:00.000000Z",
    );
    assert.equal(getJourneyPath(db, "cv22"), "# External Content\n");
  });
});

test("getJourneyPath falls back to the DB when the configured sync file does not exist on disk", () => {
  withDb((db, dir) => {
    const missingPath = join(dir, "missing.md");
    upsertIdentity(
      db,
      {
        id: "id-1",
        layer: JOURNEY_LAYER,
        key: "cv22",
        content: "# cv22",
        version: "1.0.0",
        metadata: JSON.stringify({ sync_file: missingPath }),
      },
      "2026-01-01T00:00:00.000000Z",
    );
    upsertIdentity(
      db,
      {
        id: "id-2",
        layer: JOURNEY_PATH_LAYER,
        key: "cv22",
        content: "# DB Fallback\n",
        version: "1.0.0",
        metadata: null,
      },
      "2026-01-01T00:00:00.000000Z",
    );
    assert.equal(getJourneyPath(db, "cv22"), "# DB Fallback\n");
  });
});
