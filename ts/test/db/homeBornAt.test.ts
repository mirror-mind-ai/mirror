// CR121 — the home's birth is the first `applied_at` in `_migrations`.
//
// Session maintenance reads that minimum as "when this home was born" and
// imports only the Pi sessions newer than it. The reading is an inference
// over a bookkeeping table, accepted because every plausible edit to the
// ledger moves the minimum forward (imports less, never more). This test
// pins the two facts the inference stands on: a fresh database stamps its
// whole ledger at its first open, and the stamp is the open's instant.

import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { homeBornAt } from "#conversation/backfill.ts";
import { bootstrapDatabase } from "#db/bootstrap.ts";

test("a fresh database is born at its first open, and every migration is stamped then", () => {
  const dir = mkdtempSync("/tmp/home-born-at-");
  const before = Date.now();
  const db = bootstrapDatabase(join(dir, "memory.db"));
  const after = Date.now();

  const born = Date.parse(homeBornAt(db));
  assert.ok(
    born >= before - 1000 && born <= after + 1000,
    `born ${born} outside [${before}, ${after}]`,
  );

  const ledger = db
    .prepare(
      "SELECT COUNT(*) AS n, MIN(applied_at) AS first, MAX(applied_at) AS last FROM _migrations",
    )
    .get() as {
    n: number;
    first: string;
    last: string;
  };
  assert.ok(ledger.n > 0);
  assert.equal(Date.parse(ledger.first), born);
  // The whole ledger belongs to the one open: nothing is stamped later than a
  // breath after the first row.
  assert.ok(Date.parse(ledger.last) - Date.parse(ledger.first) < 10_000);
  db.close();
});

test("the birth survives a reopen: it is the ledger's, not the connection's", () => {
  const dir = mkdtempSync("/tmp/home-born-at-");
  const path = join(dir, "memory.db");
  const first = bootstrapDatabase(path);
  const born = homeBornAt(first);
  first.close();

  const again = bootstrapDatabase(path);
  assert.equal(homeBornAt(again), born);
  again.close();
});
