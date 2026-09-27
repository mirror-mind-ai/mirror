// The dated zip backup. Output, exit codes, and listings are graded against the
// golden frozen from the Python oracle (CV22.DS7.TS1). Since CR061 the archive
// is a snapshot of the database as committed, so its one member is graded by
// name, compression, and capture time, and the database it restores is graded
// by what it holds: it opens, passes quick_check, has every committed row, and
// runs in WAL mode. Compressed bytes and snapshot bytes are never compared --
// zlib and SQLite builds differ between machines.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { after } from "node:test";
import {
  BackupSnapshotError,
  createZipBackup,
  formatKilobytes,
  publishArchive,
  snapshotEntry,
} from "#backup/zipBackup.ts";
import { readZipEntry } from "#backup/zipReader.ts";
import { inspectZip } from "#helpers/zipInspect.ts";

// zipfile stores LOCAL time; the golden was generated under TZ=UTC.
process.env.TZ = "UTC";

const GOLDEN_PATH = new URL("../goldens/backup.golden.json", import.meta.url);

interface Scenario {
  argv: string[];
  stdout: string;
  stderr: string;
  exit_code: number;
  fixture_files?: string[];
  members?: { name: string; compress_type: number; date_time: number[] }[];
  backups_after?: string[];
  dest_after?: string[];
  home_backups_after?: string[];
  ignored_dir_exists?: boolean;
}

interface Golden {
  meta: { frozen_now: string };
  retention_files: Record<string, string>;
  kb_format: Record<string, string>;
  scenarios: Record<string, Scenario>;
}

const golden: Golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8"));

const frozenNow = new Date(golden.meta.frozen_now);

/** Rows a fixture database commits to its main file, and holds in its WAL when it has one. */
const COMMITTED_ROWS = 100;
const WAL_ROWS = 50;

const openWriters: DatabaseSync[] = [];
after(() => {
  for (const writer of openWriters) writer.close();
});

/**
 * A real WAL-mode database like a live Mirror home: `committed` rows reach the
 * main file through a checkpoint, then `inWal` more are committed while the
 * returned writer keeps them in the WAL -- the state a session-end backup meets
 * whenever another connection is still open.
 */
function liveDatabase(dbPath: string, committed: number, inWal: number): DatabaseSync {
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE fixture (n INTEGER)");
  const insert = db.prepare("INSERT INTO fixture VALUES (?)");
  for (let n = 0; n < committed; n++) insert.run(n);
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  for (let n = committed; n < committed + inWal; n++) insert.run(n);
  return db;
}

/**
 * A Mirror home for a scenario's `fixture_files`: `memory.db` is a real database,
 * and `memory.db-wal` means a writer is still holding rows in its WAL.
 */
function makeHome(name: string, files: string[] = []): string {
  const home = mkdtempSync(`/tmp/backup-${name}-`);
  if (files.includes("memory.db")) {
    const live = files.includes("memory.db-wal");
    const writer = liveDatabase(join(home, "memory.db"), COMMITTED_ROWS, live ? WAL_ROWS : 0);
    if (live) openWriters.push(writer);
    else writer.close();
  }
  return home;
}

function expectedRows(files: string[] = []): number {
  return COMMITTED_ROWS + (files.includes("memory.db-wal") ? WAL_ROWS : 0);
}

/** The archive's `memory.db`, restored on its own, as a verifier or a restore reads it. */
function restoredMember(archivePath: string): { rows: number; journalMode: string; check: string } {
  const dir = mkdtempSync(join(tmpdir(), "backup-restored-"));
  const path = join(dir, "memory.db");
  writeFileSync(path, readZipEntry(readFileSync(archivePath), "memory.db") as Buffer);
  const db = new DatabaseSync(path);
  try {
    const rows = (db.prepare("SELECT count(*) AS n FROM fixture").get() as { n: number }).n;
    const journalMode = (db.prepare("PRAGMA journal_mode").get() as { journal_mode: string })
      .journal_mode;
    const check = (db.prepare("PRAGMA quick_check").get() as { quick_check: string }).quick_check;
    return { rows, journalMode, check };
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The member as the golden grades it: name, compression, and capture time. */
function gradedMembers(archivePath: string): Scenario["members"] {
  return inspectZip(archivePath).map(({ name, compress_type, date_time }) => ({
    name,
    compress_type,
    date_time,
  }));
}

function seedRetention(dir: string): void {
  mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(golden.retention_files)) {
    writeFileSync(join(dir, name), Buffer.from(content, "base64"));
  }
}

function listing(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).sort() : [];
}

interface RunResult {
  stdout: string;
  stderr: string;
  path: string | null;
}

function run(
  home: string,
  options: {
    silent?: boolean;
    backupDir?: string;
    env?: Record<string, string>;
    tempDir?: string;
  } = {},
): RunResult {
  const out: string[] = [];
  const err: string[] = [];
  const path = createZipBackup({
    dbPath: join(home, "memory.db"),
    mirrorHome: home,
    backupDir: options.backupDir ?? null,
    silent: options.silent ?? false,
    env: options.env ?? {},
    now: () => frozenNow,
    ...(options.tempDir ? { tempDir: options.tempDir } : {}),
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
  });
  return {
    stdout: out.map((l) => `${l}\n`).join(""),
    stderr: err.map((l) => `${l}\n`).join(""),
    path,
  };
}

function normalize(text: string, home: string, dest?: string): string {
  let normalized = text.replaceAll(home, "<home>");
  if (dest) normalized = normalized.replaceAll(dest, "<dest>");
  return normalized.replace(/\((\d+) KB\)/g, "(<KB> KB)");
}

test("full: a live database, staging gone, retention swept, stdout exact", () => {
  const s = golden.scenarios.full as Scenario;
  const home = makeHome("full", s.fixture_files);
  seedRetention(join(home, "backups"));

  const result = run(home);
  assert.equal(normalize(result.stdout, home), s.stdout);
  assert.equal(result.stderr, s.stderr);
  assert.equal(result.path, join(home, "backups", "memory_20260907_140305.zip"));
  assert.deepEqual(gradedMembers(result.path as string), s.members);
  assert.deepEqual(listing(join(home, "backups")), s.backups_after);
  assert.deepEqual(restoredMember(result.path as string), {
    rows: expectedRows(s.fixture_files),
    journalMode: "wal",
    check: "ok",
  });
});

test("db only: a single member", () => {
  const s = golden.scenarios.db_only as Scenario;
  const home = makeHome("db-only", s.fixture_files);

  const result = run(home);
  assert.equal(normalize(result.stdout, home), s.stdout);
  assert.deepEqual(gradedMembers(result.path as string), s.members);
  assert.deepEqual(listing(join(home, "backups")), s.backups_after);
  assert.equal(restoredMember(result.path as string).rows, expectedRows(s.fixture_files));
});

test("silent: nothing printed, archive still created", () => {
  const s = golden.scenarios.silent as Scenario;
  const home = makeHome("silent", s.fixture_files);

  const result = run(home, { silent: true });
  assert.equal(result.stdout, "");
  assert.deepEqual(listing(join(home, "backups")), s.backups_after);
  assert.deepEqual(
    inspectZip(result.path as string).map((m) => m.name),
    ["memory.db"],
  );
  assert.equal(restoredMember(result.path as string).rows, expectedRows(s.fixture_files));
});

test("explicit --backup-dir wins over <home>/backups", () => {
  const s = golden.scenarios.explicit_backup_dir as Scenario;
  const home = makeHome("explicit", s.fixture_files);
  const dest = join(mkdtempSync("/tmp/backup-dest-"), "archives");

  const result = run(home, { backupDir: dest });
  assert.equal(normalize(result.stdout, home, dest), s.stdout);
  assert.deepEqual(listing(dest), s.dest_after);
  assert.deepEqual(listing(join(home, "backups")), s.home_backups_after);
});

test("missing database: reported on stdout, no archive, null result (exit semantics are the CLI's)", () => {
  const s = golden.scenarios.missing_db as Scenario;
  const home = makeHome("missing");

  const result = run(home);
  assert.equal(normalize(result.stdout, home), s.stdout);
  assert.equal(result.path, null);
  assert.deepEqual(listing(join(home, "backups")), s.backups_after);

  const silent = run(home, { silent: true });
  assert.equal(silent.stdout, (golden.scenarios.missing_db_silent as Scenario).stdout);
  assert.equal(silent.path, null);
});

test("deprecated BACKUP_DIR env warns on stderr and is ignored; silent when --backup-dir is explicit", () => {
  const s = golden.scenarios.deprecated_backup_dir_env as Scenario;
  const home = makeHome("deprecated", s.fixture_files);
  const ignored = join(mkdtempSync("/tmp/backup-ignored-"), "ignored-by-design");

  const result = run(home, { env: { BACKUP_DIR: ignored } });
  assert.equal(result.stderr, s.stderr);
  assert.deepEqual(listing(join(home, "backups")), s.backups_after);
  assert.equal(existsSync(ignored), s.ignored_dir_exists);

  const explicit = golden.scenarios.deprecated_env_with_explicit_dir as Scenario;
  const home2 = makeHome("deprecated-explicit", explicit.fixture_files);
  const dest = join(mkdtempSync("/tmp/backup-dest2-"), "explicit-wins");
  const result2 = run(home2, { backupDir: dest, env: { BACKUP_DIR: ignored } });
  assert.equal(result2.stderr, explicit.stderr);
  assert.deepEqual(listing(dest), explicit.dest_after);
});

test("a failure after staging removes the .partial and the snapshot, and propagates the error", () => {
  const s = golden.scenarios.db_only as Scenario;
  const home = makeHome("failure", s.fixture_files);
  const temp = mkdtempSync(join(tmpdir(), "backup-temp-"));
  // A directory squatting on the archive name makes the final rename fail
  // after the snapshot was taken and the staging file fully written.
  mkdirSync(join(home, "backups", "memory_20260907_140305.zip"), { recursive: true });

  assert.throws(
    () => run(home, { tempDir: temp }),
    (error: Error) => !(error instanceof BackupSnapshotError),
  );
  assert.deepEqual(
    listing(join(home, "backups")).filter((name) => name.endsWith(".partial")),
    [],
    "no plausible partial archive may survive a failed write",
  );
  assert.deepEqual(listing(temp), [], "no snapshot may survive a failed write");
});

test("KB token rounds half to even like Python's .0f", () => {
  for (const [size, expected] of Object.entries(golden.kb_format)) {
    assert.equal(formatKilobytes(Number(size)), expected, `size ${size}`);
  }
});

// --- CR061: the archive is the database as committed, not a copy of its files ---

test("CR061: rows a live writer holds in the WAL are in the archive's memory.db, its only member", () => {
  const home = mkdtempSync("/tmp/backup-live-wal-");
  const writer = liveDatabase(join(home, "memory.db"), 100, 50);
  try {
    const result = run(home, { silent: true });

    assert.deepEqual(
      inspectZip(result.path as string).map((member) => member.name),
      ["memory.db"],
    );
    assert.deepEqual(restoredMember(result.path as string), {
      rows: 150,
      journalMode: "wal",
      check: "ok",
    });
  } finally {
    writer.close();
  }
});

test("CR061: the snapshot is taken privately, never in the backups directory, and none is left", () => {
  const home = makeHome("private", ["memory.db", "memory.db-wal"]);
  const temp = mkdtempSync(join(tmpdir(), "backup-temp-"));
  const past = Date.now() / 1000 - 3600;
  utimesSync(temp, past, past);

  const result = run(home, { silent: true, tempDir: temp });

  // The directory changed: the snapshot was made there, then removed.
  assert.ok(statSync(temp).mtimeMs > past * 1000, "the snapshot is made under tempDir");
  assert.deepEqual(listing(join(home, "backups")), ["memory_20260907_140305.zip"]);
  assert.deepEqual(listing(temp), []);
  assert.equal(result.path, join(home, "backups", "memory_20260907_140305.zip"));
});

test("CR061: two backups with the same timestamp both complete", () => {
  const home = makeHome("same-second", ["memory.db"]);

  const first = run(home, { silent: true });
  const second = run(home, { silent: true });

  assert.equal(first.path, second.path);
  assert.deepEqual(listing(join(home, "backups")), ["memory_20260907_140305.zip"]);
  assert.equal(restoredMember(second.path as string).rows, COMMITTED_ROWS);
});

test("CR061: stranded staging is swept only when its writer is gone and it is old", () => {
  const home = makeHome("sweep", ["memory.db"]);
  const backups = join(home, "backups");
  const temp = mkdtempSync(join(tmpdir(), "backup-temp-"));
  mkdirSync(backups, { recursive: true });
  const deadPid = spawnSync(process.execPath, ["-e", ""]).pid as number;
  const old = Date.now() / 1000 - 20 * 60;
  const stage = (dir: string, name: string, options: { old: boolean; directory?: boolean }) => {
    const path = join(dir, name);
    if (options.directory) mkdirSync(path);
    else writeFileSync(path, "partial bytes");
    if (options.old) utimesSync(path, old, old);
  };
  stage(backups, `memory_20260907_130000.zip.${deadPid}-aaaaaaaaaaaa.partial`, { old: true });
  stage(backups, `memory_20260907_130000.zip.${process.pid}-bbbbbbbbbbbb.partial`, { old: true });
  stage(backups, `memory_20260907_130000.zip.${deadPid}-cccccccccccc.partial`, { old: false });
  stage(backups, "memory_20260101_000000.zip.partial", { old: false });
  stage(temp, `mirror-backup-${deadPid}-Abc123`, { old: true, directory: true });
  stage(temp, `mirror-backup-${process.pid}-Def456`, { old: true, directory: true });

  run(home, { silent: true, tempDir: temp });

  assert.deepEqual(
    listing(backups),
    [
      `memory_20260907_130000.zip.${deadPid}-cccccccccccc.partial`, // young: its writer may still be at it
      `memory_20260907_130000.zip.${process.pid}-bbbbbbbbbbbb.partial`, // its writer still runs
      "memory_20260907_140305.zip",
    ].sort(),
  );
  assert.deepEqual(listing(temp), [`mirror-backup-${process.pid}-Def456`]);
});

test("CR061: a database that cannot be snapshotted publishes nothing and keeps the older archives", () => {
  const home = mkdtempSync("/tmp/backup-corrupt-");
  const temp = mkdtempSync(join(tmpdir(), "backup-temp-"));
  writeFileSync(
    join(home, "memory.db"),
    Buffer.concat([Buffer.from("SQLite format 3\0"), Buffer.alloc(4080)]),
  );
  mkdirSync(join(home, "backups"));
  writeFileSync(join(home, "backups", "memory_20260906_120000.zip"), "an older archive");

  assert.throws(() => run(home, { silent: true, tempDir: temp }), BackupSnapshotError);
  assert.deepEqual(listing(join(home, "backups")), ["memory_20260906_120000.zip"]);
  assert.deepEqual(listing(temp), []);
});

// --- CR062: owner-only from the first byte (POSIX; Windows has no mode bits) ---

const posixOnly = { skip: process.platform === "win32" ? "no POSIX mode bits on Windows" : false };

function modeOf(path: string): string {
  return (statSync(path).mode & 0o777).toString(8).padStart(4, "0");
}

/** Run under umask 022, as most installs do: owner-only must not be an accident of the umask. */
function underUmask022<T>(body: () => T): T {
  const previous = process.umask(0o022);
  try {
    return body();
  } finally {
    process.umask(previous);
  }
}

test("CR062: a created backups directory is 0700, and the archive 0600", posixOnly, () => {
  const home = makeHome("modes-new", ["memory.db"]);

  const result = underUmask022(() => run(home, { silent: true }));

  assert.equal(modeOf(join(home, "backups")), "0700");
  assert.equal(modeOf(result.path as string), "0600");
});

test(
  "CR062: Mirror's older archives are tightened; a directory and a file that is not Mirror's keep their modes (D2a)",
  posixOnly,
  () => {
    const home = makeHome("modes-existing", ["memory.db"]);
    const dest = join(mkdtempSync("/tmp/backup-chosen-"), "chosen");
    mkdirSync(dest, { mode: 0o755 });
    const older = join(dest, "memory_20260906_120000.zip");
    const notMirrors = join(dest, "other.zip");
    underUmask022(() => {
      writeFileSync(older, "an older archive", { mode: 0o644 });
      writeFileSync(notMirrors, "not Mirror's", { mode: 0o644 });
    });

    const result = underUmask022(() => run(home, { silent: true, backupDir: dest }));

    assert.equal(modeOf(result.path as string), "0600");
    assert.equal(modeOf(older), "0600");
    assert.equal(modeOf(notMirrors), "0644");
    assert.equal(modeOf(dest), "0755", "a pre-existing directory is never mutated");
  },
);

test(
  "CR062: the snapshot is owner-only, which is also the mode a restore extracts it with",
  posixOnly,
  () => {
    const home = makeHome("modes-snapshot", ["memory.db"]);
    const temp = mkdtempSync(join(tmpdir(), "backup-temp-"));

    const member = underUmask022(() => snapshotEntry(join(home, "memory.db"), temp, frozenNow));

    assert.equal((member.mode & 0o777).toString(8), "600");
  },
);

test(
  "CR062: an archive is owner-only the moment it is published, before any tightening",
  posixOnly,
  () => {
    const dir = mkdtempSync(join(tmpdir(), "backup-publish-"));
    const archive = join(dir, "memory_20260907_140305.zip");

    underUmask022(() => publishArchive(archive, Buffer.from("archive bytes")));

    assert.equal(modeOf(archive), "0600");
    assert.deepEqual(listing(dir), ["memory_20260907_140305.zip"]);
  },
);
