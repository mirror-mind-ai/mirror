// Navigator-visible route for CV22.DS6.TS1 — Schema Bootstrap & DDL Ownership.
//
// Creates a fresh database via the TS core's createSchema() in a throwaway
// temp file, compares its structural inventory against the committed Python
// snapshot (schemaInventorySnapshot.ts — see that file for how it is
// generated/kept in sync), and runs the FTS5 functional probe (insert/
// update/delete, including an accented term). No privacy redaction is
// needed here — schema structure (table/column/index names) is not user
// data, unlike the DS2/DS4/DS5 real-DB-copy harnesses.
//
// Usage: node ts/parity/schema_structural_parity.ts

import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../src/db/database.ts";
import { assertFtsIntegrity, FtsIntegrityError } from "../src/db/ftsIntegrity.ts";
import { createSchema } from "../src/db/schema.ts";
import { buildSchemaInventory } from "../src/db/schemaInventory.ts";
import { SCHEMA_INVENTORY_SNAPSHOT } from "../src/db/schemaInventorySnapshot.ts";
import { diffTsInventoryAgainstSnapshot } from "../src/db/schemaTsDivergence.ts";

function runFtsProbe(db: WritableDatabase): { ok: boolean; detail: string } {
  try {
    db.prepare(
      "INSERT INTO memories (id, memory_type, title, content, created_at) " +
        "VALUES ('probe-1', 'insight', 'Café da manhã', 'Uma memória sobre café e código.', " +
        "'2026-07-23T00:00:00Z')",
    ).run();
    assertFtsIntegrity(db);
    const matchCount = (query: string): number =>
      (
        db.prepare("SELECT rowid FROM memories_fts WHERE memories_fts MATCH ?").all(query) as {
          rowid: number;
        }[]
      ).length;
    if (matchCount("café") !== 1) return { ok: false, detail: "accented insert did not match" };
    if (matchCount("código") !== 1) return { ok: false, detail: "content term did not match" };

    db.prepare("UPDATE memories SET content = 'Nada a ver.' WHERE id = 'probe-1'").run();
    assertFtsIntegrity(db);
    if (matchCount("código") !== 0) return { ok: false, detail: "stale content still matched after UPDATE" };

    db.prepare("DELETE FROM memories WHERE id = 'probe-1'").run();
    assertFtsIntegrity(db);
    if (matchCount("café") !== 0) return { ok: false, detail: "deleted row still matched" };

    return { ok: true, detail: "insert/update/delete + integrity-check all green" };
  } catch (error) {
    const message = error instanceof FtsIntegrityError ? error.message : String(error);
    return { ok: false, detail: message };
  }
}

function main(): number {
  const dir = mkdtempSync(join(tmpdir(), "mirror-schema-parity-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  let exitCode = 0;
  try {
    const db = openDatabaseCopyForWrite(join(tmpDir, "fresh.db"));
    try {
      createSchema(db);
      const inventory = buildSchemaInventory(db);

      const problems = diffTsInventoryAgainstSnapshot(inventory, SCHEMA_INVENTORY_SNAPSHOT);
      const structuralOk = problems.length === 0;

      process.stdout.write(
        "== schema inventory (TS-created vs Python snapshot + enumerated TS-only additions) ==\n",
      );
      if (structuralOk) {
        process.stdout.write(
          "  match (TS \u2287 Python: identity.parent_journey column + idx_identity_parent_journey)\n",
        );
      } else {
        process.stdout.write("  MISMATCH\n");
        for (const problem of problems) process.stdout.write(`    ~ ${problem}\n`);
      }

      process.stdout.write("== FTS functional probe (accented content) ==\n");
      const fts = runFtsProbe(db);
      process.stdout.write(`  ${fts.ok ? "PASS" : "FAIL"}: ${fts.detail}\n`);

      const pass = structuralOk && fts.ok;
      process.stdout.write(`\nSTRUCTURAL PARITY: ${pass ? "PASS" : "FAIL"}\n`);
      exitCode = pass ? 0 : 1;
    } finally {
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return exitCode;
}

process.exit(main());
