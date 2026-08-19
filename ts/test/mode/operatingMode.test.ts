import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { openDatabaseCopyForWrite } from "#db/database.ts";
import { createRuntimeTables } from "#helpers/runtimeSchema.ts";
import {
  activateOperatingMode,
  deactivateOperatingMode,
  getActiveOperatingMode,
  renderModeActivation,
  renderModeStatus,
} from "#mode/operatingMode.ts";

function fixture() {
  const dir = mkdtempSync("/tmp/mirror-mode-state-");
  const db = openDatabaseCopyForWrite(join(dir, "copy.db"));
  createRuntimeTables(db);
  return db;
}

test("global operating mode follows Python activation/status/deactivation contract", () => {
  const db = fixture();
  const state = activateOperatingMode(
    db,
    { mode: " Builder Mode ", journey: " mirror-ts-core " },
    "2026-01-01T00:00:00.000000Z",
  );
  assert.equal(renderModeActivation(state), "Activated Builder Mode for mirror-ts-core\n");
  assert.deepEqual(getActiveOperatingMode(db, null), {
    mode: "Builder Mode",
    journey: "mirror-ts-core",
  });
  deactivateOperatingMode(db, null, "2026-01-01T00:01:00.000000Z");
  assert.equal(renderModeStatus(getActiveOperatingMode(db, null)), "Mirror Mode\n");
  db.close();
});

test("session mode overrides global and deactivation preserves unrelated metadata", () => {
  const db = fixture();
  activateOperatingMode(db, { mode: "Builder Mode" }, "2026-01-01T00:00:00.000000Z");
  db.prepare(
    `INSERT INTO runtime_sessions
      (session_id, interface, started_at, updated_at, metadata)
     VALUES (?, ?, ?, ?, ?)`,
  ).run("s1", "pi", "t0", "t0", JSON.stringify({ keep: true }));
  activateOperatingMode(
    db,
    { mode: "Explorer Mode", journey: "journey-a", sessionId: "s1" },
    "2026-01-01T00:01:00.000000Z",
  );
  assert.deepEqual(getActiveOperatingMode(db, "s1"), {
    mode: "Explorer Mode",
    journey: "journey-a",
  });
  deactivateOperatingMode(db, "s1", "2026-01-01T00:02:00.000000Z");
  assert.deepEqual(getActiveOperatingMode(db, "s1"), {
    mode: "Builder Mode",
    journey: null,
  });
  const row = db.prepare("SELECT metadata FROM runtime_sessions WHERE session_id = 's1'").get();
  assert.deepEqual(JSON.parse(String(row?.metadata)), { keep: true });
  db.close();
});

test("empty mode is rejected", () => {
  const db = fixture();
  assert.throws(
    () => activateOperatingMode(db, { mode: "  " }, "2026-01-01T00:00:00.000000Z"),
    /mode must not be empty/,
  );
  db.close();
});
