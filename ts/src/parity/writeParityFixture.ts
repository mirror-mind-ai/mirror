// Fixture-driven write-parity verification for CV22.DS4.TS1.
//
// The Python oracle driver (`ts/parity/write_parity.py`) copies a source DB,
// applies a sample deterministic write on its own copy under a frozen now, and
// records the resulting rows as `python_state` in a fixture. This module replays
// the *same* write through the TS core on a fresh copy of the same seed and
// grades the two states. Each probe starts from the pristine seed so probes can
// never contaminate one another, and the TS copy is opened through the copy-only
// guard so a verification can never touch a live database.

import { copyFileSync } from "node:fs";
import { assertCopyTarget } from "../db/copyGuard.ts";
import { openDatabaseCopyForWrite } from "../db/database.ts";
import { evaluateWriteProbe, type MutatedRow, type WriteProbeParityResult } from "./writeParity.ts";
import { applyWriteProbe, type WriteProbe } from "./writeProbe.ts";

/** One probe as recorded by the Python oracle. */
export interface WriteProbeFixture {
  label: string;
  probe_type: string;
  frozen_now_ms: number;
  table: string;
  id_column: string;
  columns: string[];
  target_ids: string[];
  python_state: MutatedRow[];
}

export interface WriteParityFixture {
  source_label?: string;
  /** Pristine copy both sides start from; the TS side re-copies it per probe. */
  seed_db_path: string;
  /** Where the TS side writes its copy (must pass the copy-only guard). */
  ts_copy_path: string;
  probes: WriteProbeFixture[];
}

type WriteProbeFactory = (fixture: WriteProbeFixture) => WriteProbe;

/**
 * TS-side implementations of the sample write probes the Python oracle mirrors.
 * TS1 ships the `log_access`-shaped sample that exercises the harness; US1 will
 * register the real ported write here.
 */
const WRITE_PROBE_FACTORIES: Record<string, WriteProbeFactory> = {
  log_access: (fixture) => ({
    label: fixture.label,
    table: "memories",
    idColumn: "id",
    columns: ["last_accessed_at", "use_count"],
    targetIds: fixture.target_ids,
    apply(db, frozenNowMs) {
      const iso = new Date(frozenNowMs).toISOString();
      const stampTime = db.prepare("UPDATE memories SET last_accessed_at = ? WHERE id = ?");
      const bumpCount = db.prepare("UPDATE memories SET use_count = use_count + 1 WHERE id = ?");
      for (const id of fixture.target_ids) {
        stampTime.run(iso, id);
        bumpCount.run(id);
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
