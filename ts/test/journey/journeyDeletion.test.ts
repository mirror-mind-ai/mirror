// Delete a Journey with its records, for a host that shows what will go first.
//
// Mirror Desktop's RS028 asked for it: `deleteJourney` takes only an empty leaf,
// so a Journey no longer needed had to be emptied by hand. The Navigator decided
// what each record does (2026-11-05/06), and these tests hold the four rules:
//
//   1. a record that is the Journey's own is deleted;
//   2. what belongs to a deleted conversation or memory goes with it;
//   3. another Journey's record that only points at something deleted is kept,
//      its link cleared;
//   4. an extension row that names the Journey in a `journey_id` or `journey`
//      column is deleted, and the preview names the extension that owns it.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { DatabaseNotCurrentError } from "#conversation/hostCalls.ts";
import { readJourneyTree } from "#conversation/hostReads.ts";
import { regressTo016 } from "#helpers/legacyDb.ts";
import { tempDir } from "#helpers/tempDir.ts";
import { createHome } from "#init/createHome.ts";
import {
  addJourney,
  JourneyCallRejectedError,
  type JourneyCallRejection,
} from "#journey/journeyCalls.ts";
import {
  deleteJourneyWithRecords,
  JOURNEY_DELETION_INVENTORY,
  previewJourneyDeletion,
  verifiedJourneyDeletionBackup,
} from "#journey/journeyDeletion.ts";
import type { JourneyTreeNode } from "#journey/journeyTree.ts";

const NOW = "2026-11-06T12:00:00.000000Z";
const DESCRIPTION = "A place for the work this test needs.";

function home(): string {
  const homePath = join(tempDir("mirror-journey-deletion-"), "ana-souza");
  createHome({ homePath, userName: "ana-souza" });
  return join(homePath, "memory.db");
}

function add(dbPath: string, slug: string, parentId: string | null = null): void {
  addJourney(dbPath, { slug, name: slug, description: DESCRIPTION, parentId });
}

/** A raw connection with foreign keys on, as the core's own connections run. */
function raw(dbPath: string): DatabaseSync {
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

function scalar(dbPath: string, sql: string, ...params: (string | null)[]): unknown {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const row = db.prepare(sql).get(...params) as Record<string, unknown> | undefined;
    return row === undefined ? undefined : Object.values(row)[0];
  } finally {
    db.close();
  }
}

function count(dbPath: string, sql: string, ...params: (string | null)[]): number {
  return Number(scalar(dbPath, sql, ...params));
}

/**
 * `doomed` holds one of every record kind; `keeper` holds records that point
 * into `doomed`'s, which must survive with their links cleared.
 */
function seed(dbPath: string): void {
  add(dbPath, "doomed");
  add(dbPath, "keeper");
  const db = raw(dbPath);
  try {
    const run = (sql: string, ...params: (string | number | null)[]) =>
      db.prepare(sql).run(...params);
    // Rule 1: the Journey's own records.
    run(
      "INSERT INTO conversations (id, started_at, interface, journey) VALUES ('c-d', ?, 'test', 'doomed')",
      NOW,
    );
    run(
      "INSERT INTO conversations (id, started_at, interface, journey) VALUES ('c-k', ?, 'test', 'keeper')",
      NOW,
    );
    run(
      "INSERT INTO memories (id, memory_type, title, content, journey, conversation_id, created_at) VALUES ('m-d', 'note', 'Doomed', 'x', 'doomed', 'c-d', ?)",
      NOW,
    );
    run(
      "INSERT INTO tasks (id, journey, title, created_at, updated_at) VALUES ('t-d', 'doomed', 'x', ?, ?)",
      NOW,
      NOW,
    );
    run(
      "INSERT INTO attachments (id, journey_id, name, content, created_at, updated_at) VALUES ('a-d', 'doomed', 'x.md', 'x', ?, ?)",
      NOW,
      NOW,
    );
    run(
      "INSERT INTO runtime_sessions (session_id, conversation_id, journey, started_at, updated_at) VALUES ('s-d', 'c-d', 'doomed', ?, ?)",
      NOW,
      NOW,
    );
    run(
      "INSERT INTO exploratory_stories (id, journey, created_at, updated_at) VALUES ('e-d', 'doomed', ?, ?)",
      NOW,
      NOW,
    );
    run(
      "INSERT INTO builder_refinement_stories (id, journey, display_code, title, created_at, updated_at) VALUES ('rs-d', 'doomed', 'RS001', 'x', ?, ?)",
      NOW,
      NOW,
    );
    run(
      "INSERT INTO builder_change_requests (id, journey, display_code, title, body, refinement_story_id, created_at, updated_at) VALUES ('cr-d', 'doomed', 'CR001', 'x', 'x', 'rs-d', ?, ?)",
      NOW,
      NOW,
    );
    run(
      "INSERT INTO builder_refinement_cursors (journey, active_refinement_story_id, updated_at) VALUES ('doomed', 'rs-d', ?)",
      NOW,
    );
    run(
      "INSERT INTO identity (id, layer, key, content, created_at, updated_at) VALUES ('jp-d', 'journey_path', 'doomed', '# Path', ?, ?)",
      NOW,
      NOW,
    );
    run(
      "INSERT INTO identity (id, layer, key, content, created_at, updated_at) VALUES ('so-d', 'scene_orientation', 'journey:doomed', '# Scene', ?, ?)",
      NOW,
      NOW,
    );
    run(
      "INSERT INTO identity_integrations (id, layer, key, content, source, created_at) VALUES ('ii-d', 'journey', 'doomed', 'x', 'soul_mode', ?)",
      NOW,
    );
    // Rule 2: what belongs to the deleted conversation and memory.
    run(
      "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES ('msg-1', 'c-d', 'user', 'x', ?)",
      NOW,
    );
    run(
      "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES ('msg-2', 'c-d', 'assistant', 'x', ?)",
      NOW,
    );
    run(
      "INSERT INTO conversation_embeddings (conversation_id, summary_embedding) VALUES ('c-d', NULL)",
    );
    run(
      "INSERT INTO llm_calls (id, role, model, prompt, response, conversation_id, called_at) VALUES ('l-d', 'extraction', 'm', 'the Journey said this', 'x', 'c-d', ?)",
      NOW,
    );
    run("INSERT INTO memory_access_log (memory_id, accessed_at) VALUES ('m-d', ?)", NOW);
    // Rule 3: other Journeys' records that point into the deleted ones.
    run(
      "INSERT INTO memories (id, memory_type, title, content, journey, conversation_id, created_at) VALUES ('m-k', 'note', 'Keeper', 'x', 'keeper', 'c-d', ?)",
      NOW,
    );
    run(
      "INSERT INTO memories (id, memory_type, title, content, journey, conversation_id, created_at) VALUES ('m-none', 'note', 'No Journey', 'x', NULL, 'c-d', ?)",
      NOW,
    );
    run(
      "INSERT INTO runtime_sessions (session_id, conversation_id, journey, started_at, updated_at) VALUES ('s-k', 'c-d', 'keeper', ?, ?)",
      NOW,
      NOW,
    );
    run(
      "INSERT INTO identity_integrations (id, layer, key, content, source, conversation_id, journal_id, created_at) VALUES ('ii-k', 'persona', 'writer', 'x', 'soul_mode', 'c-d', 'm-d', ?)",
      NOW,
    );
    run(
      "INSERT INTO builder_change_requests (id, journey, display_code, title, body, refinement_story_id, created_at, updated_at) VALUES ('cr-k', 'keeper', 'CR002', 'x', 'x', 'rs-d', ?, ?)",
      NOW,
      NOW,
    );
    run(
      "INSERT INTO builder_refinement_cursors (journey, active_change_request_id, updated_at) VALUES ('keeper', 'cr-d', ?)",
      NOW,
    );
    // Rule 4: extension rows, owned by two installed extensions and one unknown.
    run("CREATE TABLE ext_maestro_overlays (id TEXT PRIMARY KEY, journey_id TEXT, value TEXT)");
    run("INSERT INTO ext_maestro_overlays VALUES ('o-d', 'doomed', 'x'), ('o-k', 'keeper', 'x')");
    run("CREATE TABLE ext_long_name_state (journey TEXT, value TEXT)");
    run("INSERT INTO ext_long_name_state VALUES ('doomed', 'x'), ('doomed', 'y')");
    run("CREATE TABLE ext_stray_rows (journey_id TEXT)");
    run("INSERT INTO ext_stray_rows VALUES ('doomed')");
    run("CREATE TABLE ext_maestro_settings (value TEXT)");
    run("INSERT INTO ext_maestro_settings VALUES ('doomed')");
    for (const extension of ["maestro", "long-name"]) {
      run(
        "INSERT INTO _ext_migrations (extension_id, filename, checksum, applied_at) VALUES (?, '001.sql', 'x', ?)",
        extension,
        NOW,
      );
    }
  } finally {
    db.close();
  }
}

function rejects(call: () => unknown, reason: JourneyCallRejection, populated?: string[]): void {
  assert.throws(call, (error: unknown) => {
    assert.ok(error instanceof JourneyCallRejectedError, String(error));
    assert.equal(error.reason, reason);
    if (populated) assert.deepEqual(error.populated, populated);
    return true;
  });
}

function backups(dbPath: string): string[] {
  const dir = join(dirname(dbPath), "backups");
  return existsSync(dir)
    ? readdirSync(dir).filter((name) => name.startsWith("pre-journey-deletion-"))
    : [];
}

function keys(nodes: readonly JourneyTreeNode[] | undefined): string[] {
  return (nodes ?? []).flatMap((node) => [node.id, ...keys(node.children)]);
}

/** Every row of every table, so a refusal can be shown to write nothing. */
function everything(dbPath: string): string {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'memories_fts%' ORDER BY name",
      )
      .all()
      .map((row) => String(row.name));
    return JSON.stringify(
      tables.map((table) => [table, db.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all()]),
      (_key, value) => (typeof value === "bigint" ? Number(value) : value),
    );
  } finally {
    db.close();
  }
}

test("the preview counts every record the deletion affects, by rule, and writes nothing", () => {
  const dbPath = home();
  seed(dbPath);
  const before = everything(dbPath);

  const preview = previewJourneyDeletion(dbPath, { journeyId: "doomed" });

  assert.equal(preview.journeyId, "doomed");
  assert.deepEqual(preview.children, []);
  assert.deepEqual(preview.records, {
    journey_paths: 1,
    scene_orientations: 1,
    identity_integrations: 1,
    conversations: 1,
    memories: 1,
    tasks: 1,
    attachments: 1,
    runtime_sessions: 1,
    explorer_stories: 1,
    refinement_stories: 1,
    change_requests: 1,
    refinement_cursors: 1,
  });
  assert.deepEqual(preview.contents, {
    messages: 2,
    conversation_embeddings: 1,
    llm_calls: 1,
    memory_access_log: 1,
  });
  assert.deepEqual(preview.detached, {
    memories: 2,
    runtime_sessions: 1,
    identity_integrations: 1,
    change_requests: 1,
    refinement_cursors: 1,
  });
  assert.deepEqual(preview.extensions, [
    { extension: "long-name", table: "ext_long_name_state", rows: 2 },
    { extension: "maestro", table: "ext_maestro_overlays", rows: 1 },
    { extension: null, table: "ext_stray_rows", rows: 1 },
  ]);
  assert.match(preview.digest, /^[0-9a-f]{64}$/);
  assert.equal(everything(dbPath), before);
});

test("the preview names the child Journeys, which the deletion will refuse", () => {
  const dbPath = home();
  add(dbPath, "parent");
  add(dbPath, "child-b", "parent");
  add(dbPath, "child-a", "parent");
  assert.deepEqual(previewJourneyDeletion(dbPath, { journeyId: "parent" }).children, [
    "child-a",
    "child-b",
  ]);
});

test("deleting removes the Journey and its records, keeps other Journeys' records unlinked, and leaves no dangling key", () => {
  const dbPath = home();
  seed(dbPath);
  const preview = previewJourneyDeletion(dbPath, { journeyId: "doomed" });

  const receipt = deleteJourneyWithRecords(dbPath, {
    journeyId: "doomed",
    expectedDigest: preview.digest,
  });

  assert.equal(receipt.journeyId, "doomed");
  assert.deepEqual(receipt.deleted, preview);
  assert.ok(!keys(receipt.tree.roots).includes("doomed"));
  assert.ok(keys(receipt.tree.roots).includes("keeper"));
  assert.deepEqual(readJourneyTree(dbPath), receipt.tree);

  // Rules 1 and 2: nothing of the Journey's own is left.
  for (const [sql, ...params] of [
    ["SELECT COUNT(*) FROM identity WHERE layer IN ('journey', 'journey_path') AND key = 'doomed'"],
    ["SELECT COUNT(*) FROM identity WHERE layer = 'scene_orientation' AND key = 'journey:doomed'"],
    ["SELECT COUNT(*) FROM identity_integrations WHERE id = 'ii-d'"],
    ["SELECT COUNT(*) FROM conversations WHERE journey = 'doomed'"],
    ["SELECT COUNT(*) FROM memories WHERE journey = 'doomed'"],
    ["SELECT COUNT(*) FROM tasks WHERE journey = 'doomed'"],
    ["SELECT COUNT(*) FROM attachments WHERE journey_id = 'doomed'"],
    ["SELECT COUNT(*) FROM runtime_sessions WHERE journey = 'doomed'"],
    ["SELECT COUNT(*) FROM exploratory_stories WHERE journey = 'doomed'"],
    ["SELECT COUNT(*) FROM builder_refinement_stories WHERE journey = 'doomed'"],
    ["SELECT COUNT(*) FROM builder_change_requests WHERE journey = 'doomed'"],
    ["SELECT COUNT(*) FROM builder_refinement_cursors WHERE journey = 'doomed'"],
    ["SELECT COUNT(*) FROM messages WHERE conversation_id = 'c-d'"],
    ["SELECT COUNT(*) FROM conversation_embeddings WHERE conversation_id = 'c-d'"],
    // Unlike discarding one conversation, deleting a Journey takes its provider calls: their
    // prompts are the Journey's own words.
    ["SELECT COUNT(*) FROM llm_calls WHERE id = 'l-d'"],
    ["SELECT COUNT(*) FROM memory_access_log WHERE memory_id = 'm-d'"],
  ] as [string][]) {
    assert.equal(count(dbPath, sql, ...params), 0, sql);
  }

  // Rule 3: other Journeys' records stay, each with only its link into the deleted ones cleared.
  assert.equal(scalar(dbPath, "SELECT journey FROM memories WHERE id = 'm-k'"), "keeper");
  assert.equal(scalar(dbPath, "SELECT conversation_id FROM memories WHERE id = 'm-k'"), null);
  assert.equal(scalar(dbPath, "SELECT conversation_id FROM memories WHERE id = 'm-none'"), null);
  assert.equal(
    scalar(dbPath, "SELECT conversation_id FROM runtime_sessions WHERE session_id = 's-k'"),
    null,
  );
  assert.equal(
    scalar(dbPath, "SELECT conversation_id FROM identity_integrations WHERE id = 'ii-k'"),
    null,
  );
  assert.equal(
    scalar(dbPath, "SELECT journal_id FROM identity_integrations WHERE id = 'ii-k'"),
    null,
  );
  assert.equal(
    scalar(dbPath, "SELECT refinement_story_id FROM builder_change_requests WHERE id = 'cr-k'"),
    null,
  );
  assert.equal(
    scalar(
      dbPath,
      "SELECT active_change_request_id FROM builder_refinement_cursors WHERE journey = 'keeper'",
    ),
    null,
  );
  assert.equal(count(dbPath, "SELECT COUNT(*) FROM conversations WHERE id = 'c-k'"), 1);

  // Rule 4: the extension rows that named the Journey are gone, and only those.
  assert.equal(
    count(dbPath, "SELECT COUNT(*) FROM ext_maestro_overlays WHERE journey_id = 'doomed'"),
    0,
  );
  assert.equal(
    count(dbPath, "SELECT COUNT(*) FROM ext_maestro_overlays WHERE journey_id = 'keeper'"),
    1,
  );
  assert.equal(count(dbPath, "SELECT COUNT(*) FROM ext_long_name_state"), 0);
  assert.equal(count(dbPath, "SELECT COUNT(*) FROM ext_stray_rows"), 0);
  // A table with no Journey column is not searched for the name.
  assert.equal(count(dbPath, "SELECT COUNT(*) FROM ext_maestro_settings"), 1);

  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});

test("the deletion is taken behind a retained backup that holds exactly what the preview showed", () => {
  const dbPath = home();
  seed(dbPath);
  const preview = previewJourneyDeletion(dbPath, { journeyId: "doomed" });

  const receipt = deleteJourneyWithRecords(dbPath, {
    journeyId: "doomed",
    expectedDigest: preview.digest,
  });

  // One file, and only one: this test's own reads below leave sidecars beside it.
  assert.deepEqual(backups(dbPath), [receipt.backup.path.split("/").pop()]);
  assert.equal(dirname(receipt.backup.path), join(dirname(dbPath), "backups"));
  assert.match(receipt.backup.path, /pre-journey-deletion-doomed-\d{8}T\d{6}Z-[0-9a-f]{12}\.db$/);
  assert.equal(statSync(receipt.backup.path).mode & 0o777, 0o600);
  assert.equal(
    receipt.backup.sha256,
    createHash("sha256").update(readFileSync(receipt.backup.path)).digest("hex"),
  );
  assert.equal(receipt.backup.sizeBytes, statSync(receipt.backup.path).size);
  // The backup reads as the home before the deletion: the same preview, digest included.
  assert.equal(
    count(
      receipt.backup.path,
      "SELECT COUNT(*) FROM identity WHERE layer = 'journey' AND key = 'doomed'",
    ),
    1,
  );
  assert.equal(
    count(receipt.backup.path, "SELECT COUNT(*) FROM messages WHERE conversation_id = 'c-d'"),
    2,
  );
});

test("a backup that does not read as the preview is refused and removed", () => {
  const dbPath = home();
  seed(dbPath);
  const preview = previewJourneyDeletion(dbPath, { journeyId: "doomed" });

  rejects(
    () => verifiedJourneyDeletionBackup(dbPath, { ...preview, digest: "0".repeat(64) }),
    "backup_failed",
  );
  assert.deepEqual(
    readdirSync(join(dirname(dbPath), "backups")).filter((name) =>
      name.includes("journey-deletion"),
    ),
    [],
  );

  const backup = verifiedJourneyDeletionBackup(dbPath, preview);
  assert.ok(existsSync(backup.path));
});

test("a deletion asked for with a preview that no longer holds is refused, and writes nothing", () => {
  const dbPath = home();
  seed(dbPath);
  const preview = previewJourneyDeletion(dbPath, { journeyId: "doomed" });
  const db = raw(dbPath);
  db.prepare(
    "INSERT INTO tasks (id, journey, title, created_at, updated_at) VALUES ('t-late', 'doomed', 'x', ?, ?)",
  ).run(NOW, NOW);
  db.close();
  const before = everything(dbPath);

  rejects(
    () => deleteJourneyWithRecords(dbPath, { journeyId: "doomed", expectedDigest: preview.digest }),
    "journey_changed",
  );

  assert.equal(everything(dbPath), before);
  assert.deepEqual(backups(dbPath), []);
});

test("a Journey with child Journeys is refused, naming them, and nothing is written", () => {
  const dbPath = home();
  add(dbPath, "parent");
  add(dbPath, "child", "parent");
  const preview = previewJourneyDeletion(dbPath, { journeyId: "parent" });
  const before = everything(dbPath);

  rejects(
    () => deleteJourneyWithRecords(dbPath, { journeyId: "parent", expectedDigest: preview.digest }),
    "journey_has_children",
    ["child"],
  );

  assert.equal(everything(dbPath), before);
  assert.deepEqual(backups(dbPath), []);
});

test("an extension row another row still holds refuses the whole deletion, naming its table", () => {
  const dbPath = home();
  seed(dbPath);
  const db = raw(dbPath);
  db.exec("CREATE TABLE ext_maestro_notes (overlay_id TEXT REFERENCES ext_maestro_overlays(id))");
  db.exec("INSERT INTO ext_maestro_notes VALUES ('o-d')");
  db.close();
  const preview = previewJourneyDeletion(dbPath, { journeyId: "doomed" });
  const before = everything(dbPath);

  rejects(
    () => deleteJourneyWithRecords(dbPath, { journeyId: "doomed", expectedDigest: preview.digest }),
    "extension_rows_held",
    ["ext_maestro_overlays"],
  );

  assert.equal(everything(dbPath), before);
  assert.deepEqual(backups(dbPath), []);
});

test("an unknown Journey and a malformed request are refused", () => {
  const dbPath = home();
  rejects(() => previewJourneyDeletion(dbPath, { journeyId: "missing" }), "unknown_journey");
  rejects(
    () =>
      deleteJourneyWithRecords(dbPath, { journeyId: "missing", expectedDigest: "0".repeat(64) }),
    "unknown_journey",
  );
  rejects(() => previewJourneyDeletion(dbPath, { journeyId: "" }), "invalid_request");
  rejects(
    () =>
      deleteJourneyWithRecords(dbPath, { journeyId: "personal-growth" } as unknown as {
        journeyId: string;
        expectedDigest: string;
      }),
    "invalid_request",
  );
  assert.deepEqual(backups(dbPath), []);
});

test("a database that is not current is refused by both calls", () => {
  const dbPath = home();
  regressTo016(dbPath);
  assert.throws(
    () => previewJourneyDeletion(dbPath, { journeyId: "personal-growth" }),
    DatabaseNotCurrentError,
  );
  assert.throws(
    () =>
      deleteJourneyWithRecords(dbPath, {
        journeyId: "personal-growth",
        expectedDigest: "0".repeat(64),
      }),
    DatabaseNotCurrentError,
  );
});

/**
 * The closed inventory, read from the schema: a table that names a Journey, or
 * that references a row the deletion removes, must have a decision. Before this
 * test a new table would have made every Journey undeletable (a foreign key) or
 * left rows naming a Journey that no longer exists (a plain column).
 */
test("every table that names a Journey or references a deleted row has a decision", () => {
  const dbPath = home();
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_%' ESCAPE '\\' AND name NOT LIKE 'ext\\_%' ESCAPE '\\' ORDER BY name",
      )
      .all()
      .map((row) => String(row.name));
    const decided = new Set([
      ...Object.keys(JOURNEY_DELETION_INVENTORY.journeyColumns),
      ...JOURNEY_DELETION_INVENTORY.kept,
    ]);
    const deletedTables: readonly string[] = JOURNEY_DELETION_INVENTORY.deletedTables;
    const deletedReferences: readonly string[] = JOURNEY_DELETION_INVENTORY.references.deleted;
    const unlinkedReferences: readonly string[] = JOURNEY_DELETION_INVENTORY.references.unlinked;
    for (const table of tables) {
      const columns = db
        .prepare(`PRAGMA table_info("${table}")`)
        .all()
        .map((row) => String(row.name));
      if (columns.some((column) => /journey/.test(column))) {
        assert.ok(decided.has(table), `${table} names a Journey and has no decision`);
      }
      for (const fk of db.prepare(`PRAGMA foreign_key_list("${table}")`).all()) {
        const target = String(fk.table);
        if (!deletedTables.includes(target)) continue;
        const reference = `${table}.${String(fk.from)}`;
        assert.ok(
          deletedReferences.includes(reference) || unlinkedReferences.includes(reference),
          `${reference} references ${target} and has no decision`,
        );
      }
    }
  } finally {
    db.close();
  }
});
