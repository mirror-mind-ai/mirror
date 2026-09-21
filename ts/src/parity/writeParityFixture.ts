// Fixture-driven write-parity verification for CV22.DS4.
//
// The Python oracle driver (`ts/parity/write_parity.py`) copies a source DB,
// applies real writes on its own copy under a frozen clock, and records the
// resulting rows as `python_state`. This module replays the same writes through
// the TS core on a fresh copy of the same seed and grades the states. Each probe
// starts from the pristine seed, opened through the copy-only guard, and a
// hash-verified backup is required first.

import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { logAssistantMessage, logUserMessage } from "#conversation/logger.ts";
import { type BackupRecord, requireBackup } from "#db/backupGate.ts";
import { assertCopyTarget } from "#db/copyGuard.ts";
import { openDatabaseCopyForWrite } from "#db/database.ts";
import { assertFtsIntegrity } from "#db/ftsIntegrity.ts";
import { ensureMigratedOnOpen } from "#db/migrateOnOpen.ts";
import { updateIdentityMetadata } from "#identity/identityStore.ts";
import { setIdentity } from "#identity/setIdentity.ts";
import { createJourney, setProjectPath } from "#journey/journeyWrite.ts";
import { logAccess, logUse } from "#memory/reinforcement.ts";
import {
  type BuilderArtifactsProbeParams,
  type BuilderCursorProbeParams,
  type BuilderLoadProbeParams,
  builderArtifactsProbe,
  builderCursorStateProbe,
  builderLoadProbe,
} from "./builderProbes.ts";
import {
  type ExplorerHandoffProbeParams,
  type ExplorerStoryProbeParams,
  explorerHandoffProbe,
  explorerStoryProbe,
} from "./explorerProbes.ts";
import {
  type ExtBindingsProbeParams,
  type ExtensionInstallProbeParams,
  extBindingsProbe,
  extensionInstallProbe,
} from "./extensionProbes.ts";
import {
  type CloseTailProbeParams,
  closeTailProbe,
  type JourneyRepairApplyProbeParams,
  journeyRepairApplyProbe,
  type SessionCompositesProbeParams,
  sessionCompositesProbe,
} from "./lifecycleProbes.ts";
import { type RepairEncodingProbeParams, repairEncodingProbe } from "./safetyToolsProbes.ts";
import {
  type SoulApplyProbeParams,
  type SoulHarvestSaveProbeParams,
  type SoulStateProbeParams,
  soulApplyProbe,
  soulHarvestSaveProbe,
  soulStateProbe,
} from "./soulProbes.ts";
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
  | (WriteProbeBase & { probe_type: "identity"; identity: IdentityProbeParams })
  | (WriteProbeBase & {
      probe_type: "conversation_logger";
      conversation_logger: ConversationLoggerProbeParams;
    })
  // CV22.DS7.US10 slice F: the extraction lifecycle on a real-DB copy, both
  // cores answered by the same stub (see lifecycleProbes.ts).
  | (WriteProbeBase & { probe_type: "close_tail"; close_tail: CloseTailProbeParams })
  | (WriteProbeBase & {
      probe_type: "session_composites";
      session_composites: SessionCompositesProbeParams;
    })
  | (WriteProbeBase & {
      probe_type: "journey_repair_apply";
      journey_repair_apply: JourneyRepairApplyProbeParams;
    })
  // CV22.DS7.TS1: the mojibake repair over a seeded real-DB copy.
  | (WriteProbeBase & {
      probe_type: "repair_encoding";
      repair_encoding: RepairEncodingProbeParams;
    })
  // CV22.DS7.US6: the Soul ritual's session state, graded step by step.
  | (WriteProbeBase & {
      probe_type: "builder_cursor_state";
      builder_cursor: BuilderCursorProbeParams;
    })
  // CV22.DS7.TS4 plateau 3: extension bindings and the migration runner's write
  // half, on a real-DB copy. The state is an aggregate of two tables plus the
  // extension tables the migration creates, so it is all carried by `apply`.
  | (WriteProbeBase & {
      probe_type: "ext_bindings";
      ext_bindings: ExtBindingsProbeParams;
    })
  // CV22.DS7.TS4 plateau 5: `extensions install` graded as FILES on a real-DB
  // copy. Its home is disposable and derived from `ts_copy_path`, the same rule
  // the artifacts probe follows: an install probe must never be able to write
  // into a real mirror home.
  | (WriteProbeBase & {
      probe_type: "extension_install";
      extension_install: ExtensionInstallProbeParams;
    })
  // CV22.DS7.US8 plateau 3: story-package materialization on a real-DB copy, graded
  // as FILES. Its project tree is disposable and derived from `ts_copy_path`, so the
  // probe can never write into the journey's real project.
  | (WriteProbeBase & {
      probe_type: "builder_artifacts";
      builder_artifacts: BuilderArtifactsProbeParams;
    })
  // CV22.DS7.US8 plateau 7: a whole session start on a real corpus, graded as
  // opaque ids, counts, and surface digests — never a title, a body, or the query.
  | (WriteProbeBase & {
      probe_type: "builder_load";
      builder_load: BuilderLoadProbeParams;
    })
  | (WriteProbeBase & { probe_type: "soul_state"; soul_state: SoulStateProbeParams })
  | (WriteProbeBase & { probe_type: "soul_apply"; soul_apply: SoulApplyProbeParams })
  | (WriteProbeBase & {
      probe_type: "soul_harvest_save";
      soul_harvest_save: SoulHarvestSaveProbeParams;
    })
  // CV22.DS7.US7: the Exploratory Story's durable row AND its legacy runtime
  // payload, graded together after every step.
  | (WriteProbeBase & {
      probe_type: "explorer_story";
      explorer_story: ExplorerStoryProbeParams;
    })
  // CV22.DS7.US7: the handoff documents, graded as FILESYSTEM state — the one
  // command in this story that writes into the user's own repository.
  | (WriteProbeBase & {
      probe_type: "explorer_handoff";
      explorer_handoff: ExplorerHandoffProbeParams;
    });

/**
 * CV22.DS7.US5. The oracle's generated ids ride in the fixture because the TS
 * logger takes an id factory: replaying them makes the two copies' row states
 * directly comparable instead of differing only by uuid.
 */
export interface ConversationLoggerProbeParams {
  session_id: string;
  interface: string;
  user_text: string;
  assistant_text: string;
  conversation_id: string;
  message_ids: string[];
}

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

const CONVERSATION_COLUMNS = [
  "title",
  "started_at",
  "ended_at",
  "interface",
  "persona",
  "journey",
  "summary",
  "tags",
  "metadata",
];
const MESSAGE_COLUMNS = [
  "conversation_id",
  "role",
  "content",
  "created_at",
  "token_count",
  "metadata",
];
const RUNTIME_SESSION_COLUMNS = [
  "conversation_id",
  "interface",
  "mirror_active",
  "persona",
  "journey",
  "hook_injected",
  "active",
  "started_at",
  "updated_at",
  "closed_at",
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
/**
 * `tsCopyPath` is passed separately because it belongs to the FIXTURE, not to a
 * probe: only the artifacts probe needs it, to derive a disposable project tree
 * beside its own database copy.
 */
function buildWriteProbe(fixture: WriteProbeFixture, tsCopyPath: string): WriteProbe {
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
    case "conversation_logger": {
      const params = fixture.conversation_logger;
      return {
        label: fixture.label,
        snapshots: [
          {
            table: "conversations",
            keyColumn: "id",
            columns: CONVERSATION_COLUMNS,
            selectorColumn: "id",
            selectorValues: [params.conversation_id],
          },
          {
            table: "messages",
            keyColumn: "id",
            columns: MESSAGE_COLUMNS,
            selectorColumn: "conversation_id",
            selectorValues: [params.conversation_id],
          },
          {
            table: "runtime_sessions",
            keyColumn: "session_id",
            columns: RUNTIME_SESSION_COLUMNS,
            selectorColumn: "session_id",
            selectorValues: [params.session_id],
          },
        ],
        apply(db) {
          // Replay the oracle's ids in generation order: the conversation is
          // created first, then one id per appended message.
          const scriptedIds = [params.conversation_id, ...params.message_ids];
          let cursor = 0;
          const deps = {
            newId: () => {
              const id = scriptedIds[cursor];
              cursor += 1;
              if (id === undefined) {
                throw new Error(
                  "conversation-logger probe requested more ids than the oracle generated",
                );
              }
              return id;
            },
            nowIso: () => fixture.now_iso,
          };
          logUserMessage(
            db,
            params.session_id,
            params.user_text,
            { interface: params.interface },
            deps,
          );
          logAssistantMessage(
            db,
            params.session_id,
            params.assistant_text,
            { interface: params.interface },
            deps,
          );
        },
      };
    }
    case "close_tail":
      return closeTailProbe(fixture.label, fixture.now_iso, fixture.close_tail);
    case "session_composites":
      return sessionCompositesProbe(fixture.label, fixture.now_iso, fixture.session_composites);
    case "journey_repair_apply":
      return journeyRepairApplyProbe(fixture.label, fixture.journey_repair_apply);
    case "repair_encoding":
      return repairEncodingProbe(fixture.label, fixture.repair_encoding);
    case "explorer_story":
      return explorerStoryProbe(fixture.label, fixture.explorer_story, fixture.now_iso);
    case "explorer_handoff":
      return explorerHandoffProbe(fixture.label, fixture.explorer_handoff);
    case "builder_cursor_state":
      return builderCursorStateProbe(fixture.label, fixture.builder_cursor, fixture.now_iso);
    case "ext_bindings":
      return extBindingsProbe(fixture.label, fixture.ext_bindings, fixture.now_iso);
    case "extension_install": {
      // Beside the TypeScript database copy, mirroring the Python probe's
      // `<copy>.parent/extension-install-python`. Separate homes on purpose:
      // one shared home would make the second engine install over the first's
      // tree and report a different `copytree` outcome.
      const home = join(dirname(tsCopyPath), "extension-install-ts");
      rmSync(home, { recursive: true, force: true });
      mkdirSync(home, { recursive: true });
      // The database has to carry the name the home resolves to, or `install`
      // creates an empty one beside it and the probe grades a fresh corpus
      // while claiming a real one. The name is the Python half's, passed
      // through the fixture rather than recomputed here.
      const homeDatabasePath = join(home, fixture.extension_install.database_name);
      copyFileSync(tsCopyPath, homeDatabasePath);
      const homeDatabase = openDatabaseCopyForWrite(homeDatabasePath);
      // No register-validation step: CV22.DS10.TS2 removed the import of
      // extension code at install time, on BOTH engines' side of this probe.
      // What the probe grades -- migration rows, extension tables, catalog
      // writes -- is untouched by that removal.
      return extensionInstallProbe(
        fixture.label,
        fixture.extension_install,
        fixture.now_iso,
        home,
        homeDatabase,
      );
    }
    case "builder_artifacts":
      return builderArtifactsProbe(
        fixture.label,
        fixture.builder_artifacts,
        fixture.now_iso,
        // Beside the TypeScript database copy, mirroring the Python probe's
        // `<copy>.parent/builder-artifacts-python/project`. Separate trees on
        // purpose: one shared tree would make the second engine report `existing`
        // where the first reported `created`.
        join(dirname(tsCopyPath), "builder-artifacts-ts", "project"),
      );
    case "builder_load":
      return builderLoadProbe(fixture.label, fixture.builder_load, fixture.now_iso);
    case "soul_state":
      return soulStateProbe(fixture.label, fixture.soul_state, fixture.now_iso);
    case "soul_apply":
      return soulApplyProbe(fixture.label, fixture.soul_apply, fixture.now_iso);
    case "soul_harvest_save":
      return soulHarvestSaveProbe(fixture.label, fixture.soul_harvest_save, fixture.now_iso);
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
export async function verifyWriteFixture(
  fixture: WriteParityFixture,
  options: { includeSensitiveDebug?: boolean } = {},
): Promise<WriteProbeParityResult[]> {
  requireBackup(fixture.backup);
  const results: WriteProbeParityResult[] = [];
  for (const probe of fixture.probes) {
    assertCopyTarget(fixture.ts_copy_path);
    copyFileSync(fixture.seed_db_path, fixture.ts_copy_path);
    // The front door never writes without migrate-on-open (CV22.DS6.US3), so
    // neither does the harness: a TS-authored column such as `parent_journey`
    // is part of the schema the TS write path assumes.
    ensureMigratedOnOpen(fixture.ts_copy_path);
    const db = openDatabaseCopyForWrite(fixture.ts_copy_path);
    try {
      const tsState = await applyWriteProbe(db, buildWriteProbe(probe, fixture.ts_copy_path));
      // Grade the FTS side-effect of the write, not just the declared columns:
      // a memories mutation fires the memories_fts triggers (no-op if absent).
      assertFtsIntegrity(db);
      results.push(
        evaluateWriteProbe(
          probe.label,
          canonicalizeMetadataCells(probe.python_state),
          canonicalizeMetadataCells(tsState),
          options,
        ),
      );
    } finally {
      db.close();
    }
  }
  return results;
}
