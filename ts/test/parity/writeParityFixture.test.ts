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

const NOW_ISO = "2026-06-23T12:00:00.123456Z";
const CONTEXT = "retrieval";

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
    db.exec(
      "CREATE TABLE memory_access_log (id INTEGER PRIMARY KEY AUTOINCREMENT, memory_id TEXT, accessed_at TEXT, access_context TEXT)",
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

function fixtureWithOracle(
  useCount: number,
  accessContext: string | null,
  ws: { seedPath: string; tsCopyPath: string },
): WriteParityFixture {
  return {
    source_label: "unit",
    seed_db_path: ws.seedPath,
    ts_copy_path: ws.tsCopyPath,
    backup: { path: ws.seedPath, sha256: sha256File(ws.seedPath) },
    probes: [
      {
        label: "reinforcement_1",
        probe_type: "reinforcement",
        frozen_now_ms: 0,
        now_iso: NOW_ISO,
        access_context: CONTEXT,
        target_ids: ["m1"],
        python_state: [
          { id: "memories:m1", cells: { last_accessed_at: NOW_ISO, use_count: useCount } },
          {
            id: "memory_access_log:1",
            cells: { memory_id: "m1", accessed_at: NOW_ISO, access_context: accessContext },
          },
        ],
      },
    ],
  };
}

test("verifyWriteFixture PASSes a matching two-table reinforcement oracle", () => {
  const ws = tempWorkspace();
  seed(ws.seedPath);
  try {
    const results = verifyWriteFixture(fixtureWithOracle(4, CONTEXT, ws));
    assert.equal(results.length, 1);
    assert.equal(results[0].match, true);
  } finally {
    ws.cleanup();
  }
});

test("verifyWriteFixture FAILs when the oracle use_count diverges", () => {
  const ws = tempWorkspace();
  seed(ws.seedPath);
  try {
    assert.equal(verifyWriteFixture(fixtureWithOracle(5, CONTEXT, ws))[0].match, false);
  } finally {
    ws.cleanup();
  }
});

test("verifyWriteFixture FAILs when the oracle access_context diverges", () => {
  const ws = tempWorkspace();
  seed(ws.seedPath);
  try {
    assert.equal(verifyWriteFixture(fixtureWithOracle(4, "different", ws))[0].match, false);
  } finally {
    ws.cleanup();
  }
});

test("verifyWriteFixture rejects an unknown probe type", () => {
  const ws = tempWorkspace();
  seed(ws.seedPath);
  try {
    const fixture = fixtureWithOracle(4, CONTEXT, ws);
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
    const fixture = fixtureWithOracle(4, CONTEXT, ws);
    fixture.backup = undefined;
    assert.throws(() => verifyWriteFixture(fixture), BackupGateError);
  } finally {
    ws.cleanup();
  }
});

const JOURNEY_META = '{"color": "blue", "icon": "star", "project_path": "/resolved"}';

function seedIdentity(dbPath: string): void {
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    db.exec(
      "CREATE TABLE identity (id TEXT PRIMARY KEY, layer TEXT NOT NULL, key TEXT NOT NULL, " +
        "content TEXT NOT NULL, version TEXT DEFAULT '1.0.0', created_at TEXT NOT NULL, " +
        "updated_at TEXT NOT NULL, metadata TEXT, UNIQUE(layer, key))",
    );
  } finally {
    db.close();
  }
}

function journeyFixture(
  metadata: string,
  ws: { seedPath: string; tsCopyPath: string },
): WriteParityFixture {
  return {
    source_label: "unit",
    seed_db_path: ws.seedPath,
    ts_copy_path: ws.tsCopyPath,
    backup: { path: ws.seedPath, sha256: sha256File(ws.seedPath) },
    probes: [
      {
        label: "journey_1",
        probe_type: "journey",
        frozen_now_ms: 0,
        now_iso: NOW_ISO,
        target_ids: [],
        journey: {
          id: "j-1",
          slug: "demo",
          content: "# Demo",
          icon: "star",
          color: "blue",
          project_path_normalized: "/resolved",
        },
        python_state: [
          {
            id: "identity:j-1",
            cells: {
              layer: "journey",
              key: "demo",
              content: "# Demo",
              version: "1.0.0",
              created_at: NOW_ISO,
              updated_at: NOW_ISO,
              metadata,
            },
          },
        ],
      },
    ],
  };
}

test("verifyWriteFixture PASSes a matching journey oracle (identity row incl. metadata)", () => {
  const ws = tempWorkspace();
  seedIdentity(ws.seedPath);
  try {
    assert.equal(verifyWriteFixture(journeyFixture(JOURNEY_META, ws))[0].match, true);
  } finally {
    ws.cleanup();
  }
});

test("verifyWriteFixture FAILs when the journey metadata JSON diverges", () => {
  const ws = tempWorkspace();
  seedIdentity(ws.seedPath);
  try {
    const divergent = '{"color": "blue", "icon": "star", "project_path": "/DIFFERENT"}';
    assert.equal(verifyWriteFixture(journeyFixture(divergent, ws))[0].match, false);
  } finally {
    ws.cleanup();
  }
});
