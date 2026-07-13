// Fixture-driven write-parity verification for CV22.DS4.
//
// The Python oracle driver (`ts/parity/write_parity.py`) copies a source DB,
// applies the real reinforcement writes on its own copy under a frozen clock, and
// records the resulting two-table rows as `python_state`. This module replays the
// same writes through the TS core on a fresh copy of the same seed and grades the
// states. Each probe starts from the pristine seed, opened through the copy-only
// guard, and a hash-verified backup is required first.

import { copyFileSync } from "node:fs";
import { type BackupRecord, requireBackup } from "../db/backupGate.ts";
import { assertCopyTarget } from "../db/copyGuard.ts";
import { openDatabaseCopyForWrite } from "../db/database.ts";
import { logAccess, logUse } from "../memory/reinforcement.ts";
import { evaluateWriteProbe, type MutatedRow, type WriteProbeParityResult } from "./writeParity.ts";
import { applyWriteProbe, type WriteProbe } from "./writeProbe.ts";

/** One probe as recorded by the Python oracle. */
export interface WriteProbeFixture {
  label: string;
  probe_type: string;
  frozen_now_ms: number;
  /** Exact ISO timestamp the oracle stamped, injected so TS matches it. */
  now_iso: string;
  access_context: string | null;
  target_ids: string[];
  python_state: MutatedRow[];
}

export interface WriteParityFixture {
  source_label?: string;
  seed_db_path: string;
  ts_copy_path: string;
  backup?: BackupRecord;
  probes: WriteProbeFixture[];
}

type WriteProbeFactory = (fixture: WriteProbeFixture) => WriteProbe;

/** TS-side implementations of the write probes the Python oracle mirrors. */
const WRITE_PROBE_FACTORIES: Record<string, WriteProbeFactory> = {
  reinforcement: (fixture) => ({
    label: fixture.label,
    snapshots: [
      {
        table: "memories",
        keyColumn: "id",
        columns: ["last_accessed_at", "use_count"],
        selectorColumn: "id",
        selectorValues: fixture.target_ids,
      },
      {
        table: "memory_access_log",
        keyColumn: "id",
        columns: ["memory_id", "accessed_at", "access_context"],
        selectorColumn: "memory_id",
        selectorValues: fixture.target_ids,
      },
    ],
    apply(db) {
      for (const id of fixture.target_ids) {
        logAccess(db, id, fixture.now_iso, fixture.access_context);
        logUse(db, id);
      }
    },
  }),
};

/**
 * Replay each probe on a fresh copy of the seed through the TS core and grade it
 * against the Python-oracle state carried in the fixture.
 */
export function verifyWriteFixture(
  fixture: WriteParityFixture,
  options: { includeSensitiveDebug?: boolean } = {},
): WriteProbeParityResult[] {
  requireBackup(fixture.backup);
  return fixture.probes.map((probe) => {
    const factory = WRITE_PROBE_FACTORIES[probe.probe_type];
    if (!factory) {
      throw new Error(`unknown write probe type: ${probe.probe_type}`);
    }
    assertCopyTarget(fixture.ts_copy_path);
    copyFileSync(fixture.seed_db_path, fixture.ts_copy_path);
    const db = openDatabaseCopyForWrite(fixture.ts_copy_path);
    try {
      const tsState = applyWriteProbe(db, factory(probe), probe.frozen_now_ms);
      return evaluateWriteProbe(probe.label, probe.python_state, tsState, options);
    } finally {
      db.close();
    }
  });
}
