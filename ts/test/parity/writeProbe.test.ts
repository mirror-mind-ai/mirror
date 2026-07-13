import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite } from "../../src/db/database.ts";
import { evaluateWriteProbe } from "../../src/parity/writeParity.ts";
import { applyWriteProbe, type WriteProbe } from "../../src/parity/writeProbe.ts";

const FROZEN_NOW_MS = Date.UTC(2026, 5, 23, 12, 0, 0);
const ISO = new Date(FROZEN_NOW_MS).toISOString();

function tempCopies(): { aPath: string; bPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-probe-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  return {
    aPath: join(tmpDir, "a.db"),
    bPath: join(tmpDir, "b.db"),
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
      "CREATE TABLE access_log (id INTEGER PRIMARY KEY AUTOINCREMENT, memory_id TEXT, accessed_at TEXT, access_context TEXT)",
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

/** log_access-shaped probe: UPDATE memories + INSERT memory access-log row. */
function reinforcementProbe(): WriteProbe {
  return {
    label: "reinforcement",
    snapshots: [
      {
        table: "memories",
        keyColumn: "id",
        columns: ["last_accessed_at", "use_count"],
        selectorColumn: "id",
        selectorValues: ["m1"],
      },
      {
        table: "access_log",
        keyColumn: "id",
        columns: ["memory_id", "accessed_at", "access_context"],
        selectorColumn: "memory_id",
        selectorValues: ["m1"],
      },
    ],
    apply(db, frozenNowMs) {
      const iso = new Date(frozenNowMs).toISOString();
      db.prepare(
        "INSERT INTO access_log (memory_id, accessed_at, access_context) VALUES (?, ?, ?)",
      ).run("m1", iso, "retrieval");
      db.prepare("UPDATE memories SET last_accessed_at = ? WHERE id = ?").run(iso, "m1");
      db.prepare("UPDATE memories SET use_count = use_count + 1 WHERE id = ?").run("m1");
    },
  };
}

test("snapshotState captures multiple tables including an inserted row", () => {
  const { aPath, cleanup } = tempCopies();
  seed(aPath);
  const db = openDatabaseCopyForWrite(aPath);
  try {
    const rows = applyWriteProbe(db, reinforcementProbe(), FROZEN_NOW_MS);
    assert.deepEqual(rows, [
      { id: "memories:m1", cells: { last_accessed_at: ISO, use_count: 4 } },
      {
        id: "access_log:1",
        cells: { memory_id: "m1", accessed_at: ISO, access_context: "retrieval" },
      },
    ]);
  } finally {
    db.close();
    cleanup();
  }
});

test("identical two-table applies across copies yield PASS", () => {
  const { aPath, bPath, cleanup } = tempCopies();
  seed(aPath);
  seed(bPath);
  const a = openDatabaseCopyForWrite(aPath);
  const b = openDatabaseCopyForWrite(bPath);
  try {
    const pythonRows = applyWriteProbe(a, reinforcementProbe(), FROZEN_NOW_MS);
    const tsRows = applyWriteProbe(b, reinforcementProbe(), FROZEN_NOW_MS);
    assert.equal(evaluateWriteProbe("reinforcement", pythonRows, tsRows).match, true);
  } finally {
    a.close();
    b.close();
    cleanup();
  }
});

test("a divergent access_context in the inserted row yields FAIL", () => {
  const { aPath, bPath, cleanup } = tempCopies();
  seed(aPath);
  seed(bPath);
  const a = openDatabaseCopyForWrite(aPath);
  const b = openDatabaseCopyForWrite(bPath);
  try {
    const good = applyWriteProbe(a, reinforcementProbe(), FROZEN_NOW_MS);
    const drifted = reinforcementProbe();
    drifted.apply = (db) => {
      db.prepare(
        "INSERT INTO access_log (memory_id, accessed_at, access_context) VALUES (?, ?, ?)",
      ).run("m1", ISO, "DRIFT");
      db.prepare("UPDATE memories SET last_accessed_at = ? WHERE id = ?").run(ISO, "m1");
      db.prepare("UPDATE memories SET use_count = use_count + 1 WHERE id = ?").run("m1");
    };
    const bad = applyWriteProbe(b, drifted, FROZEN_NOW_MS);
    assert.equal(evaluateWriteProbe("reinforcement", good, bad).match, false);
  } finally {
    a.close();
    b.close();
    cleanup();
  }
});

test("snapshotState rejects an unsafe SQL identifier before querying", () => {
  const { aPath, cleanup } = tempCopies();
  seed(aPath);
  const db = openDatabaseCopyForWrite(aPath);
  try {
    const badProbe: WriteProbe = {
      label: "bad",
      snapshots: [
        {
          table: "memories",
          keyColumn: "id",
          columns: ["use_count; DROP TABLE memories"],
          selectorColumn: "id",
          selectorValues: ["m1"],
        },
      ],
      apply() {},
    };
    assert.throws(() => applyWriteProbe(db, badProbe, FROZEN_NOW_MS), /unsafe SQL identifier/);
  } finally {
    db.close();
    cleanup();
  }
});
