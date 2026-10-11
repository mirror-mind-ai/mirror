// CV22.DS7.TS1 plateau 1 — reversible mojibake repair, graded against the
// Python oracle (`src/memory/cli/repair_encoding.py`).
//
// The command rewrites user-owned text, so every branch of the two-pass repair
// is graded case by case, the scan as an ORDERED hit list over a fixture that
// exercises the missing-table / missing-column tolerance, the dry-run report
// as exact stdout, and `--apply` as row state after one transaction. The
// corpus carries the divergence classes US10 found the hard way: astral code
// points after a lead byte, Python's `str.split()` whitespace set, and
// code-point preview capping.

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { openDatabaseCopyForWrite, type SqlValue, type WritableDatabase } from "#db/database.ts";
import {
  applyRepairs,
  hasRepairableMojibake,
  previewText,
  type RepairHit,
  renderApplyReport,
  renderScanReport,
  repairText,
  scanDatabase,
} from "#repair/encodingRepair.ts";

const GOLDEN_PATH = new URL("../goldens/repair-encoding.golden.json", import.meta.url);

type RowState = Record<string, unknown>;

interface Golden {
  text_cases: { label: string; input: string; repaired: string; has_mojibake: boolean }[];
  preview_cases: { label: string; input: string; limit: number; preview: string }[];
  fixture: { ddl: string[]; rows: { table: string; values: Record<string, SqlValue> }[] };
  scan_hits: RepairHit[];
  state_before: Record<string, RowState[]>;
  dry_run: Record<string, { argv: string[]; stdout: string; exit_code: number }>;
  apply: {
    stdout: string;
    exit_code: number;
    state_after: Record<string, RowState[]>;
    noop_stdout: string;
    noop_exit_code: number;
  };
}

const golden: Golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8"));

function fixture(): WritableDatabase {
  const dir = mkdtempSync("/tmp/repair-encoding-");
  const db = openDatabaseCopyForWrite(join(dir, "copy.db"));
  for (const ddl of golden.fixture.ddl) db.exec(ddl);
  for (const row of golden.fixture.rows) {
    const columns = Object.keys(row.values);
    db.prepare(
      `INSERT INTO "${row.table}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
    ).run(...columns.map((c) => row.values[c] as SqlValue));
  }
  return db;
}

function state(db: WritableDatabase): Record<string, RowState[]> {
  const out: Record<string, RowState[]> = {};
  for (const ddl of golden.fixture.ddl) {
    const table = ddl.split(" ")[2] as string;
    out[table] = db
      .prepare(`SELECT _rowid_ AS __rowid__, * FROM "${table}" ORDER BY _rowid_`)
      .all();
  }
  return out;
}

function limitFromArgv(argv: string[]): number {
  const index = argv.indexOf("--limit");
  return index === -1 ? 20 : Number(argv[index + 1]);
}

test("repairText matches the oracle on every corpus case", () => {
  for (const c of golden.text_cases) {
    assert.equal(repairText(c.input), c.repaired, c.label);
    assert.equal(hasRepairableMojibake(c.input), c.has_mojibake, c.label);
  }
});

test("previewText collapses Python's whitespace set and caps by code point", () => {
  for (const c of golden.preview_cases) {
    assert.equal(previewText(c.input, c.limit), c.preview, c.label);
  }
});

test("scanDatabase yields the oracle's ordered hit list, tolerating missing tables and columns", () => {
  const db = fixture();
  try {
    assert.deepEqual(scanDatabase(db), golden.scan_hits);
    assert.deepEqual(state(db), golden.state_before);
  } finally {
    db.close();
  }
});

test("dry-run report renders the oracle's stdout for every --limit shape", () => {
  const db = fixture();
  try {
    const hits = scanDatabase(db);
    for (const [label, c] of Object.entries(golden.dry_run)) {
      const rendered = renderScanReport({ dbPath: "<db>", hits, limit: limitFromArgv(c.argv) });
      assert.equal(
        `${rendered}Dry-run only. Re-run with --apply to modify the database.\n`,
        c.stdout,
        label,
      );
      assert.equal(c.exit_code, 0, label);
    }
    assert.deepEqual(state(db), golden.state_before, "a dry run must not change rows");
  } finally {
    db.close();
  }
});

test("applyRepairs updates every hit in one transaction and reports like the oracle", () => {
  const db = fixture();
  try {
    const hits = scanDatabase(db);
    const report = renderScanReport({ dbPath: "<db>", hits, limit: 20 });
    const applied = applyRepairs(db, hits);
    assert.equal(`${report}${renderApplyReport(applied)}`, golden.apply.stdout);
    assert.deepEqual(state(db), golden.apply.state_after);

    const again = scanDatabase(db);
    assert.equal(again.length, 0);
    assert.equal(
      `${renderScanReport({ dbPath: "<db>", hits: again, limit: 20 })}No changes needed.\n`,
      golden.apply.noop_stdout,
    );
  } finally {
    db.close();
  }
});

test("applyRepairs is all-or-nothing when a row update fails", () => {
  const db = fixture();
  try {
    const hits = scanDatabase(db);
    const poisoned: RepairHit[] = [...hits, { ...(hits[0] as RepairHit), table: "no_such_table" }];
    assert.throws(() => applyRepairs(db, poisoned));
    assert.deepEqual(state(db), golden.state_before, "a failed apply must roll back every update");
  } finally {
    db.close();
  }
});
