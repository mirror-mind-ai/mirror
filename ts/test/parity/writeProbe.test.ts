import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite } from "../../src/db/database.ts";
import { evaluateWriteProbe } from "../../src/parity/writeParity.ts";
import { applyWriteProbe, type WriteProbe } from "../../src/parity/writeProbe.ts";

const FROZEN_NOW_MS = Date.UTC(2026, 5, 23, 12, 0, 0);

function tempCopies(): { aPath: string; bPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-probe-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  return {
    aPath: join(tmpDir, "python-copy.db"),
    bPath: join(tmpDir, "ts-copy.db"),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function seed(dbPath: string): void {
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    db.exec(
      "CREATE TABLE memories (id TEXT PRIMARY KEY, last_accessed_at TEXT, use_count INTEGER)",
    );
    const insert = db.prepare(
      "INSERT INTO memories (id, last_accessed_at, use_count) VALUES (?, ?, ?)",
    );
    insert.run("m1", "2020-01-01T00:00:00", 3);
    insert.run("m2", "2020-01-01T00:00:00", 1);
  } finally {
    db.close();
  }
}

function logAccessProbe(): WriteProbe {
  return {
    label: "log_access",
    table: "memories",
    idColumn: "id",
    columns: ["last_accessed_at", "use_count"],
    targetIds: ["m1"],
    apply(db, frozenNowMs) {
      const iso = new Date(frozenNowMs).toISOString();
      db.prepare("UPDATE memories SET last_accessed_at = ? WHERE id = ?").run(iso, "m1");
      db.prepare("UPDATE memories SET use_count = use_count + 1 WHERE id = ?").run("m1");
    },
  };
}

test("applyWriteProbe applies a deterministic write and snapshots the mutated row", () => {
  const { aPath, cleanup } = tempCopies();
  seed(aPath);
  const db = openDatabaseCopyForWrite(aPath);
  try {
    const rows = applyWriteProbe(db, logAccessProbe(), FROZEN_NOW_MS);
    assert.deepEqual(rows, [
      { id: "m1", cells: { last_accessed_at: "2026-06-23T12:00:00.000Z", use_count: 4 } },
    ]);
  } finally {
    db.close();
    cleanup();
  }
});

test("the same probe under the same frozen now yields PASS across two copies", () => {
  const { aPath, bPath, cleanup } = tempCopies();
  seed(aPath);
  seed(bPath);
  const a = openDatabaseCopyForWrite(aPath);
  const b = openDatabaseCopyForWrite(bPath);
  try {
    const pythonRows = applyWriteProbe(a, logAccessProbe(), FROZEN_NOW_MS);
    const tsRows = applyWriteProbe(b, logAccessProbe(), FROZEN_NOW_MS);
    assert.equal(evaluateWriteProbe("log_access", pythonRows, tsRows).match, true);
  } finally {
    a.close();
    b.close();
    cleanup();
  }
});

test("a frozen-now drift between the two copies yields FAIL", () => {
  const { aPath, bPath, cleanup } = tempCopies();
  seed(aPath);
  seed(bPath);
  const a = openDatabaseCopyForWrite(aPath);
  const b = openDatabaseCopyForWrite(bPath);
  try {
    const pythonRows = applyWriteProbe(a, logAccessProbe(), FROZEN_NOW_MS);
    const tsRows = applyWriteProbe(b, logAccessProbe(), FROZEN_NOW_MS + 1000);
    assert.equal(evaluateWriteProbe("log_access", pythonRows, tsRows).match, false);
  } finally {
    a.close();
    b.close();
    cleanup();
  }
});

test("snapshotRows rejects an unsafe SQL identifier before querying", () => {
  const { aPath, cleanup } = tempCopies();
  seed(aPath);
  const db = openDatabaseCopyForWrite(aPath);
  try {
    const badProbe: WriteProbe = {
      ...logAccessProbe(),
      columns: ["use_count; DROP TABLE memories"],
    };
    assert.throws(() => applyWriteProbe(db, badProbe, FROZEN_NOW_MS), /unsafe SQL identifier/);
  } finally {
    db.close();
    cleanup();
  }
});
