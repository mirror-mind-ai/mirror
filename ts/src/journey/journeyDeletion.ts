// Delete a Journey with its records — for a host that shows what will go first.
//
// `deleteJourney` (CV24.DS8) takes only an empty leaf: `removeJourney` refuses a
// Journey with any associated record, so a Journey no longer needed has to be
// emptied by hand. Mirror Desktop's RS028 asked for one act instead, and its
// Navigator decided what each record does (2026-11-05/06). Those decisions are
// the four rules below, and the principle under them is transparency rather than
// refusal: the host shows everything that will change, and the act refuses only
// what it cannot do safely.
//
//   1. A record that is the Journey's own is deleted: its row, its journey path,
//      a `journey:<id>` scene orientation, its identity integrations,
//      conversations, memories, tasks, attachments, runtime sessions, explorer
//      and refinement stories, change requests and refinement cursor.
//   2. What belongs to a deleted conversation or memory goes with it: messages,
//      summary embeddings, provider calls and memory access log entries.
//      Discarding ONE conversation keeps its provider calls
//      (`conversationDeletion.ts`: "a provider call still happened"); deleting a
//      Journey takes them, because their prompts are the Journey's own words and
//      the person asked for the Journey to be gone.
//   3. Another Journey's record that only points at something deleted is kept,
//      its link cleared. Memories are filed under the Journey they are about, not
//      the conversation they came from: in one long-lived home, 956 memories
//      came from a conversation of a different Journey. Deleting them with the
//      conversation would delete other Journeys' history.
//   4. An extension row that names the Journey -- in a column called exactly
//      `journey_id` or `journey` of an `ext_*` table -- is deleted, and the
//      preview names the extension that owns the table. The core does not know
//      what the row means; it does not need to, because the person sees it named
//      before confirming. A table without such a column is never searched.
//
// One friction is kept: a Journey with child Journeys is refused, naming them,
// so the act never cascades silently through the tree.
//
// Two calls. `previewJourneyDeletion` reads, and answers every count with a
// digest. `deleteJourneyWithRecords` takes that digest back and refuses with
// `journey_changed` when the home no longer matches it, so the act deletes what
// the person was shown and nothing else. Under one immediate transaction it
// re-reads the preview, takes a backup with a name never reused
// (`backups/pre-journey-deletion-<id>-<UTC stamp>-<random>.db`, 0600) and
// verifies that the backup reads as the same preview, and only then deletes.
// The front door's fixed-name pre-write snapshot is replaced by the next write,
// a turn's append included, so it cannot be the undo for a deletion. The core
// never deletes the named backup.

import { createHash, randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { deleteConversation } from "#conversation/conversationDeletion.ts";
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
import { JourneyCallRejectedError, type JourneyCallResult } from "#journey/journeyCalls.ts";
import { buildJourneyTree, type JourneyTree, type JourneyTreeRow } from "#journey/journeyTree.ts";

/** Rule 1: the Journey's own records, deleted with it. */
export interface JourneyOwnRecords {
  journey_paths: number;
  scene_orientations: number;
  identity_integrations: number;
  conversations: number;
  memories: number;
  tasks: number;
  attachments: number;
  runtime_sessions: number;
  explorer_stories: number;
  refinement_stories: number;
  change_requests: number;
  refinement_cursors: number;
}

/** Rule 2: what belongs to the deleted conversations and memories, deleted with them. */
export interface JourneyOwnedContents {
  messages: number;
  conversation_embeddings: number;
  llm_calls: number;
  memory_access_log: number;
}

/** Rule 3: other Journeys' rows that point at a deleted row, kept with the link cleared. */
export interface JourneyDetachedRecords {
  memories: number;
  runtime_sessions: number;
  identity_integrations: number;
  change_requests: number;
  refinement_cursors: number;
}

/** Rule 4: one extension table's rows that name the Journey. */
export interface JourneyExtensionRows {
  /** The installed extension whose `ext_<id>_` prefix the table carries, or null when none does. */
  extension: string | null;
  table: string;
  rows: number;
}

export interface JourneyDeletionPreview {
  journeyId: string;
  /** Child Journeys, by key. Any child refuses the deletion. */
  children: string[];
  records: JourneyOwnRecords;
  contents: JourneyOwnedContents;
  detached: JourneyDetachedRecords;
  /** Only tables with at least one row naming the Journey, ordered by table. */
  extensions: JourneyExtensionRows[];
  /** SHA-256 over everything above and the Journey's row. The deletion refuses any other. */
  digest: string;
}

export interface JourneyDeletionBackup {
  path: string;
  sha256: string;
  sizeBytes: number;
}

export interface JourneyDeletionReceipt extends JourneyCallResult {
  /** The preview the deletion acted on: the one the person confirmed. */
  deleted: JourneyDeletionPreview;
  backup: JourneyDeletionBackup;
}

/**
 * The closed inventory, read by `journeyDeletion.test.ts` against the schema:
 * a core table that names a Journey, or that references a row the deletion
 * removes, without a decision here fails that test.
 */
export const JOURNEY_DELETION_INVENTORY = {
  /** Core tables that name a Journey, and how. */
  journeyColumns: {
    identity: "key, in the journey and journey_path layers; journey:<id> in scene_orientation",
    identity_integrations: "key, in the journey layer",
    conversations: "journey",
    memories: "journey",
    tasks: "journey",
    attachments: "journey_id",
    runtime_sessions: "journey",
    exploratory_stories: "journey",
    builder_refinement_stories: "journey",
    builder_change_requests: "journey",
    builder_refinement_cursors: "journey",
  },
  /**
   * Core tables that name a Journey and are deliberately left alone:
   * `journey_mutation_receipts` is the administration's audit of what was done
   * to the tree, a deletion included.
   */
  kept: ["journey_mutation_receipts"],
  /** Tables whose rows the deletion removes, so references into them need a decision. */
  deletedTables: [
    "conversations",
    "memories",
    "builder_refinement_stories",
    "builder_change_requests",
    "identity",
    "identity_integrations",
  ],
  references: {
    /** Deleted with the row they reference (rule 2). */
    deleted: [
      "messages.conversation_id",
      "conversation_embeddings.conversation_id",
      "llm_calls.conversation_id",
      "memory_access_log.memory_id",
    ],
    /** Kept, the reference cleared, when the row is another Journey's (rule 3). */
    unlinked: [
      "memories.conversation_id",
      "runtime_sessions.conversation_id",
      "identity_integrations.conversation_id",
      "identity_integrations.journal_id",
      "builder_change_requests.refinement_story_id",
      "builder_refinement_cursors.active_refinement_story_id",
      "builder_refinement_cursors.active_change_request_id",
    ],
  },
} as const;

const EXTENSION_JOURNEY_COLUMNS = ["journey_id", "journey"] as const;

function reject(
  reason: ConstructorParameters<typeof JourneyCallRejectedError>[0],
  populated?: string[],
): never {
  throw new JourneyCallRejectedError(reason, populated);
}

function text(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) reject("invalid_request");
  return value;
}

function number(db: Database, sql: string, ...params: string[]): number {
  const value = db.prepare(sql).get(...params)?.n;
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  throw new Error("journey deletion count did not return a number");
}

function ids(db: Database, sql: string, journeyId: string): string[] {
  return db
    .prepare(sql)
    .all(journeyId)
    .map((row) => String(row.id));
}

/** The keys of the rows rule 2 and rule 3 follow from, as JSON arrays for `json_each`. */
interface DeletedKeys {
  conversations: string;
  memories: string;
  stories: string;
  changeRequests: string;
}

function deletedKeys(db: Database, journeyId: string): DeletedKeys {
  return {
    conversations: JSON.stringify(
      ids(db, "SELECT id FROM conversations WHERE journey = ?", journeyId),
    ),
    memories: JSON.stringify(ids(db, "SELECT id FROM memories WHERE journey = ?", journeyId)),
    stories: JSON.stringify(
      ids(db, "SELECT id FROM builder_refinement_stories WHERE journey = ?", journeyId),
    ),
    changeRequests: JSON.stringify(
      ids(db, "SELECT id FROM builder_change_requests WHERE journey = ?", journeyId),
    ),
  };
}

const IN = (param: string) => `IN (SELECT value FROM json_each(${param}))`;

/** `ext_*` tables with a Journey column, each with its owning extension when one is installed. */
function extensionTables(
  db: Database,
): { table: string; columns: string[]; extension: string | null }[] {
  const installed = db
    .prepare("SELECT DISTINCT extension_id AS id FROM _ext_migrations")
    .all()
    .map((row) => String(row.id));
  const owners = installed
    .map((id) => ({ id, prefix: `ext_${id.replaceAll("-", "_")}_` }))
    .sort((a, b) => b.prefix.length - a.prefix.length);
  return db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'ext\\_%' ESCAPE '\\' ORDER BY name",
    )
    .all()
    .map((row) => String(row.name))
    .map((table) => {
      const present = new Set(
        db
          .prepare(`PRAGMA table_info("${table.replaceAll('"', '""')}")`)
          .all()
          .map((row) => String(row.name)),
      );
      return {
        table,
        columns: EXTENSION_JOURNEY_COLUMNS.filter((column) => present.has(column)),
        extension: owners.find((owner) => table.startsWith(owner.prefix))?.id ?? null,
      };
    })
    .filter((entry) => entry.columns.length > 0);
}

function extensionWhere(columns: readonly string[]): string {
  return columns.map((column) => `"${column}" = ?`).join(" OR ");
}

function journeyRow(db: Database, journeyId: string): { updatedAt: string } | undefined {
  const row = db
    .prepare("SELECT updated_at FROM identity WHERE layer = 'journey' AND key = ?")
    .get(journeyId);
  return row === undefined ? undefined : { updatedAt: String(row.updated_at) };
}

/** Read everything the deletion would change. Shared by the preview, the act and the backup check. */
function readPreview(db: Database, journeyId: string): JourneyDeletionPreview {
  const row = journeyRow(db, journeyId);
  if (!row) reject("unknown_journey");
  const keys = deletedKeys(db, journeyId);
  const j = journeyId;
  const children = db
    .prepare(
      `SELECT key FROM identity
       WHERE layer = 'journey'
         AND CASE WHEN json_valid(metadata) THEN json_extract(metadata, '$.parent_journey') END = ?
       ORDER BY key`,
    )
    .all(j)
    .map((child) => String(child.key));
  const records: JourneyOwnRecords = {
    journey_paths: number(
      db,
      "SELECT COUNT(*) AS n FROM identity WHERE layer = 'journey_path' AND key = ?",
      j,
    ),
    scene_orientations: number(
      db,
      "SELECT COUNT(*) AS n FROM identity WHERE layer = 'scene_orientation' AND key = 'journey:' || ?",
      j,
    ),
    identity_integrations: number(
      db,
      "SELECT COUNT(*) AS n FROM identity_integrations WHERE layer = 'journey' AND key = ?",
      j,
    ),
    conversations: number(db, "SELECT COUNT(*) AS n FROM conversations WHERE journey = ?", j),
    memories: number(db, "SELECT COUNT(*) AS n FROM memories WHERE journey = ?", j),
    tasks: number(db, "SELECT COUNT(*) AS n FROM tasks WHERE journey = ?", j),
    attachments: number(db, "SELECT COUNT(*) AS n FROM attachments WHERE journey_id = ?", j),
    runtime_sessions: number(db, "SELECT COUNT(*) AS n FROM runtime_sessions WHERE journey = ?", j),
    explorer_stories: number(
      db,
      "SELECT COUNT(*) AS n FROM exploratory_stories WHERE journey = ?",
      j,
    ),
    refinement_stories: number(
      db,
      "SELECT COUNT(*) AS n FROM builder_refinement_stories WHERE journey = ?",
      j,
    ),
    change_requests: number(
      db,
      "SELECT COUNT(*) AS n FROM builder_change_requests WHERE journey = ?",
      j,
    ),
    refinement_cursors: number(
      db,
      "SELECT COUNT(*) AS n FROM builder_refinement_cursors WHERE journey = ?",
      j,
    ),
  };
  const contents: JourneyOwnedContents = {
    messages: number(
      db,
      `SELECT COUNT(*) AS n FROM messages WHERE conversation_id ${IN("?")}`,
      keys.conversations,
    ),
    conversation_embeddings: number(
      db,
      `SELECT COUNT(*) AS n FROM conversation_embeddings WHERE conversation_id ${IN("?")}`,
      keys.conversations,
    ),
    llm_calls: number(
      db,
      `SELECT COUNT(*) AS n FROM llm_calls WHERE conversation_id ${IN("?")}`,
      keys.conversations,
    ),
    memory_access_log: number(
      db,
      `SELECT COUNT(*) AS n FROM memory_access_log WHERE memory_id ${IN("?")}`,
      keys.memories,
    ),
  };
  const detached: JourneyDetachedRecords = {
    memories: number(
      db,
      `SELECT COUNT(*) AS n FROM memories WHERE conversation_id ${IN("?")} AND journey IS NOT ?`,
      keys.conversations,
      j,
    ),
    runtime_sessions: number(
      db,
      `SELECT COUNT(*) AS n FROM runtime_sessions WHERE conversation_id ${IN("?")} AND journey IS NOT ?`,
      keys.conversations,
      j,
    ),
    identity_integrations: number(
      db,
      `SELECT COUNT(*) AS n FROM identity_integrations
       WHERE (conversation_id ${IN("?")} OR journal_id ${IN("?")})
         AND NOT (layer = 'journey' AND key = ?)`,
      keys.conversations,
      keys.memories,
      j,
    ),
    change_requests: number(
      db,
      `SELECT COUNT(*) AS n FROM builder_change_requests WHERE refinement_story_id ${IN("?")} AND journey IS NOT ?`,
      keys.stories,
      j,
    ),
    refinement_cursors: number(
      db,
      `SELECT COUNT(*) AS n FROM builder_refinement_cursors
       WHERE (active_refinement_story_id ${IN("?")} OR active_change_request_id ${IN("?")})
         AND journey IS NOT ?`,
      keys.stories,
      keys.changeRequests,
      j,
    ),
  };
  const extensions = extensionTables(db)
    .map(({ table, columns, extension }) => ({
      extension,
      table,
      rows: number(
        db,
        `SELECT COUNT(*) AS n FROM "${table}" WHERE ${extensionWhere(columns)}`,
        ...columns.map(() => j),
      ),
    }))
    .filter((entry) => entry.rows > 0);
  const body = {
    journeyId,
    updatedAt: row.updatedAt,
    children,
    records,
    contents,
    detached,
    extensions,
  };
  const digest = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  return { journeyId, children, records, contents, detached, extensions, digest };
}

function readTree(db: Database): JourneyTree {
  return buildJourneyTree(
    db
      .prepare(
        "SELECT key, content, updated_at, metadata FROM identity WHERE layer = 'journey' ORDER BY key",
      )
      .all() as unknown as JourneyTreeRow[],
  );
}

function requireCurrent(dbPath: string): void {
  const report = inspectMigrationState(dbPath);
  if (report.state !== "current") throw new DatabaseNotCurrentError(report);
}

/** What deleting `journeyId` would change, without changing anything. */
export function previewJourneyDeletion(
  dbPath: string,
  request: { journeyId: string },
): JourneyDeletionPreview {
  const journeyId = text(request?.journeyId);
  requireCurrent(dbPath);
  const db = openDatabaseReadOnly(dbPath);
  try {
    return readPreview(db, journeyId);
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
 * Take the named backup and verify that it reads as `expected`: the home the
 * person was shown. Runs while the caller holds the write lock and has written
 * nothing, so the snapshot is the state the deletion is about to change; only a
 * defective snapshot can read differently. Exported so that check has a test.
 */
export function verifiedJourneyDeletionBackup(
  dbPath: string,
  expected: JourneyDeletionPreview,
): JourneyDeletionBackup {
  const dir = join(dirname(dbPath), "backups");
  const path = join(
    dir,
    `pre-journey-deletion-${expected.journeyId}-${stamp(new Date())}-${randomBytes(6).toString("hex")}.db`,
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
  let image: JourneyDeletionPreview | undefined;
  const db = openDatabaseReadOnly(path);
  try {
    image = readPreview(db, expected.journeyId);
  } catch {
    image = undefined;
  } finally {
    db.close();
  }
  // The read-only open leaves empty sidecars beside a WAL file; this file is
  // private to this call, so they are removed to leave one file.
  rmSync(`${path}-wal`, { force: true });
  rmSync(`${path}-shm`, { force: true });
  if (image?.digest !== expected.digest) return fail();
  return {
    path,
    sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
    sizeBytes: statSync(path).size,
  };
}

/** Rules 1 to 4, in an order every foreign key accepts. The caller holds the transaction. */
function deleteRecords(db: WritableDatabase, preview: JourneyDeletionPreview): void {
  const j = preview.journeyId;
  const keys = deletedKeys(db, j);
  const run = (sql: string, ...params: string[]) => db.prepare(sql).run(...params);

  // Rule 2 before rule 1, for what the rows to delete still hold.
  run(`DELETE FROM llm_calls WHERE conversation_id ${IN("?")}`, keys.conversations);
  run(`DELETE FROM memory_access_log WHERE memory_id ${IN("?")}`, keys.memories);
  run("DELETE FROM identity_integrations WHERE layer = 'journey' AND key = ?", j);
  // Rule 3: an integration of another Journey keeps its place in the identity.
  run(
    `UPDATE identity_integrations SET journal_id = NULL WHERE journal_id ${IN("?")}`,
    keys.memories,
  );
  run("DELETE FROM runtime_sessions WHERE journey = ?", j);
  run("DELETE FROM memories WHERE journey = ?", j);
  // Messages and embeddings go; what still points at the conversation is another Journey's, unlinked.
  for (const conversationId of JSON.parse(keys.conversations) as string[]) {
    deleteConversation(db, conversationId);
  }

  run("DELETE FROM builder_refinement_cursors WHERE journey = ?", j);
  run(
    `UPDATE builder_refinement_cursors SET active_refinement_story_id = NULL WHERE active_refinement_story_id ${IN("?")}`,
    keys.stories,
  );
  run(
    `UPDATE builder_refinement_cursors SET active_change_request_id = NULL WHERE active_change_request_id ${IN("?")}`,
    keys.changeRequests,
  );
  run("DELETE FROM builder_change_requests WHERE journey = ?", j);
  run(
    `UPDATE builder_change_requests SET refinement_story_id = NULL WHERE refinement_story_id ${IN("?")}`,
    keys.stories,
  );
  run("DELETE FROM builder_refinement_stories WHERE journey = ?", j);
  run("DELETE FROM exploratory_stories WHERE journey = ?", j);
  run("DELETE FROM tasks WHERE journey = ?", j);
  run("DELETE FROM attachments WHERE journey_id = ?", j);

  run("DELETE FROM identity WHERE layer = 'journey_path' AND key = ?", j);
  run("DELETE FROM identity WHERE layer = 'scene_orientation' AND key = 'journey:' || ?", j);
  run("DELETE FROM identity WHERE layer = 'journey' AND key = ?", j);

  // Rule 4. A row another row still holds is the extension's to release, not the core's.
  for (const { table, columns } of extensionTables(db)) {
    try {
      run(`DELETE FROM "${table}" WHERE ${extensionWhere(columns)}`, ...columns.map(() => j));
    } catch (error) {
      if (error instanceof Error && /FOREIGN KEY constraint failed/.test(error.message)) {
        reject("extension_rows_held", [table]);
      }
      throw error;
    }
  }
}

/** Delete `journeyId` and its records, as `previewJourneyDeletion` showed them, behind a named backup. */
export function deleteJourneyWithRecords(
  dbPath: string,
  request: { journeyId: string; expectedDigest: string },
): JourneyDeletionReceipt {
  const journeyId = text(request?.journeyId);
  const expectedDigest = text(request?.expectedDigest);
  requireCurrent(dbPath);
  const db = openLiveWriteDatabase(dbPath);
  let backup: JourneyDeletionBackup | undefined;
  let committed = false;
  try {
    const deleted = withTransaction(db, () => {
      const preview = readPreview(db, journeyId);
      if (preview.digest !== expectedDigest) reject("journey_changed");
      if (preview.children.length > 0) reject("journey_has_children", preview.children);
      backup = verifiedJourneyDeletionBackup(dbPath, preview);
      deleteRecords(db, preview);
      return preview;
    });
    committed = true;
    if (!backup) throw new Error("journey deletion committed without a backup");
    return { journeyId, tree: readTree(db), deleted, backup };
  } catch (error) {
    // Nothing was deleted: a backup of an unchanged home is only a large file. Once the
    // deletion has committed, the backup is the only way back, whatever fails after it.
    if (backup && !committed) removeBackup(backup.path);
    throw error;
  } finally {
    db.close();
  }
}
