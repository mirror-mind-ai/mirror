// Delete a persona, for a host that shows what will go first — CR207.
//
// A persona is one identity row, but its id is read, as text and without a
// foreign key, in eight places. Each has a decision, held by
// `PERSONA_DELETION_INVENTORY` and checked against the schema by
// `personaLifecycle.test.ts`:
//
//   - History stays. Conversations, memories and runtime sessions keep the id:
//     they record who spoke, not a live link. A host shows a deleted persona's
//     id with nothing to open.
//   - Machinery goes. The row, its generated descriptor, its identity
//     integrations and its extension bindings are deleted, so a persona that
//     later takes the same id starts clean (the lesson CR202 found for
//     Journeys: a binding left behind wakes for the next owner of the id).
//   - A live choice is cleared. A Journey's `default_persona` naming the persona
//     is removed from the Journey's metadata, and the router falls back as for
//     a Journey with none; the global sticky default naming it is set to none.
//   - An heir refuses. A persona whose `inherits_from` names this one is named
//     in a `persona_has_heirs` refusal; changing an heir's inheritance is not
//     this call's (CR205 keeps `inherits_from` read-only).
//
// `ext_*` tables are not searched: unlike a Journey's (`journeyDeletion.ts`
// rule 4), no extension column is known to hold a persona's id, and an
// extension's own rows are the extension's to release.
//
// Two calls, as for a Journey. `previewPersonaDeletion` reads and answers the
// counts with a digest; `deletePersona` takes the digest back and refuses with
// `persona_changed` when the home no longer matches it. Under one immediate
// transaction it re-reads the preview, takes a backup with a name never reused
// (`backups/pre-persona-deletion-<id>-<UTC stamp>-<random>.db`, 0600), checks
// that the backup reads as the same preview, and only then deletes. The core
// never deletes the named backup.

import { createHash, randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseNotCurrentError } from "#conversation/hostCalls.ts";
import {
  type Database,
  openDatabaseReadOnly,
  prepareArchiveSnapshot,
  snapshotDatabaseTo,
  type WritableDatabase,
  withTransaction,
} from "#db/database.ts";
import { inspectMigrationState } from "#db/migrationReport.ts";
import { openLiveWriteDatabase } from "#frontDoor/liveBackup.ts";
import { GLOBAL_STICKY_DEFAULTS_SESSION_ID } from "#mirror/runtimeSession.ts";
import { nowIso } from "#util/pyGenerators.ts";
import { PersonaCallRejectedError, personaRow, text } from "./personaCalls.ts";

export interface PersonaDeletionPreview {
  persona: string;
  /** Personas that inherit from this one, by id. Any heir refuses the deletion. */
  heirs: string[];
  /** History that names the persona and stays. */
  kept: { conversations: number; memories: number; runtime_sessions: number };
  /** The persona's machinery, deleted with its row. */
  deleted: { descriptors: number; identity_integrations: number; extension_bindings: number };
  /** Live choices that name it, cleared. */
  cleared: { journey_defaults: string[]; sticky_default: boolean };
  /** SHA-256 over everything above and the persona's row. The deletion refuses any other. */
  digest: string;
}

export interface PersonaDeletionBackup {
  path: string;
  sha256: string;
  sizeBytes: number;
}

export interface PersonaDeletionReceipt {
  /** The preview the deletion acted on: the one the person confirmed. */
  deleted: PersonaDeletionPreview;
  backup: PersonaDeletionBackup;
}

/**
 * The closed inventory, read by `personaLifecycle.test.ts` against the schema:
 * a core column that can hold a persona's id (`persona`, a `layer`, a
 * `target_kind`) without a decision here fails that test.
 */
export const PERSONA_DELETION_INVENTORY = {
  kept: [
    "conversations.persona",
    "memories.persona",
    "runtime_sessions.persona (the global sticky default is cleared instead)",
  ],
  deleted: [
    "identity.layer (the persona's row)",
    "identity_descriptors.layer",
    "identity_integrations.layer",
    "_ext_bindings.target_kind",
  ],
  cleared: ["identity.layer (default_persona in a Journey's metadata)"],
  notPersonas: ["memories.layer (ego, self, shadow: a memory's layer, never a persona's id)"],
} as const;

function reject(
  reason: ConstructorParameters<typeof PersonaCallRejectedError>[0],
  personas?: string[],
): never {
  throw new PersonaCallRejectedError(reason, personas);
}

function number(db: Database, sql: string, ...params: string[]): number {
  const value = db.prepare(sql).get(...params)?.n;
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  throw new Error("persona deletion count did not return a number");
}

function keys(db: Database, sql: string, persona: string): string[] {
  return db
    .prepare(sql)
    .all(persona)
    .map((row) => String(row.key));
}

const JSON_FIELD = (field: string) =>
  `CASE WHEN json_valid(metadata) THEN json_extract(metadata, '$.${field}') END`;

/** Read everything the deletion would change. Shared by the preview, the act and the backup check. */
function readPreview(db: Database, persona: string): PersonaDeletionPreview {
  const row = personaRow(db, persona);
  if (!row) reject("unknown_persona");
  const p = persona;
  const heirs = keys(
    db,
    `SELECT key FROM identity WHERE layer = 'persona' AND ${JSON_FIELD("inherits_from")} = ? ORDER BY key`,
    p,
  );
  const kept = {
    conversations: number(db, "SELECT COUNT(*) AS n FROM conversations WHERE persona = ?", p),
    memories: number(db, "SELECT COUNT(*) AS n FROM memories WHERE persona = ?", p),
    runtime_sessions: number(
      db,
      "SELECT COUNT(*) AS n FROM runtime_sessions WHERE persona = ? AND session_id <> ?",
      p,
      GLOBAL_STICKY_DEFAULTS_SESSION_ID,
    ),
  };
  const deleted = {
    descriptors: number(
      db,
      "SELECT COUNT(*) AS n FROM identity_descriptors WHERE layer = 'persona' AND key = ?",
      p,
    ),
    identity_integrations: number(
      db,
      "SELECT COUNT(*) AS n FROM identity_integrations WHERE layer = 'persona' AND key = ?",
      p,
    ),
    extension_bindings: number(
      db,
      "SELECT COUNT(*) AS n FROM _ext_bindings WHERE target_kind = 'persona' AND target_id = ?",
      p,
    ),
  };
  const cleared = {
    journey_defaults: keys(
      db,
      `SELECT key FROM identity WHERE layer = 'journey' AND ${JSON_FIELD("default_persona")} = ? ORDER BY key`,
      p,
    ),
    sticky_default:
      number(
        db,
        "SELECT COUNT(*) AS n FROM runtime_sessions WHERE session_id = ? AND persona = ?",
        GLOBAL_STICKY_DEFAULTS_SESSION_ID,
        p,
      ) > 0,
  };
  const body = { persona, updatedAt: row.updated_at, heirs, kept, deleted, cleared };
  const digest = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  return { persona, heirs, kept, deleted, cleared, digest };
}

function requireCurrent(dbPath: string): void {
  const report = inspectMigrationState(dbPath);
  if (report.state !== "current") throw new DatabaseNotCurrentError(report);
}

/** What deleting `persona` would change, without changing anything. */
export function previewPersonaDeletion(
  dbPath: string,
  request: { persona: string },
): PersonaDeletionPreview {
  const persona = text(request?.persona);
  requireCurrent(dbPath);
  const db = openDatabaseReadOnly(dbPath);
  try {
    return readPreview(db, persona);
  } finally {
    db.close();
  }
}

function stamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function removeBackup(path: string): void {
  for (const file of [path, `${path}-wal`, `${path}-shm`]) rmSync(file, { force: true });
}

/**
 * Take the named backup and verify that it reads as `expected`, as the Journey
 * deletion's does (`verifiedJourneyDeletionBackup`). Exported so the check has a test.
 */
export function verifiedPersonaDeletionBackup(
  dbPath: string,
  expected: PersonaDeletionPreview,
): PersonaDeletionBackup {
  const dir = join(dirname(dbPath), "backups");
  const path = join(
    dir,
    `pre-persona-deletion-${expected.persona}-${stamp(new Date())}-${randomBytes(6).toString("hex")}.db`,
  );
  const fail = (): never => {
    removeBackup(path);
    return reject("backup_failed");
  };
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    snapshotDatabaseTo(dbPath, path);
    chmodSync(path, 0o600);
  } catch {
    return fail();
  }
  if (!prepareArchiveSnapshot(path).ok) return fail();
  let image: PersonaDeletionPreview | undefined;
  const db = openDatabaseReadOnly(path);
  try {
    image = readPreview(db, expected.persona);
  } catch {
    image = undefined;
  } finally {
    db.close();
  }
  rmSync(`${path}-wal`, { force: true });
  rmSync(`${path}-shm`, { force: true });
  if (image?.digest !== expected.digest) return fail();
  return {
    path,
    sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
    sizeBytes: statSync(path).size,
  };
}

/** Machinery goes, live choices are cleared, history stays. The caller holds the transaction. */
function deleteRecords(db: WritableDatabase, preview: PersonaDeletionPreview): void {
  const p = preview.persona;
  const run = (sql: string, ...params: string[]) => db.prepare(sql).run(...params);
  run("DELETE FROM identity_descriptors WHERE layer = 'persona' AND key = ?", p);
  run("DELETE FROM identity_integrations WHERE layer = 'persona' AND key = ?", p);
  run("DELETE FROM _ext_bindings WHERE target_kind = 'persona' AND target_id = ?", p);
  const now = nowIso();
  for (const journey of preview.cleared.journey_defaults) {
    run(
      "UPDATE identity SET metadata = json_remove(metadata, '$.default_persona'), updated_at = ? WHERE layer = 'journey' AND key = ?",
      now,
      journey,
    );
  }
  run(
    "UPDATE runtime_sessions SET persona = NULL, updated_at = ? WHERE session_id = ? AND persona = ?",
    now,
    GLOBAL_STICKY_DEFAULTS_SESSION_ID,
    p,
  );
  run("DELETE FROM identity WHERE layer = 'persona' AND key = ?", p);
}

/** Delete `persona`, as `previewPersonaDeletion` showed it, behind a named backup. */
export function deletePersona(
  dbPath: string,
  request: { persona: string; expectedDigest: string },
): PersonaDeletionReceipt {
  const persona = text(request?.persona);
  const expectedDigest = text(request?.expectedDigest);
  requireCurrent(dbPath);
  const db = openLiveWriteDatabase(dbPath);
  let backup: PersonaDeletionBackup | undefined;
  let committed = false;
  try {
    const deleted = withTransaction(db, () => {
      const preview = readPreview(db, persona);
      if (preview.digest !== expectedDigest) reject("persona_changed");
      if (preview.heirs.length > 0) reject("persona_has_heirs", preview.heirs);
      backup = verifiedPersonaDeletionBackup(dbPath, preview);
      deleteRecords(db, preview);
      return preview;
    });
    committed = true;
    if (!backup) throw new Error("persona deletion committed without a backup");
    return { deleted, backup };
  } catch (error) {
    // Nothing was deleted: a backup of an unchanged home is only a large file. Once the
    // deletion has committed, the backup is the only way back, whatever fails after it.
    if (backup && !committed) removeBackup(backup.path);
    throw error;
  } finally {
    db.close();
  }
}
