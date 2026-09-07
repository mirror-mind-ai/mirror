// CV22.DS7.TS1 plateau 2 — the dated zip backup, graded against the Python
// oracle (`src/memory/cli/backup.py`) on what a restore depends on: archive
// name, member names and order, CRC-32 and size per member, DOS mtimes, the
// staging file being gone, the retention sweep, and exact stdout/stderr.
// Compressed bytes are never compared (zlib builds differ).

import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createZipBackup, formatKilobytes } from "#backup/zipBackup.ts";
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
  members?: {
    name: string;
    crc32: number;
    size: number;
    compress_type: number;
    date_time: number[];
  }[];
  backups_after?: string[];
  dest_after?: string[];
  home_backups_after?: string[];
  ignored_dir_exists?: boolean;
}

interface Golden {
  meta: { frozen_now: string; fixture_mtime_epoch: number };
  fixture_files: Record<string, string>;
  fixture_crc32: Record<string, number>;
  retention_files: Record<string, string>;
  kb_format: Record<string, string>;
  scenarios: Record<string, Scenario>;
}

const golden: Golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8"));

const frozenNow = new Date(golden.meta.frozen_now);

function makeHome(name: string, files: string[] = []): string {
  const home = mkdtempSync(`/tmp/backup-${name}-`);
  for (const file of files) {
    const path = join(home, file);
    writeFileSync(path, Buffer.from(golden.fixture_files[file] as string, "base64"));
    utimesSync(path, golden.meta.fixture_mtime_epoch, golden.meta.fixture_mtime_epoch);
  }
  return home;
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
  options: { silent?: boolean; backupDir?: string; env?: Record<string, string> } = {},
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

test("full: db plus sidecars, staging gone, retention swept, stdout exact", () => {
  const s = golden.scenarios.full as Scenario;
  const home = makeHome("full", s.fixture_files);
  seedRetention(join(home, "backups"));

  const result = run(home);
  assert.equal(normalize(result.stdout, home), s.stdout);
  assert.equal(result.stderr, s.stderr);
  assert.equal(result.path, join(home, "backups", "memory_20260907_140305.zip"));
  assert.deepEqual(inspectZip(result.path as string), s.members);
  assert.deepEqual(listing(join(home, "backups")), s.backups_after);
});

test("db only: a single member", () => {
  const s = golden.scenarios.db_only as Scenario;
  const home = makeHome("db-only", s.fixture_files);
  const result = run(home);
  assert.equal(normalize(result.stdout, home), s.stdout);
  assert.deepEqual(inspectZip(result.path as string), s.members);
  assert.deepEqual(listing(join(home, "backups")), s.backups_after);
});

test("silent: nothing printed, archive still created", () => {
  const s = golden.scenarios.silent as Scenario;
  const home = makeHome("silent", s.fixture_files);
  const result = run(home, { silent: true });
  assert.equal(result.stdout, "");
  assert.deepEqual(listing(join(home, "backups")), s.backups_after);
  assert.deepEqual(
    inspectZip(result.path as string).map((m) => m.name),
    ["memory.db", "memory.db-wal"],
  );
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

test("a failure after staging removes the .partial and propagates the error", () => {
  const s = golden.scenarios.db_only as Scenario;
  const home = makeHome("failure", s.fixture_files);
  // A directory squatting on the archive name makes the final rename fail
  // after the staging file has been fully written.
  mkdirSync(join(home, "backups", "memory_20260907_140305.zip"), { recursive: true });
  assert.throws(() => run(home));
  assert.deepEqual(
    listing(join(home, "backups")).filter((name) => name.endsWith(".partial")),
    [],
    "no plausible partial archive may survive a failed write",
  );
});

test("KB token rounds half to even like Python's .0f", () => {
  for (const [size, expected] of Object.entries(golden.kb_format)) {
    assert.equal(formatKilobytes(Number(size)), expected, `${size} bytes`);
  }
});

test("member CRCs equal the fixture bytes' CRC-32 (restore image, not container bytes)", () => {
  const s = golden.scenarios.full as Scenario;
  const home = makeHome("crc", s.fixture_files);
  const result = run(home);
  for (const member of inspectZip(result.path as string)) {
    assert.equal(member.crc32, golden.fixture_crc32[member.name], member.name);
  }
});
