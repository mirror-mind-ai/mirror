// Fixture-driven write-parity verification for CV22.DS4.
//
// The Python oracle driver (`ts/parity/write_parity.py`) copies a source DB,
// applies real writes on its own copy under a frozen clock, and records the
// resulting rows as `python_state`. This module replays the same writes through
// the TS core on a fresh copy of the same seed and grades the states. Each probe
// starts from the pristine seed, opened through the copy-only guard, and a
// hash-verified backup is required first.

import { copyFileSync } from "node:fs";
import { type BackupRecord, requireBackup } from "../db/backupGate.ts";
import { assertCopyTarget } from "../db/copyGuard.ts";
import { openDatabaseCopyForWrite } from "../db/database.ts";
import { updateIdentityMetadata } from "../identity/identityStore.ts";
import { setIdentity } from "../identity/setIdentity.ts";
import { createJourney, setProjectPath } from "../journey/journeyWrite.ts";
import { logAccess, logUse } from "../memory/reinforcement.ts";
import { evaluateWriteProbe, type MutatedRow, type WriteProbeParityResult } from "./writeParity.ts";
import { applyWriteProbe, type WriteProbe } from "./writeProbe.ts";

/** Journey-probe inputs (id, now, and project_path are injected from the oracle). */
export interface JourneyProbeParams {
  id: string;
  slug: string;
  content: string;
  icon: string | null;
  color: string | null;
  project_path_normalized: string;
}

/** One identity write operation the probe replays, mirroring a real Python call. */
export type IdentityOperation =
  | {
      op: "set_identity";
      /** Injected from the oracle (the generated id on INSERT; the existing id on UPDATE). */
      id: string;
      layer: string;
      key: string;
      content: string;
      /** null/absent => default "1.0.0", matching set_identity. */
      version?: string | null;
      /** null/absent => inherit the stored metadata, matching set_identity. */
      metadata?: string | null;
    }
  | { op: "update_metadata"; layer: string; key: string; metadata: string };

/** Identity-probe inputs: the ordered operations to replay under the frozen now. */
export interface IdentityProbeParams {
  operations: IdentityOperation[];
}

/** One probe as recorded by the Python oracle. */
export interface WriteProbeFixture {
  label: string;
  probe_type: string;
  frozen_now_ms: number;
  now_iso: string;
  target_ids: string[];
  access_context?: string | null;
  journey?: JourneyProbeParams;
  identity?: IdentityProbeParams;
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

const IDENTITY_COLUMNS = [
  "layer",
  "key",
  "content",
  "version",
  "created_at",
  "updated_at",
  "metadata",
];

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
        logAccess(db, id, fixture.now_iso, fixture.access_context ?? null);
        logUse(db, id);
      }
    },
  }),
  journey: (fixture) => {
    const params = requireJourneyParams(fixture);
    return {
      label: fixture.label,
      snapshots: [
        {
          table: "identity",
          keyColumn: "id",
          columns: IDENTITY_COLUMNS,
          selectorColumn: "id",
          selectorValues: [params.id],
        },
      ],
      apply(db) {
        createJourney(
          db,
          {
            id: params.id,
            slug: params.slug,
            content: params.content,
            icon: params.icon,
            color: params.color,
          },
          fixture.now_iso,
        );
        setProjectPath(db, params.slug, params.project_path_normalized, fixture.now_iso);
      },
    };
  },
  identity: (fixture) => {
    const params = requireIdentityParams(fixture);
    return {
      label: fixture.label,
      snapshots: [
        {
          table: "identity",
          keyColumn: "id",
          columns: IDENTITY_COLUMNS,
          selectorColumn: "id",
          selectorValues: fixture.target_ids,
        },
      ],
      apply(db) {
        for (const op of params.operations) {
          if (op.op === "update_metadata") {
            updateIdentityMetadata(db, op.layer, op.key, op.metadata, fixture.now_iso);
          } else {
            setIdentity(
              db,
              {
                id: op.id,
                layer: op.layer,
                key: op.key,
                content: op.content,
                version: op.version ?? undefined,
                metadata: op.metadata,
              },
              fixture.now_iso,
            );
          }
        }
      },
    };
  },
};

function requireJourneyParams(fixture: WriteProbeFixture): JourneyProbeParams {
  if (!fixture.journey) {
    throw new Error("journey probe requires journey params");
  }
  return fixture.journey;
}

function requireIdentityParams(fixture: WriteProbeFixture): IdentityProbeParams {
  if (!fixture.identity) {
    throw new Error("identity probe requires identity params");
  }
  return fixture.identity;
}

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
