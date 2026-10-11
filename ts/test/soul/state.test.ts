// CV22.DS7.US6 plateau 2 — Soul session state graded against the Python oracle.
//
// The assertion is the stored COLUMN, not a re-read through the same code that
// wrote it: `runtime_sessions.metadata` is shared with Python for as long as
// the strangler runs, so the bytes, the SQL NULL, the `active` flag, and the
// absence of a row are all part of the contract.

import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import golden from "#goldens/soul-state.golden.json" with { type: "json" };
import { createRuntimeTables } from "#helpers/runtimeSchema.ts";
import { upsertRuntimeSession } from "#mirror/runtimeSession.ts";
import {
  clearFruitInMaturation,
  clearHarvestedFruit,
  getFruitInMaturation,
  getHarvestedFruit,
  harvestFruit,
  resolveCliSoulSessionId,
  resolveSoulSessionId,
  SOUL_STATE_SESSION_ID,
  setFruitInMaturation,
} from "#soul/state.ts";

interface StateScenario {
  name: string;
  seed_metadata: string | null;
  seed_row: boolean;
  result?: string | null;
  expected_error?: string;
  after: { row_present: boolean; metadata: string | null; active: number | null };
}

interface SessionIdScenario {
  name: string;
  explicit: string | null;
  env: string;
  active_row: string | null;
  resolved: string;
  resolved_soul_only: string;
}

const fixture = golden as {
  session_constant: string;
  state: StateScenario[];
  session_ids: SessionIdScenario[];
};

const SESSION = "soul-session";
const NOW = "2026-09-08T12:00:00.000000Z";

function freshDb(name: string): WritableDatabase {
  const dir = mkdtempSync(`/tmp/soul-state-${name}-`);
  const db = openDatabaseCopyForWrite(join(dir, "copy.db"));
  createRuntimeTables(db);
  return db;
}

function runOperation(scenario: StateScenario, db: WritableDatabase): string | null | undefined {
  const name = scenario.name;
  if (name.startsWith("fruit_set")) {
    const value = fruitSetArgument(name);
    return setFruitInMaturation(db, value, SESSION, NOW).fruit;
  }
  if (name.startsWith("fruit_get")) return getFruitInMaturation(db, SESSION).fruit;
  if (name.startsWith("fruit_clear")) {
    clearFruitInMaturation(db, SESSION, NOW);
    return null;
  }
  if (name.startsWith("harvest_set")) {
    return harvestFruit(db, { fruit: harvestSetArgument(name), sessionId: SESSION }, NOW).fruit;
  }
  if (name.startsWith("harvest_get")) return getHarvestedFruit(db, SESSION).fruit;
  if (name.startsWith("harvest_clear")) {
    clearHarvestedFruit(db, SESSION, NOW);
    return null;
  }
  throw new Error(`golden carries an unmapped operation: ${name}`);
}

// The generator's arguments, mirrored by scenario name so the golden stays the
// single description of each case.
function fruitSetArgument(name: string): string {
  switch (name) {
    case "fruit_set_on_empty_metadata":
      return "a small true thing";
    case "fruit_set_strips_padding":
      return "  padded  ";
    case "fruit_set_unicode_kept_raw":
      return "café 🎯 沉默";
    case "fruit_set_preserves_other_metadata_keys":
      return "kept alongside operating mode";
    case "fruit_set_overwrites_existing":
      return "new";
    case "fruit_set_keeps_harvest_key":
      return "a second maturation";
    case "fruit_set_on_invalid_json":
    case "fruit_set_on_non_object_json":
    case "fruit_set_on_non_dict_soul_key":
      return "recovered";
    case "fruit_set_error_blank":
      return "   ";
    case "fruit_set_creates_missing_row":
      return "row created";
    default:
      throw new Error(`unmapped fruit_set scenario: ${name}`);
  }
}

function harvestSetArgument(name: string): string | null {
  switch (name) {
    case "harvest_set_explicit_replaces_maturation":
      return "  explicit  ";
    case "harvest_set_blank_falls_back_to_maturation":
    case "harvest_set_error_blank_and_no_maturation":
      return "   ";
    default:
      return null;
  }
}

for (const scenario of fixture.state) {
  test(`soul state: ${scenario.name} matches the Python oracle`, () => {
    const db = freshDb(scenario.name);
    if (scenario.seed_row) {
      upsertRuntimeSession(
        db,
        SESSION,
        { interface: "pi", metadata: scenario.seed_metadata },
        "2026-09-08T11:00:00.000000Z",
      );
    }

    if (scenario.expected_error !== undefined) {
      assert.throws(
        () => runOperation(scenario, db),
        (error: Error) => {
          assert.equal(error.message, scenario.expected_error);
          return true;
        },
      );
    } else {
      assert.equal(runOperation(scenario, db), scenario.result ?? null);
    }

    const row = db
      .prepare("SELECT metadata, active FROM runtime_sessions WHERE session_id = ?")
      .get(SESSION) as { metadata: string | null; active: number } | undefined;
    assert.equal(row !== undefined, scenario.after.row_present, "row presence");
    if (row) {
      assert.equal(row.metadata, scenario.after.metadata, "stored metadata bytes");
      assert.equal(row.active, scenario.after.active, "active flag");
    }
    db.close();
  });
}

for (const scenario of fixture.session_ids) {
  test(`soul session id: ${scenario.name} resolves as Python does`, () => {
    const db = freshDb("sessionid");
    if (scenario.active_row) {
      upsertRuntimeSession(db, scenario.active_row, { interface: "pi", active: true }, NOW);
    }
    const env = scenario.env || null;
    assert.equal(resolveCliSoulSessionId(db, scenario.explicit, env), scenario.resolved);
    assert.equal(resolveSoulSessionId(scenario.explicit, env), scenario.resolved_soul_only);
    db.close();
  });
}

test("the two resolvers disagree about an unstripped explicit id, and the CLI keeps that", () => {
  // Pinned separately because it is the one case where composing the resolvers
  // in the other order would silently retarget a session.
  const db = freshDb("precedence");
  assert.equal(resolveCliSoulSessionId(db, "  spaced  ", null), "  spaced  ");
  assert.equal(resolveSoulSessionId("  spaced  ", null), "spaced");
  db.close();
});

test("the global Soul constant matches Python's", () => {
  assert.equal(SOUL_STATE_SESSION_ID, fixture.session_constant);
});
