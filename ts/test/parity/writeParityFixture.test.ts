import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { BackupGateError, sha256File } from "../../src/db/backupGate.ts";
import { openDatabaseCopyForWrite } from "../../src/db/database.ts";
import {
  verifyWriteFixture,
  type WriteParityFixture,
} from "../../src/parity/writeParityFixture.ts";

const FROZEN_NOW_MS = Date.UTC(2026, 5, 23, 12, 0, 0);
const FROZEN_ISO = new Date(FROZEN_NOW_MS).toISOString();

function tempWorkspace(): { seedPath: string; tsCopyPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-wpf-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  return {
    seedPath: join(tmpDir, "seed.db"),
    tsCopyPath: join(tmpDir, "ts-copy.db"),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function seed(dbPath: string): void {
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    db.exec(
      "CREATE TABLE memories (id TEXT PRIMARY KEY, last_accessed_at TEXT, use_count INTEGER)",
    );
    db.prepare("INSERT INTO memories (id, last_accessed_at, use_count) VALUES (?, ?, ?)").run(
      "m1",
      "2020-01-01T00:00:00",
      3,
    );
  } finally {
    db.close();
  }
}

function fixtureWithOracleUseCount(
  useCount: number,
  ws: { seedPath: string; tsCopyPath: string },
): WriteParityFixture {
  return {
    source_label: "unit",
    seed_db_path: ws.seedPath,
    ts_copy_path: ws.tsCopyPath,
    backup: { path: ws.seedPath, sha256: sha256File(ws.seedPath) },
    probes: [
      {
        label: "log_access_1",
        probe_type: "log_access",
        frozen_now_ms: FROZEN_NOW_MS,
        table: "memories",
        id_column: "id",
        columns: ["last_accessed_at", "use_count"],
        target_ids: ["m1"],
        python_state: [{ id: "m1", cells: { last_accessed_at: FROZEN_ISO, use_count: useCount } }],
      },
    ],
  };
}

test("verifyWriteFixture replays the TS probe on a seed copy and PASSes a matching oracle", () => {
  const ws = tempWorkspace();
  seed(ws.seedPath);
  try {
    const results = verifyWriteFixture(fixtureWithOracleUseCount(4, ws));
    assert.equal(results.length, 1);
    assert.equal(results[0].match, true);
  } finally {
    ws.cleanup();
  }
});

test("verifyWriteFixture FAILs when the oracle state diverges from the TS replay", () => {
  const ws = tempWorkspace();
  seed(ws.seedPath);
  try {
    const results = verifyWriteFixture(fixtureWithOracleUseCount(5, ws));
    assert.equal(results[0].match, false);
  } finally {
    ws.cleanup();
  }
});

test("verifyWriteFixture rejects an unknown probe type", () => {
  const ws = tempWorkspace();
  seed(ws.seedPath);
  try {
    const fixture = fixtureWithOracleUseCount(4, ws);
    fixture.probes[0].probe_type = "nonexistent";
    assert.throws(() => verifyWriteFixture(fixture), /unknown write probe type/);
  } finally {
    ws.cleanup();
  }
});

test("verifyWriteFixture aborts when no backup is recorded", () => {
  const ws = tempWorkspace();
  seed(ws.seedPath);
  try {
    const fixture = fixtureWithOracleUseCount(4, ws);
    fixture.backup = undefined;
    assert.throws(() => verifyWriteFixture(fixture), BackupGateError);
  } finally {
    ws.cleanup();
  }
});
