// CR154 — `mirror conversations imported`: the route, with its database and its
// backup injected.
//
// What this pins beyond the module: strict parsing (a typo never widens a
// removal), a dry run by default that prints the exact command to apply it, a
// verified dated backup before any row moves, and a report that names the
// backups still holding copies.

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import type { WritableDatabase } from "#db/database.ts";
import { runImportedConversationsRoute } from "#frontDoor/importedConversationsRoute.ts";

const SESSIONS = "/home/p/.pi/agent/sessions";

interface Harness {
  db: WritableDatabase;
  dbPath: string;
  backupsDir: string;
  events: string[];
  run: (
    args: string[],
    options?: { backup?: "ok" | "fails" | "unverified" },
  ) => { code: number; out: string; err: string };
  ids: () => string[];
}

function seedImport(db: WritableDatabase, id: string, folder: string | null): void {
  db.prepare(
    "INSERT INTO conversations (id, title, started_at, ended_at, interface) VALUES (?, ?, '2026-10-20T10:00:00.000Z', '2026-10-19T09:00:00+00:00', 'pi')",
  ).run(id, `Copied ${id}`);
  for (const [index, role] of ["user", "assistant"].entries()) {
    db.prepare(
      "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, 'x', '2026-10-19T09:00:00+00:00')",
    ).run(`${id}-m${index}`, id, role);
  }
  if (folder !== null) {
    db.prepare(
      "INSERT INTO runtime_sessions (session_id, conversation_id, interface, mirror_active, hook_injected, active, started_at, updated_at) VALUES (?, ?, 'pi', 0, 0, 0, '2026-10-20T10:00:00.000Z', '2026-10-20T10:00:00.000Z')",
    ).run(`${SESSIONS}/--${folder}--/${id}.jsonl`, id);
  }
}

function seedLive(db: WritableDatabase, id: string, folder: string): void {
  db.prepare(
    "INSERT INTO conversations (id, title, started_at, ended_at, interface) VALUES (?, 'Logged here', '2026-10-18T08:00:00.000Z', '2026-10-18T09:00:00.000Z', 'pi')",
  ).run(id);
  db.prepare(
    "INSERT INTO runtime_sessions (session_id, conversation_id, interface, started_at, updated_at) VALUES (?, ?, 'pi', '2026-10-18T08:00:00.000Z', '2026-10-18T09:00:00.000Z')",
  ).run(`${SESSIONS}/--${folder}--/${id}.jsonl`, id);
}

function harness(seed: (db: WritableDatabase) => void = defaultSeed): Harness {
  const dir = mkdtempSync("/tmp/imported-route-");
  const dbPath = join(dir, "memory.db");
  const backupsDir = join(dir, "backups");
  const db = bootstrapDatabase(dbPath);
  seed(db);
  const events: string[] = [];
  return {
    db,
    dbPath,
    backupsDir,
    events,
    run(args, options = {}) {
      const out: string[] = [];
      const err: string[] = [];
      const code = runImportedConversationsRoute(["conversations", "imported", ...args], {
        withReadOnlyDatabase: (read) => read(db),
        withLiveWriteDatabase: (write) => {
          events.push("open-write");
          return write(db, dbPath);
        },
        backup: (path) => {
          events.push("backup");
          if (options.backup === "fails") return null;
          mkdirSync(backupsDir, { recursive: true });
          const archive = join(join(path, ".."), "backups", "memory_20261021_120000.zip");
          writeFileSync(archive, "zip");
          return archive;
        },
        verifyBackup: () => {
          events.push("verify");
          return options.backup === "unverified"
            ? { valid: false, note: "memory.db failed integrity check" }
            : { valid: true, note: null };
        },
        stdout: (line) => out.push(line),
        stderr: (line) => err.push(line),
      });
      return { code, out: out.join("\n"), err: err.join("\n") };
    },
    ids: () =>
      db
        .prepare("SELECT id FROM conversations ORDER BY id")
        .all()
        .map((row) => String(row.id)),
  };
}

function defaultSeed(db: WritableDatabase): void {
  seedImport(db, "aaaaaaaa1111", "Users-p-dev-other");
  seedImport(db, "aaaaaaaa2222", "Users-p-dev-other");
  seedImport(db, "bbbbbbbb3333", "Users-p-dev-mine");
  seedImport(db, "dddddddd4444", null);
  seedLive(db, "cccccccc5555", "Users-p-dev-mine");
}

const ALL = ["aaaaaaaa1111", "aaaaaaaa2222", "bbbbbbbb3333", "cccccccc5555", "dddddddd4444"];

// --- the listing --------------------------------------------------------------

test("the listing leads with what an import is, then one line per folder", () => {
  const h = harness();
  const { code, out, err } = h.run([]);
  assert.equal(code, 0, err);
  const lines = out.split("\n");
  assert.equal(
    lines[0],
    "Imported Pi conversations: 4 (8 messages), imported 2026-10-20 to 2026-10-20.",
  );
  assert.match(
    lines[1] ?? "",
    /^Mirror copied these from Pi's session files instead of logging them/,
  );
  assert.ok(out.includes("  imported  logged live here  folder"));
  assert.match(out, /^ +2 +0 {2}Users-p-dev-other$/m);
  assert.match(out, /^ +1 +1 {2}Users-p-dev-mine$/m);
  assert.match(out, /^ +1 +- {2}\(unknown\)$/m);
  // Folders first: no conversation line without --project.
  assert.doesNotMatch(out, /aaaaaaaa/);
  assert.match(out, /mirror conversations imported --project <text>/);
  assert.match(out, /mirror conversations imported remove --all --project <folder>/);
});

test("--project lists the matching folders and their conversations", () => {
  const h = harness();
  const { code, out } = h.run(["--project", "OTHER"]);
  assert.equal(code, 0);
  assert.match(out, /^Imported Pi conversations: 2 \(4 messages\)/);
  assert.match(out, /from folders matching 'OTHER'/);
  // The full id: ids are what a person types back to remove one.
  assert.match(out, /aaaaaaaa1111 {2}2 msgs {2}Users-p-dev-other {2}Copied aaaaaaaa1111/);
  assert.doesNotMatch(out, /Users-p-dev-mine/);
});

test("a home with no imports says so", () => {
  const h = harness((db) => seedLive(db, "cccccccc5555", "Users-p-dev-mine"));
  assert.deepEqual(h.run([]), {
    code: 0,
    out: "No imported Pi conversations in this home.",
    err: "",
  });
});

// --- strict parsing -------------------------------------------------------------

test("an undeclared option is refused with the usage, before anything opens", () => {
  const h = harness();
  for (const args of [
    ["remove", "--all", "--projet", "Users-p-dev-other", "--apply"],
    ["--limit", "5"],
    ["delete"],
  ]) {
    const { code, err } = h.run(args);
    assert.equal(code, 2, args.join(" "));
    assert.match(err, /^usage: mirror conversations imported/m);
    assert.match(err, /error: unrecognized arguments/);
  }
  assert.deepEqual(h.events, []);
  assert.deepEqual(h.ids(), ALL);
});

test("remove takes ids or --all, and --project only with --all", () => {
  const h = harness();
  for (const [args, message] of [
    [["remove"], /give conversation ids, or --all/],
    [["remove", "aaaaaaaa1111", "--all"], /ids or --all, not both/],
    [["remove", "aaaaaaaa1111", "--project", "x"], /--project narrows --all/],
  ] as const) {
    const { code, err } = h.run([...args]);
    assert.equal(code, 2, args.join(" "));
    assert.match(err, message);
  }
  assert.deepEqual(h.ids(), ALL);
});

test("--help prints the usage and exits 0", () => {
  const h = harness();
  const { code, out } = h.run(["--help"]);
  assert.equal(code, 0);
  assert.match(out, /^usage: mirror conversations imported \[--project TEXT\]/);
  assert.match(out, /mirror conversations imported remove/);
});

// --- the dry run ----------------------------------------------------------------

test("remove without --apply changes nothing and prints the command that would", () => {
  const h = harness();
  const { code, out } = h.run([
    "remove",
    "--all",
    "--project",
    "Users-p-dev-other",
    "--db-path",
    "/tmp/a home/memory.db",
  ]);
  assert.equal(code, 0);
  assert.match(out, /^Would remove 2 imported Pi conversations \(4 messages\):/);
  assert.match(out, /^ +2 {2}Users-p-dev-other$/m);
  assert.match(out, /Nothing was removed\./);
  assert.ok(
    out.includes(
      "  mirror conversations imported remove --all --project Users-p-dev-other --db-path '/tmp/a home/memory.db' --apply",
    ),
    out,
  );
  assert.deepEqual(h.events, []);
  assert.deepEqual(h.ids(), ALL);
});

test("a refusal refuses the whole command, removes nothing, and takes no backup", () => {
  const h = harness();
  const { code, out, err } = h.run(["remove", "aaaaaaaa1111", "cccccccc", "--apply"]);
  assert.equal(code, 1);
  assert.equal(out, "");
  assert.match(err, /cccccccc is not an imported Pi conversation/);
  assert.deepEqual(h.events, []);
  assert.deepEqual(h.ids(), ALL);
});

// --- the apply ------------------------------------------------------------------

test("--apply takes and verifies a dated backup, then removes only what it named", () => {
  const h = harness();
  mkdirSync(h.backupsDir, { recursive: true });
  // An archive older than every import holds none of them; the pre-write backup does.
  writeFileSync(join(h.backupsDir, "memory_20261001_120000.zip"), "zip");
  writeFileSync(join(h.backupsDir, "frontdoor-pre-write-backup.db"), "db");

  const { code, out, err } = h.run([
    "remove",
    "--all",
    "--project",
    "Users-p-dev-other",
    "--apply",
  ]);
  assert.equal(code, 0, err);
  assert.deepEqual(h.events, ["open-write", "backup", "verify"]);
  assert.deepEqual(h.ids(), ["bbbbbbbb3333", "cccccccc5555", "dddddddd4444"]);
  const lines = out.split("\n");
  assert.equal(lines[0], `Backup: ${join(h.backupsDir, "memory_20261021_120000.zip")} (verified).`);
  assert.equal(lines[1], "Removed 2 imported Pi conversations (4 messages) from 1 folder.");
  assert.match(out, /Memories and provider-call records that named them were kept, unlinked\./);
  assert.match(
    out,
    /1 dated archive in .*backups, made 2026-10-21 \(archives are removed after 30 days\);/,
  );
  assert.match(out, /the pre-write backup .*frontdoor-pre-write-backup\.db/);
});

test("a backup that fails or does not verify removes nothing", () => {
  for (const backup of ["fails", "unverified"] as const) {
    const h = harness();
    const { code, err } = h.run(["remove", "--all", "--apply"], { backup });
    assert.equal(code, 1, backup);
    assert.match(err, /nothing was removed/i);
    assert.deepEqual(h.ids(), ALL, backup);
  }
});

test("--apply with nothing to remove takes no backup", () => {
  const h = harness((db) => seedLive(db, "cccccccc5555", "Users-p-dev-mine"));
  const { code, out } = h.run(["remove", "--all", "--apply"]);
  assert.equal(code, 0);
  assert.equal(out, "Nothing to remove.");
  assert.deepEqual(h.events, []);
});

test("a second --apply finds nothing", () => {
  const h = harness();
  assert.equal(h.run(["remove", "--all", "--apply"]).code, 0);
  assert.deepEqual(h.ids(), ["cccccccc5555"]);
  assert.equal(existsSync(join(h.backupsDir, "memory_20261021_120000.zip")), true);
  const again = h.run(["remove", "--all", "--apply"]);
  assert.equal(again.code, 0);
  assert.equal(again.out, "Nothing to remove.");
});
