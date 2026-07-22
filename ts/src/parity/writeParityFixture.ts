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
import { assertFtsIntegrity } from "../db/ftsIntegrity.ts";
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
/** Fields every write probe fixture carries, regardless of type. */
interface WriteProbeBase {
  label: string;
  frozen_now_ms: number;
  now_iso: string;
  target_ids: string[];
  python_state: MutatedRow[];
}

/**
 * One probe as recorded by the Python oracle, discriminated on `probe_type`:
 * the journey/identity payload is required in its branch, so replaying a probe
 * needs no runtime presence checks and illegal shapes are unrepresentable.
 */
export type WriteProbeFixture =
  | (WriteProbeBase & { probe_type: "reinforcement"; access_context?: string | null })
  | (WriteProbeBase & { probe_type: "journey"; journey: JourneyProbeParams })
  | (WriteProbeBase & { probe_type: "identity"; identity: IdentityProbeParams });

export interface WriteParityFixture {
  source_label?: string;
  seed_db_path: string;
  ts_copy_path: string;
  backup?: BackupRecord;
  probes: WriteProbeFixture[];
}

const IDENTITY_COLUMNS = [
  "layer",
  "key",
  "content",
  "version",
  "created_at",
  "updated_at",
  "metadata",
];

function assertNever(value: never): never {
  throw new Error(`unknown write probe type: ${JSON.stringify(value)}`);
}

/**
 * Build the TS-side write probe for a fixture. Exhaustive over `probe_type`:
 * the discriminated union makes each branch's payload required (no runtime
 * requireX guards), and `assertNever` catches a malformed `probe_type` from
 * bad fixture JSON.
 */
function buildWriteProbe(fixture: WriteProbeFixture): WriteProbe {
  switch (fixture.probe_type) {
    case "reinforcement":
      return {
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
      };
    case "journey": {
      const params = fixture.journey;
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
    }
    case "identity": {
      const params = fixture.identity;
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
    }
    default:
      return assertNever(fixture);
  }
}

/** Deterministic JSON with recursively sorted object keys. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
  return `{${entries.join(",")}}`;
}

/**
 * Canonicalize the JSON `metadata` cell of each row (parse, then stable
 * key-sorted re-stringify) so write parity grades the *value*, not the
 * serialization dialect. CV22.DS6.US1 made TS write journey metadata as canonical
 * JSON.stringify, which no longer matches Python's json.dumps bytes; a value
 * difference still fails (different parsed content), a mere dialect difference
 * does not. Null or non-JSON metadata is left untouched.
 */
function canonicalizeMetadataCells(rows: readonly MutatedRow[]): MutatedRow[] {
  return rows.map((row) => {
    const meta = row.cells.metadata;
    if (typeof meta !== "string") return row;
    try {
      return { ...row, cells: { ...row.cells, metadata: stableStringify(JSON.parse(meta)) } };
    } catch {
      return row;
    }
  });
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
    assertCopyTarget(fixture.ts_copy_path);
    copyFileSync(fixture.seed_db_path, fixture.ts_copy_path);
    const db = openDatabaseCopyForWrite(fixture.ts_copy_path);
    try {
      const tsState = applyWriteProbe(db, buildWriteProbe(probe));
      // Grade the FTS side-effect of the write, not just the declared columns:
      // a memories mutation fires the memories_fts triggers (no-op if absent).
      assertFtsIntegrity(db);
      return evaluateWriteProbe(
        probe.label,
        canonicalizeMetadataCells(probe.python_state),
        canonicalizeMetadataCells(tsState),
        options,
      );
    } finally {
      db.close();
    }
  });
}
