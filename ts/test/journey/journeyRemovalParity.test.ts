import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

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
const GOLDEN_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "goldens",
  "journey-removal.golden.json",
);

type SeedAssociation = "attachments" | "journey_paths" | "tasks";
interface GoldenCase {
  name: string;
  journey: string;
  journeys: { key: string; parent_journey: string | null }[];
  associations: SeedAssociation[];
  expected_counts: JourneyAssociationCounts;
  outcome: "ok" | "error";
  error: string | null;
  removed: boolean;
  exists_after: boolean;
}
interface Golden {
  cases: GoldenCase[];
}
const golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8")) as Golden;

function seedAssociation(db: WritableDatabase, name: SeedAssociation, journey: string): void {
  if (name === "journey_paths") {
    db.prepare(
      "INSERT INTO identity (id, layer, key, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(`path-${journey}`, "journey_path", journey, "# Path", NOW, NOW);
  } else if (name === "tasks") {
    db.prepare(
      "INSERT INTO tasks (id, journey, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    ).run(`task-${journey}`, journey, "Keep", NOW, NOW);
  } else {
    db.prepare(
      "INSERT INTO attachments (id, journey_id, name, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(`attachment-${journey}`, journey, "keep.md", "Keep", NOW, NOW);
  }
}

function withCaseDatabase<T>(goldenCase: GoldenCase, fn: (db: WritableDatabase) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-jr-parity-"));
  const tmp = join(dir, "tmp");
  mkdirSync(tmp);
  const db = openDatabaseCopyForWrite(join(tmp, "copy.db"));
  try {
    createSchema(db);
    for (const row of goldenCase.journeys) {
      createJourney(
        db,
        {
          id: `j-${row.key}`,
          slug: row.key,
          content: `# ${row.key}`,
          parentJourney: row.parent_journey,
        },
        NOW,
      );
    }
    for (const association of goldenCase.associations) {
      seedAssociation(db, association, goldenCase.journey);
    }
    return fn(db);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

test("journey-removal golden is well-formed", () => {
  assert.equal(golden.cases.length, 5);
  assert.ok(golden.cases.some((entry) => entry.outcome === "ok"));
  assert.ok(golden.cases.some((entry) => entry.outcome === "error"));
});

test("TS conservative removal reproduces the real Python outcomes and messages", () => {
  for (const goldenCase of golden.cases) {
    withCaseDatabase(goldenCase, (db) => {
      assert.deepEqual(
        countJourneyAssociations(db, goldenCase.journey),
        goldenCase.expected_counts,
        `${goldenCase.name}: association inventory`,
      );
      let removed = false;
      let error: unknown;
      try {
        removed = removeJourney(db, goldenCase.journey);
      } catch (caught) {
        error = caught;
      }
      assert.equal(removed, goldenCase.removed, `${goldenCase.name}: removed`);
      if (goldenCase.outcome === "error") {
        assert.ok(error instanceof JourneyRemovalError, `${goldenCase.name}: typed error`);
        assert.equal(error.message, goldenCase.error, `${goldenCase.name}: exact message`);
      } else {
        assert.equal(error, undefined, `${goldenCase.name}: no error`);
      }
      const existsAfter =
        db
          .prepare("SELECT 1 AS present FROM identity WHERE layer = 'journey' AND key = ?")
          .get(goldenCase.journey) !== undefined;
      assert.equal(existsAfter, goldenCase.exists_after, `${goldenCase.name}: postcondition`);
    });
  }
});
