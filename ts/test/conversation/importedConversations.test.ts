// CR154 — the Pi conversations an earlier version imported rather than logged:
// how a home tells them apart, lists them by folder, and removes the ones a
// person names.
//
// An import is a Pi conversation that started at or after its own last
// message: the retired import stamped `started_at` when it copied a session and
// `ended_at` from the session's last message. A live conversation starts before
// it ends. A timestamp without a zone never makes a conversation an import --
// a person is never offered a live conversation for removal on a guess.

import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  countLiveSessionsByFolder,
  ImportRemovalSetMovedError,
  isImportShaped,
  listImportedPiConversations,
  planImportRemoval,
  removeImportedConversations,
  sessionFolder,
  summarizeImports,
  UNKNOWN_FOLDER,
} from "#conversation/importedConversations.ts";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import type { SqlValue, WritableDatabase } from "#db/database.ts";

const SESSIONS = "/home/p/.pi/agent/sessions";

function freshDb(): WritableDatabase {
  return bootstrapDatabase(join(mkdtempSync("/tmp/imported-conversations-"), "memory.db"));
}

function count(db: WritableDatabase, sql: string, ...params: SqlValue[]): number {
  return Number((db.prepare(sql).get(...params) as { n: number }).n);
}

interface Seed {
  id: string;
  startedAt: string;
  endedAt: string | null;
  /** The stored session path; null for no runtime-session row. */
  sessionPath?: string | null;
  messages?: number;
  iface?: string;
  title?: string;
}

function seed(db: WritableDatabase, row: Seed): void {
  const iface = row.iface ?? "pi";
  db.prepare(
    "INSERT INTO conversations (id, title, started_at, ended_at, interface) VALUES (?, ?, ?, ?, ?)",
  ).run(row.id, row.title ?? `Title ${row.id}`, row.startedAt, row.endedAt, iface);
  for (let index = 0; index < (row.messages ?? 2); index += 1) {
    db.prepare(
      "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, 'x', ?)",
    ).run(`${row.id}-m${index}`, row.id, index % 2 === 0 ? "user" : "assistant", row.startedAt);
  }
  if (row.sessionPath !== null && row.sessionPath !== undefined) {
    db.prepare(
      "INSERT INTO runtime_sessions (session_id, conversation_id, interface, mirror_active, hook_injected, active, started_at, updated_at) VALUES (?, ?, ?, 0, 0, 0, ?, ?)",
    ).run(row.sessionPath, row.id, iface, row.startedAt, row.startedAt);
  }
}

/** A conversation an earlier version imported from `folder`: started after its last message. */
function seedImport(
  db: WritableDatabase,
  id: string,
  folder: string | null,
  importedAt = "2026-10-20T10:00:00.000Z",
): void {
  // The session's last message, a day before the import, in the `+00:00` form
  // the import wrote it in.
  const endedAt = new Date(Date.parse(importedAt) - 86_400_000)
    .toISOString()
    .replace("Z", "+00:00");
  seed(db, {
    id,
    startedAt: importedAt,
    endedAt,
    sessionPath: folder === null ? null : `${SESSIONS}/--${folder}--/${id}.jsonl`,
  });
}

/** A conversation this home logged live from `folder`. */
function seedLive(
  db: WritableDatabase,
  id: string,
  folder: string,
  ended: string | null = "2026-10-18T09:00:00.000Z",
): void {
  seed(db, {
    id,
    startedAt: "2026-10-18T08:00:00.000Z",
    endedAt: ended,
    sessionPath: `${SESSIONS}/--${folder}--/${id}.jsonl`,
  });
}

const ids = (rows: readonly { id: string }[]) => rows.map((row) => row.id);

// --- what an import is ------------------------------------------------------

test("an import started at or after its own last message, both instants zoned", () => {
  assert.equal(isImportShaped("2026-10-20T10:00:00.000Z", "2026-10-19T09:00:00+00:00"), true);
  assert.equal(isImportShaped("2026-10-19T09:00:00Z", "2026-10-19T09:00:00Z"), true);
  assert.equal(isImportShaped("2026-10-18T08:00:00Z", "2026-10-18T09:00:00Z"), false);
  assert.equal(isImportShaped("2026-10-18T08:00:00Z", null), false);
  // No zone on either side: never an import, whatever the order says.
  assert.equal(isImportShaped("2026-10-20T10:00:00", "2026-10-19T09:00:00+00:00"), false);
  assert.equal(isImportShaped("2026-10-20T10:00:00Z", "2026-10-19T09:00:00"), false);
  assert.equal(isImportShaped("not a time", "2026-10-19T09:00:00Z"), false);
});

test("the listing holds the Pi imports and nothing else, newest import first", () => {
  const db = freshDb();
  seedImport(db, "import-old", "Users-p-dev-a", "2026-10-01T10:00:00.000Z");
  seedImport(db, "import-new", "Users-p-dev-a", "2026-10-20T10:00:00.000Z");
  seedLive(db, "live-closed", "Users-p-dev-a");
  seedLive(db, "live-open", "Users-p-dev-a", null);
  // Import-shaped, but not Pi: the retired Codex importer's, or anything else.
  seed(db, {
    id: "codex-import",
    iface: "codex",
    startedAt: "2026-10-20T10:00:00Z",
    endedAt: "2026-10-19T09:00:00Z",
  });
  // A zone-less start: never offered, even in import order.
  seed(db, { id: "naive", startedAt: "2026-10-20T10:00:00", endedAt: "2026-10-19T09:00:00Z" });

  const imports = listImportedPiConversations(db);
  assert.deepEqual(ids(imports), ["import-new", "import-old"]);
  assert.equal(imports[0]?.messageCount, 2);
  assert.equal(imports[0]?.folder, "Users-p-dev-a");
  db.close();
});

test("a folder is the session file's directory, Pi's wrapping dashes removed", () => {
  assert.equal(sessionFolder(`${SESSIONS}/--Users-p-dev-mirror--/x.jsonl`), "Users-p-dev-mirror");
  assert.equal(sessionFolder("/tmp/scratch/pi/x.jsonl"), "pi");
  assert.equal(sessionFolder(`${SESSIONS}/----/x.jsonl`), "----");
  assert.equal(sessionFolder(null), UNKNOWN_FOLDER);
  assert.equal(sessionFolder("x.jsonl"), UNKNOWN_FOLDER);
});

test("an import with no session row is in the unknown folder", () => {
  const db = freshDb();
  seedImport(db, "unbound", null);
  assert.equal(listImportedPiConversations(db)[0]?.folder, UNKNOWN_FOLDER);
  db.close();
});

test("the summary counts imports by folder, beside the sessions this home logged live there", () => {
  const db = freshDb();
  seedImport(db, "a1", "Users-p-dev-other");
  seedImport(db, "a2", "Users-p-dev-other");
  seedImport(db, "b1", "Users-p-dev-mine");
  seedImport(db, "u1", null);
  seedLive(db, "live-1", "Users-p-dev-mine");
  seedLive(db, "live-2", "Users-p-dev-mine", null);

  const summary = summarizeImports(listImportedPiConversations(db), countLiveSessionsByFolder(db));
  assert.equal(summary.conversations, 4);
  assert.equal(summary.messages, 8);
  assert.deepEqual(summary.folders, [
    { folder: "Users-p-dev-other", imported: 2, messages: 4, loggedLive: 0 },
    { folder: "Users-p-dev-mine", imported: 1, messages: 2, loggedLive: 2 },
    { folder: UNKNOWN_FOLDER, imported: 1, messages: 2, loggedLive: null },
  ]);
  db.close();
});

// --- the plan: what a request names ----------------------------------------

function planDb(): WritableDatabase {
  const db = freshDb();
  seedImport(db, "aaaaaaaa1111", "Users-p-dev-other");
  seedImport(db, "aaaaaaaa2222", "Users-p-dev-other");
  seedImport(db, "bbbbbbbb3333", "Users-p-dev-mine");
  seedImport(db, "dddddddd4444", null);
  seedLive(db, "cccccccc5555", "Users-p-dev-mine");
  return db;
}

test("ids name imports by full id or by a prefix of eight that matches one", () => {
  const db = planDb();
  const plan = planImportRemoval(db, { ids: ["aaaaaaaa1111", "bbbbbbbb", "aaaaaaaa1111"] });
  assert.ok(plan.ok);
  assert.deepEqual(ids(plan.conversations).sort(), ["aaaaaaaa1111", "bbbbbbbb3333"]);
  db.close();
});

test("every refusal refuses the whole request, by name", () => {
  const db = planDb();
  const refusal = (request: Parameters<typeof planImportRemoval>[1]) => {
    const plan = planImportRemoval(db, request);
    assert.equal(plan.ok, false, JSON.stringify(request));
    return plan.ok ? "" : plan.refusal;
  };
  assert.match(refusal({ ids: ["aaaaaaa"] }), /'aaaaaaa' is too short/);
  assert.match(refusal({ ids: ["aaaaaaaa"] }), /'aaaaaaaa' matches 2 conversations/);
  assert.match(refusal({ ids: ["eeeeeeee"] }), /no conversation 'eeeeeeee'/);
  assert.match(refusal({ ids: ["cccccccc5555"] }), /cccccccc is not an imported Pi conversation/);
  // One bad id among good ones: nothing is planned.
  assert.match(refusal({ ids: ["aaaaaaaa1111", "cccccccc"] }), /not an imported Pi conversation/);
  // A prefix holding LIKE's wildcards matches only itself.
  assert.match(refusal({ ids: ["aaaaaaa_"] }), /no conversation 'aaaaaaa_'/);
  // A folder is taken exactly, as the listing prints it.
  assert.match(
    refusal({ all: true, folder: "other" }),
    /no imported conversations from folder 'other'/,
  );
  db.close();
});

test("--all names every import, or every import of one exact folder", () => {
  const db = planDb();
  const all = planImportRemoval(db, { all: true, folder: null });
  assert.ok(all.ok);
  assert.deepEqual(ids(all.conversations).sort(), [
    "aaaaaaaa1111",
    "aaaaaaaa2222",
    "bbbbbbbb3333",
    "dddddddd4444",
  ]);
  const one = planImportRemoval(db, { all: true, folder: "Users-p-dev-other" });
  assert.ok(one.ok);
  assert.deepEqual(ids(one.conversations).sort(), ["aaaaaaaa1111", "aaaaaaaa2222"]);
  const unknown = planImportRemoval(db, { all: true, folder: UNKNOWN_FOLDER });
  assert.ok(unknown.ok);
  assert.deepEqual(ids(unknown.conversations), ["dddddddd4444"]);
  db.close();
});

test("--all in a home with no imports plans nothing, and refuses nothing", () => {
  const db = freshDb();
  seedLive(db, "live-1", "Users-p-dev-mine");
  const plan = planImportRemoval(db, { all: true, folder: null });
  assert.ok(plan.ok);
  assert.deepEqual(plan.conversations, []);
  db.close();
});

// --- the removal -------------------------------------------------------------

test("removal deletes the named imports, their messages and session rows, and nothing else", () => {
  const db = planDb();
  // What outlives an import: its title's provider-call record.
  db.prepare(
    "INSERT INTO llm_calls (id, role, model, prompt, response, conversation_id, called_at) VALUES ('call-1', 'conversation_title', 'm', 'p', 'r', 'aaaaaaaa1111', '2026-10-20T10:00:01Z')",
  ).run();
  const before = {
    conversations: count(db, "SELECT COUNT(*) AS n FROM conversations"),
    messages: count(db, "SELECT COUNT(*) AS n FROM messages"),
  };

  const result = removeImportedConversations(db, { all: true, folder: "Users-p-dev-other" }, [
    "aaaaaaaa2222",
    "aaaaaaaa1111",
  ]);

  assert.deepEqual(ids(result.conversations).sort(), ["aaaaaaaa1111", "aaaaaaaa2222"]);
  assert.equal(result.messages, 4);
  assert.equal(count(db, "SELECT COUNT(*) AS n FROM conversations"), before.conversations - 2);
  assert.equal(count(db, "SELECT COUNT(*) AS n FROM messages"), before.messages - 4);
  assert.equal(
    count(
      db,
      "SELECT COUNT(*) AS n FROM runtime_sessions WHERE session_id LIKE '%Users-p-dev-other%'",
    ),
    0,
  );
  assert.equal(
    db.prepare("SELECT conversation_id FROM llm_calls WHERE id = 'call-1'").get()?.conversation_id,
    null,
  );
  // The live conversation and the other imports: untouched.
  for (const id of ["bbbbbbbb3333", "dddddddd4444", "cccccccc5555"]) {
    assert.equal(count(db, "SELECT COUNT(*) AS n FROM conversations WHERE id = ?", id), 1, id);
  }
  assert.equal(
    count(db, "SELECT COUNT(*) AS n FROM runtime_sessions WHERE conversation_id = 'cccccccc5555'"),
    1,
  );
  db.close();
});

test("a failure inside the transaction removes nothing", () => {
  const db = planDb();
  db.exec(
    "CREATE TRIGGER refuse_one BEFORE DELETE ON conversations WHEN OLD.id = 'aaaaaaaa2222' BEGIN SELECT RAISE(ABORT, 'refused'); END",
  );
  assert.throws(() =>
    removeImportedConversations(db, { all: true, folder: "Users-p-dev-other" }, [
      "aaaaaaaa1111",
      "aaaaaaaa2222",
    ]),
  );
  assert.equal(count(db, "SELECT COUNT(*) AS n FROM conversations WHERE id LIKE 'aaaaaaaa%'"), 2);
  assert.equal(
    count(db, "SELECT COUNT(*) AS n FROM messages WHERE conversation_id LIKE 'aaaaaaaa%'"),
    4,
  );
  db.close();
});

test("the removal refuses when the set moved since it was decided", () => {
  const db = planDb();
  assert.throws(
    () =>
      removeImportedConversations(db, { all: true, folder: "Users-p-dev-other" }, ["aaaaaaaa1111"]),
    ImportRemovalSetMovedError,
  );
  assert.equal(count(db, "SELECT COUNT(*) AS n FROM conversations WHERE id LIKE 'aaaaaaaa%'"), 2);
  db.close();
});

test("a second removal of the same request finds nothing", () => {
  const db = planDb();
  removeImportedConversations(db, { all: true, folder: null }, [
    "aaaaaaaa1111",
    "aaaaaaaa2222",
    "bbbbbbbb3333",
    "dddddddd4444",
  ]);
  const again = planImportRemoval(db, { all: true, folder: null });
  assert.ok(again.ok);
  assert.deepEqual(again.conversations, []);
  assert.equal(count(db, "SELECT COUNT(*) AS n FROM conversations"), 1);
  db.close();
});
