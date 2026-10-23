// CR160 — `mirror conversations skill-turns`: the route, with its database and its
// backup injected.
//
// What this pins beyond the module: strict parsing (a typo is refused before
// anything opens), a dry run by default that lists the conversations it would
// delete with their message counts (A7) and prints the exact command to apply it,
// and a verified dated backup before any row moves. Shaped as CR154's
// `conversations imported remove`.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import type { WritableDatabase } from "#db/database.ts";
import { runSkillTurnsRoute } from "#frontDoor/skillTurnsRoute.ts";

function wrapper(name: string, args = ""): string {
  return (
    `<skill name="${name}" location="/tree/.pi/skills/${name}/SKILL.md">\n` +
    `References are relative to /tree/.pi/skills/${name}.\n\n# ${name}\n</skill>` +
    (args ? `\n\n${args}` : "")
  );
}

let clock = 0;
function message(
  db: WritableDatabase,
  id: string,
  conversationId: string,
  role: string,
  content: string,
): void {
  clock += 1;
  db.prepare(
    "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(
    id,
    conversationId,
    role,
    content,
    `2026-10-01T10:00:${String(clock).padStart(2, "0")}.000000Z`,
  );
}

function seed(db: WritableDatabase): void {
  db.prepare(
    "INSERT INTO conversations (id, title, started_at, ended_at, interface) VALUES ('aaaaaaaa1111', ?, '2026-10-01T09:00:00Z', '2026-10-01T11:00:00Z', 'pi')",
  ).run('<skill name="mm-mirror" location="/tree/.pi/skills/mm-mirror/SKILL.md">');
  message(db, "a-1", "aaaaaaaa1111", "user", wrapper("mm-mirror", "should I raise my price?"));
  message(db, "a-2", "aaaaaaaa1111", "assistant", "Raise it.");
  db.prepare(
    "INSERT INTO conversations (id, title, started_at, ended_at, interface) VALUES ('bbbbbbbb2222', 'Builder', '2026-10-02T09:00:00Z', '2026-10-02T11:00:00Z', 'pi')",
  ).run();
  message(db, "b-1", "bbbbbbbb2222", "user", wrapper("mm-build", "mirror"));
  message(db, "b-2", "bbbbbbbb2222", "assistant", "Builder Mode active.");
}

interface Harness {
  db: WritableDatabase;
  events: string[];
  run: (
    args: string[],
    options?: { backup?: "ok" | "fails" | "unverified" },
  ) => { code: number; out: string; err: string };
  messages: () => string[];
}

// Every harness's home, closed and removed once this file's tests have run.
const homes: { dir: string; db: WritableDatabase }[] = [];
test.after(() => {
  for (const { dir, db } of homes.splice(0)) {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

function harness(seedWith: (db: WritableDatabase) => void = seed): Harness {
  const dir = mkdtempSync(join(tmpdir(), "skill-turns-route-"));
  const dbPath = join(dir, "memory.db");
  const db = bootstrapDatabase(dbPath);
  homes.push({ dir, db });
  seedWith(db);
  const events: string[] = [];
  return {
    db,
    events,
    run(args, options = {}) {
      const out: string[] = [];
      const err: string[] = [];
      const code = runSkillTurnsRoute(["conversations", "skill-turns", ...args], {
        withReadOnlyDatabase: (read) => read(db),
        withLiveWriteDatabase: (write) => {
          events.push("open-write");
          return write(db, dbPath);
        },
        backup: () => {
          events.push("backup");
          if (options.backup === "fails") return null;
          mkdirSync(join(dir, "backups"), { recursive: true });
          const archive = join(dir, "backups", "memory_20261023_120000.zip");
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
    messages: () =>
      db
        .prepare("SELECT id || '=' || content AS row FROM messages ORDER BY id")
        .all()
        .map((row) => String(row.row)),
  };
}

test("the default is a dry run: what it would change, the conversations it would delete, the command to apply", () => {
  const h = harness();
  const before = h.messages();
  const { code, out } = h.run([]);
  assert.equal(code, 0);
  assert.match(out, /Pi user turns stored as a skill's body: 2, in 2 conversations\./);
  assert.match(out, /\s1\s+0\s+mm-mirror/);
  assert.match(out, /\s0\s+1\s+mm-build/);
  assert.match(out, /Would delete 1 conversation left with no user turn:/);
  assert.match(out, /bbbbbbbb {2}2 messages {2}Builder/);
  assert.match(out, /Would retitle 1 conversation from its first remaining user turn\./);
  assert.match(
    out,
    /Nothing was changed\. To repair them, run:\n {2}mirror conversations skill-turns --apply/,
  );
  assert.deepEqual(h.messages(), before, "a dry run changes nothing");
  assert.deepEqual(h.events, [], "and takes no backup");
});

test("--apply backs up, verifies, then repairs in one transaction", () => {
  const h = harness();
  const { code, out } = h.run(["--apply"]);
  assert.equal(code, 0);
  assert.deepEqual(h.events, ["open-write", "backup", "verify"]);
  assert.match(out, /Backup: .*memory_20261023_120000\.zip \(verified\)\./);
  assert.match(out, /Kept 1 Mirror question; removed 1 skill turn\./);
  assert.match(out, /Deleted 1 conversation left with no user turn, with 1 more message\./);
  assert.match(out, /Retitled 1 conversation\./);
  assert.deepEqual(h.messages(), ["a-1=should I raise my price?", "a-2=Raise it."]);
  const again = h.run([]);
  assert.match(again.out, /No Pi user turns stored as a skill's body in this home\./);
});

test("a backup that fails or does not verify changes nothing", () => {
  for (const backup of ["fails", "unverified"] as const) {
    const h = harness();
    const before = h.messages();
    const { code, err } = h.run(["--apply"], { backup });
    assert.equal(code, 1);
    assert.match(err, /nothing was changed/);
    assert.deepEqual(h.messages(), before);
  }
});

test("nothing to repair takes no backup", () => {
  const h = harness(() => {});
  const { code, out } = h.run(["--apply"]);
  assert.equal(code, 0);
  assert.match(out, /Nothing to repair\./);
  assert.deepEqual(h.events, []);
});

test("a mistyped option is refused before anything opens", () => {
  const h = harness();
  const { code, err } = h.run(["--aply"]);
  assert.equal(code, 2);
  assert.match(err, /usage: mirror conversations skill-turns/);
  assert.deepEqual(h.events, []);
});
