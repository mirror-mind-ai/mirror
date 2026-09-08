// CV22.DS7.US6 scope amendment — the BYTES of `runtime_sessions.metadata`.
//
// This file exists because every other artifact covering that column grades the
// parsed value: `mirror-state.golden.json` stores metadata as an object, and
// the write-parity harness canonicalizes the cell before hashing. Between them
// they let TypeScript write `{"operating_mode":{...}}` where Python writes
// `{"operating_mode": {...}}` from DS7.US4 until DS7.US6.
//
// The column is co-written by both cores until every command touching it is
// flipped, and Soul shares the same object, so the assertion is the raw string.

import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import golden from "#goldens/operating-mode-metadata.golden.json" with { type: "json" };
import { createRuntimeTables } from "#helpers/runtimeSchema.ts";
import { GLOBAL_OPERATING_MODE_SESSION_ID, upsertRuntimeSession } from "#mirror/runtimeSession.ts";
import { activateOperatingMode, deactivateOperatingMode } from "#mode/operatingMode.ts";

interface Scenario {
  name: string;
  seed_metadata: string | null;
  read_session: string;
  expected_metadata: string | null;
}

const fixture = golden as { global_session_id: string; scenarios: Scenario[] };
const SESSION = "operating-mode-session";
const NOW = "2026-09-08T12:00:00.000000Z";

function freshDb(name: string): WritableDatabase {
  const dir = mkdtempSync(`/tmp/operating-mode-${name}-`);
  const db = openDatabaseCopyForWrite(join(dir, "copy.db"));
  createRuntimeTables(db);
  return db;
}

function run(scenario: Scenario, db: WritableDatabase): void {
  switch (scenario.name) {
    case "activate_session_no_prior_metadata":
    case "activate_session_beside_soul_key":
      activateOperatingMode(
        db,
        { mode: "Soul Mode", journey: "mirror-ts-core", sessionId: SESSION },
        NOW,
      );
      return;
    case "activate_session_without_journey":
      activateOperatingMode(db, { mode: "Soul Mode", journey: null, sessionId: SESSION }, NOW);
      return;
    case "activate_session_unicode_journey":
      activateOperatingMode(
        db,
        { mode: "Soul Mode", journey: "jornada-café-沉默", sessionId: SESSION },
        NOW,
      );
      return;
    case "activate_global_without_session":
      activateOperatingMode(
        db,
        { mode: "Builder Mode", journey: "mirror-ts-core", sessionId: null },
        NOW,
      );
      return;
    case "deactivate_session_leaves_soul_key":
    case "deactivate_session_leaves_nothing":
      deactivateOperatingMode(db, SESSION, NOW);
      return;
    default:
      throw new Error(`golden carries an unmapped scenario: ${scenario.name}`);
  }
}

for (const scenario of fixture.scenarios) {
  test(`operating-mode metadata bytes: ${scenario.name}`, () => {
    const db = freshDb(scenario.name);
    if (scenario.seed_metadata !== null) {
      upsertRuntimeSession(
        db,
        SESSION,
        { interface: "pi", metadata: scenario.seed_metadata },
        "2026-09-08T11:00:00.000000Z",
      );
    }
    run(scenario, db);

    const row = db
      .prepare("SELECT metadata FROM runtime_sessions WHERE session_id = ?")
      .get(scenario.read_session) as { metadata: string | null } | undefined;
    assert.equal(row?.metadata ?? null, scenario.expected_metadata);
    db.close();
  });
}

test("the global operating-mode session id matches Python's", () => {
  assert.equal(GLOBAL_OPERATING_MODE_SESSION_ID, fixture.global_session_id);
});

test("Soul and mode writes leave one dialect in the shared column", () => {
  // The regression this file was created for: two writers, one row, one object.
  const db = freshDb("shared-column");
  activateOperatingMode(db, { mode: "Soul Mode", journey: "j", sessionId: SESSION }, NOW);
  const afterMode = db
    .prepare("SELECT metadata FROM runtime_sessions WHERE session_id = ?")
    .get(SESSION) as { metadata: string };
  assert.equal(
    afterMode.metadata,
    '{"operating_mode": {"active_mode": "Soul Mode", "active_journey": "j"}}',
  );
  db.close();
});
