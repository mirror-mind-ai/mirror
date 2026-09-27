// CR060: `backup` says so when it did not produce an archive. `--silent`
// suppresses progress lines, not failure. Every path that writes no archive
// exits 1 with one stderr line that leads with the consequence, never a stack
// trace, and hands the front-door log a content-free category -- because
// `hooks.log` records only the exit code, and the session-end backup of every
// runtime runs silent.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { MirrorHomeNotConfiguredError } from "#frontDoor/dbPath.ts";
import { runBackupRoute, type SafetyToolsIo } from "#frontDoor/dbSafetyToolsRoute.ts";

process.env.TZ = "UTC";

const golden = JSON.parse(
  readFileSync(new URL("../goldens/backup.golden.json", import.meta.url), "utf8"),
) as {
  meta: { frozen_now: string };
  scenarios: Record<string, { stdout: string; stderr: string; exit_code: number }>;
};
const CLI = new URL("../../src/frontDoor/cli.ts", import.meta.url).pathname;

interface Answer {
  exitCode: number;
  detail: string | undefined;
  stdout: string;
  stderr: string;
}

function backup(argv: readonly string[], resolveDbPath: SafetyToolsIo["resolveDbPath"]): Answer {
  const out: string[] = [];
  const err: string[] = [];
  const outcome = runBackupRoute(["backup", ...argv], {
    resolveDbPath,
    withLiveWriteDb: () => {
      throw new Error("backup never opens the live-write seam");
    },
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
    now: () => new Date(golden.meta.frozen_now),
    env: {},
  });
  return {
    exitCode: outcome.exitCode,
    detail: outcome.detail,
    stdout: out.map((line) => `${line}\n`).join(""),
    stderr: err.map((line) => `${line}\n`).join(""),
  };
}

function home(name: string, database: "none" | "real" | "corrupt" = "none"): string {
  const dir = mkdtempSync(`/tmp/backup-route-${name}-`);
  if (database === "real") {
    const db = new DatabaseSync(join(dir, "memory.db"));
    db.exec("PRAGMA journal_mode=WAL; CREATE TABLE t (n INTEGER); INSERT INTO t VALUES (1)");
    db.close();
  }
  if (database === "corrupt") {
    writeFileSync(
      join(dir, "memory.db"),
      Buffer.concat([Buffer.from("SQLite format 3\0"), Buffer.alloc(4080)]),
    );
  }
  return dir;
}

const at = (dir: string) => () => join(dir, "memory.db");
const normalized = (text: string, dir: string) => text.replaceAll(dir, "<home>");

test("a silent backup that wrote an archive prints nothing and exits 0", () => {
  const dir = home("ok", "real");

  const answer = backup(["--mirror-home", dir, "--silent"], at(dir));

  assert.deepEqual(answer, { exitCode: 0, detail: undefined, stdout: "", stderr: "" });
});

test("golden missing_db: without --silent, the stdout lines stay and it exits 1", () => {
  const dir = home("missing");
  const expected = golden.scenarios.missing_db as Answer & { exit_code: number };

  const answer = backup(["--mirror-home", dir], at(dir));

  assert.equal(answer.exitCode, expected.exit_code);
  assert.equal(normalized(answer.stdout, dir), expected.stdout);
  assert.equal(answer.stderr, expected.stderr);
  assert.equal(answer.detail, "backup=database_missing");
});

test("golden missing_db_silent: a silent backup with no database exits 1 with one line", () => {
  const dir = home("missing-silent");
  const expected = golden.scenarios.missing_db_silent as Answer & { exit_code: number };

  const answer = backup(["--mirror-home", dir, "--silent"], at(dir));

  assert.equal(answer.exitCode, expected.exit_code);
  assert.equal(answer.stdout, expected.stdout);
  assert.equal(normalized(answer.stderr, dir), expected.stderr);
  assert.equal(answer.detail, "backup=database_missing");
});

const failures: {
  name: string;
  setup: () => { dir: string; resolve: SafetyToolsIo["resolveDbPath"] };
  category: string;
  reason: RegExp;
}[] = [
  {
    name: "no Mirror home resolves",
    setup: () => ({
      dir: "",
      resolve: () => {
        throw new MirrorHomeNotConfiguredError("no Mirror home is configured");
      },
    }),
    category: "home_unresolved",
    reason: /^no Mirror home is configured$/,
  },
  {
    name: "the database cannot be snapshotted",
    setup: () => {
      const dir = home("corrupt", "corrupt");
      return { dir, resolve: at(dir) };
    },
    category: "snapshot_failed",
    reason: /^could not snapshot the database: /,
  },
  {
    name: "the archive cannot be written",
    setup: () => {
      const dir = home("unwritable", "real");
      // A file squatting on the backups directory's name.
      writeFileSync(join(dir, "backups"), "not a directory");
      return { dir, resolve: at(dir) };
    },
    category: "write_failed",
    reason: /\S/,
  },
];

for (const { name, setup, category, reason } of failures) {
  for (const silent of [true, false]) {
    test(`when ${name}${silent ? ", silent" : ""}: exit 1, one line, category ${category}`, () => {
      const { dir, resolve } = setup();
      const argv = dir === "" ? [] : ["--mirror-home", dir];

      const answer = backup(silent ? [...argv, "--silent"] : argv, resolve);

      assert.equal(answer.exitCode, 1);
      assert.equal(answer.detail, `backup=${category}`);
      const lines = answer.stderr.split("\n").filter(Boolean);
      assert.equal(lines.length, 1, answer.stderr);
      const prefix = "backup: no archive was written: ";
      assert.ok(lines[0]?.startsWith(prefix), lines[0]);
      assert.match((lines[0] as string).slice(prefix.length), reason);
      if (silent) assert.equal(answer.stdout, "");
    });
  }
}

test("through the front door: one line, no stack trace, and a log line with no path", () => {
  const dir = home("front-door");
  mkdirSync(join(dir, "backups"));

  const run = spawnSync(process.execPath, ["--no-warnings", CLI, "backup", "--silent"], {
    encoding: "utf8",
    env: { ...process.env, MIRROR_HOME: dir, MIRROR_USER: "", MEMORY_ENV: "" },
  });

  assert.equal(run.status, 1);
  assert.equal(run.stdout, "");
  assert.deepEqual(run.stderr.split("\n").filter(Boolean), [
    `backup: no archive was written: database not found: ${join(dir, "memory.db")}`,
  ]);
  const log = readFileSync(join(dir, "front-door.log"), "utf8").trim().split("\n");
  const last = log[log.length - 1] as string;
  assert.match(last, /\tbackup\tts\texit=1\tbackup=database_missing$/);
  assert.ok(!last.includes(dir), "the log carries no path");
});

test("an unexpected error is a bug, not a failure line: it propagates with its stack", () => {
  const bug = new TypeError("a bug in the resolver");

  assert.throws(
    () =>
      backup(["--silent"], () => {
        throw bug;
      }),
    (error: unknown) => error === bug,
  );
});
