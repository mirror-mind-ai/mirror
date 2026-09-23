// CV22.DS10.US2 plateau 2 — `runtime backup`, which is NOT the `backup` command.
//
// DS7.TS1 ported `backup` (create an archive). `runtime backup` is a different
// surface: it creates, then VERIFIES, and renders a recovery route. Its three
// functions had no TypeScript counterpart, and the update pipeline's safety
// stage depends on all three -- "backup, then verify, then move" is the whole
// promise the updater makes.
//
// The verification is characterized from the oracle, including the one boundary
// check the story's own inventory missed: Python refuses an archive whose entry
// names are absolute or contain `..`. A backup path is user input the moment
// `--verify PATH` accepts it.
//
// One check is deliberately NOT the oracle's. See the last test.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { entryFromFile, writeZipArchive } from "#backup/zipWriter.ts";
import {
  renderBackupVerification,
  renderRuntimeBackupCreated,
  verifyBackupArchive,
} from "#runtime/backup.ts";

function scratch(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "us2-backup-"));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/**
 * A real SQLite database in **WAL mode**, so `quick_check` has something true
 * to say about the shape a real backup actually has.
 *
 * The `journal_mode=WAL` is not incidental. The first version of this helper
 * used the default rollback journal, and it hid a defect that only a
 * Python-written backup exposed: a WAL database opened with `mode=ro` fails
 * with SQLITE_CANTOPEN, because read-only cannot create the `-shm` file, and
 * the archive holds no sidecars to supply it. A fixture that is not shaped
 * like production proves nothing about production.
 */
function realDatabase(dir: string): Buffer {
  const path = join(dir, "seed.db");
  execFileSync("sqlite3", [
    path,
    "PRAGMA journal_mode=WAL; create table t(a); insert into t values (1);",
  ]);
  // Checkpoint and close leaves the WAL header in the file itself, which is
  // exactly what `create_backup` archives.
  execFileSync("sqlite3", [path, "PRAGMA wal_checkpoint(TRUNCATE);"]);
  const data = readFileSync(path);
  assert.equal(data[18], 2, "fixture must be WAL-mode, like every real backup");
  return data;
}

function zipWith(dir: string, name: string, entries: readonly [string, Buffer][]): string {
  const path = join(dir, name);
  // `entryFromFile` reads mtime and mode from a real file, so each payload is
  // staged on disk first; the entry NAME is independent of it, which is what
  // lets these fixtures carry `../memory.db`.
  const inputs = entries.map(([entryName, data], index) => {
    const source = join(dir, `${name}.src${index}`);
    writeFileSync(source, data);
    return entryFromFile(source, entryName, data);
  });
  writeFileSync(path, writeZipArchive(inputs));
  return path;
}

test("a well-formed backup verifies, and its entries are reported sorted", () => {
  const f = scratch();
  try {
    const db = realDatabase(f.dir);
    const archive = zipWith(f.dir, "good.zip", [
      ["memory.db-wal", Buffer.from("wal")],
      ["memory.db", db],
    ]);
    const result = verifyBackupArchive(archive);
    assert.equal(result.valid, true, result.note ?? "");
    assert.deepEqual(result.entries, ["memory.db", "memory.db-wal"]);
    assert.equal(result.note, null);
  } finally {
    f.cleanup();
  }
});

test("a missing file and an unreadable zip are refused with the oracle's notes", () => {
  const f = scratch();
  try {
    const missing = verifyBackupArchive(join(f.dir, "nope.zip"));
    assert.equal(missing.valid, false);
    assert.equal(missing.note, "backup file not found");
    assert.deepEqual(missing.entries, []);

    const garbage = join(f.dir, "not-a-zip.zip");
    writeFileSync(garbage, "this is not a zip file\n");
    const unreadable = verifyBackupArchive(garbage);
    assert.equal(unreadable.valid, false);
    assert.equal(unreadable.note, "backup file is not a readable zip");
    assert.deepEqual(unreadable.entries, []);
  } finally {
    f.cleanup();
  }
});

test("an archive that would write outside the home is refused before anything is read", () => {
  // The check the inventory missed. `--verify PATH` accepts a path from the
  // user, so the archive is untrusted input; an entry named `../memory.db` or
  // `/tmp/memory.db` is a zip-slip attempt, and the oracle already refuses it.
  const f = scratch();
  try {
    const db = realDatabase(f.dir);
    for (const unsafe of ["../memory.db", "/tmp/memory.db"]) {
      const archive = zipWith(f.dir, `unsafe-${unsafe.replace(/\W/g, "_")}.zip`, [[unsafe, db]]);
      const result = verifyBackupArchive(archive);
      assert.equal(result.valid, false, unsafe);
      assert.equal(result.note, `unsafe archive entry: ${unsafe}`, unsafe);
      // The entries are still reported: the operator needs to see what it held.
      assert.deepEqual(result.entries, [unsafe], unsafe);
    }
  } finally {
    f.cleanup();
  }
});

test("a missing database and an unexpected passenger are both refused", () => {
  const f = scratch();
  try {
    const db = realDatabase(f.dir);
    const noDb = verifyBackupArchive(zipWith(f.dir, "no-db.zip", [["other.db", db]]));
    assert.equal(noDb.valid, false);
    assert.equal(noDb.note, "memory.db missing from backup");

    const extra = verifyBackupArchive(
      zipWith(f.dir, "extra.zip", [
        ["memory.db", db],
        ["notes.txt", Buffer.from("hi")],
      ]),
    );
    assert.equal(extra.valid, false);
    assert.equal(extra.note, "unexpected archive entries: notes.txt");
  } finally {
    f.cleanup();
  }
});

test("a backup holding a corrupt database is refused HERE and accepted by the oracle", () => {
  // The one deliberate deviation in this port, and the reason for it:
  //
  //   $ uv run python -m memory runtime backup --verify corrupt-db.zip
  //   Entries: memory.db
  //   Verification result: valid          <- Python, on 4 KB of zeros
  //
  // The oracle checks entry NAMES. A backup that has never been opened is a
  // belief, not a backup, and `verify backup: pass` is the stage the updater
  // relies on before it moves the tree. Extract and `PRAGMA quick_check`.
  //
  // This case is deliberately absent from the golden: every golden scenario
  // holds an intact database, where both engines print the same bytes.
  const f = scratch();
  try {
    const corrupt = Buffer.concat([Buffer.from("SQLite format 3\0", "binary"), Buffer.alloc(4000)]);
    const result = verifyBackupArchive(zipWith(f.dir, "corrupt.zip", [["memory.db", corrupt]]));
    assert.equal(result.valid, false);
    assert.match(result.note ?? "", /memory\.db failed integrity check/);
    assert.deepEqual(result.entries, ["memory.db"]);
    // The note is SQLite's verdict, not our invocation: it reaches a render
    // and the front-door log, and must not carry the temp path or the argv.
    assert.doesNotMatch(result.note ?? "", /sqlite3|Command failed|mirror-verify-/);
  } finally {
    f.cleanup();
  }
});

test("the renders carry the oracle's shape, including the manual recovery route", () => {
  const f = scratch();
  try {
    const db = realDatabase(f.dir);
    const archive = zipWith(f.dir, "render.zip", [["memory.db", db]]);
    const verification = verifyBackupArchive(archive);

    const verify = renderBackupVerification(verification);
    assert.match(verify, /^Mirror runtime backup verification\n\n/);
    assert.match(verify, new RegExp(`^Backup: ${archive}$`, "m"));
    assert.match(verify, /^Entries: memory\.db$/m);
    assert.match(verify, /^Verification result: valid$/m);

    const created = renderRuntimeBackupCreated({
      backupPath: archive,
      mirrorHome: f.dir,
      verification,
    });
    assert.match(created, /^Mirror runtime backup\n\n/);
    assert.match(created, new RegExp(`^Mirror home: ${f.dir}$`, "m"));
    assert.match(created, /^Manual recovery route:$/m);
    assert.match(created, /^ {2}5\. Do not retry update execution until status is ready\.$/m);
    assert.match(created, /Recovery is manual in this version; no files were restored\.\n$/);
    // The updater's own instruction must not send anyone back to Python.
    assert.doesNotMatch(created, /uv run python/);
  } finally {
    f.cleanup();
  }
});

// --- parity with the oracle, from `ts/parity/generate_runtime_backup_golden.py` ---

interface BackupGolden {
  meta: { archive_token: string };
  scenarios: Record<
    string,
    {
      archive_base64: string | null;
      entries: string[];
      valid: boolean;
      note: string | null;
      verify_render: string;
      verify_exit: number;
    }
  >;
  documented_deviation: {
    archive_base64: string;
    python_valid: boolean;
    typescript_valid: boolean;
  };
}

const GOLDEN: BackupGolden = JSON.parse(
  readFileSync(new URL("../goldens/runtime-backup.golden.json", import.meta.url), "utf8"),
);

test("every verification verdict matches the oracle, byte for byte", () => {
  const f = scratch();
  try {
    for (const [name, scenario] of Object.entries(GOLDEN.scenarios)) {
      const path = join(f.dir, `${name}.zip`);
      // `absent` records no archive: the file must NOT exist for that verdict.
      if (scenario.archive_base64 !== null) {
        writeFileSync(path, Buffer.from(scenario.archive_base64, "base64"));
      }
      const result = verifyBackupArchive(path);
      assert.equal(result.valid, scenario.valid, `${name}: valid`);
      assert.equal(result.note, scenario.note, `${name}: note`);
      assert.deepEqual(result.entries, scenario.entries, `${name}: entries`);
      assert.equal(
        renderBackupVerification(result).replaceAll(path, GOLDEN.meta.archive_token),
        scenario.verify_render,
        `${name}: render`,
      );
    }
  } finally {
    f.cleanup();
  }
});

test("the documented deviation is real in both directions", () => {
  // Not a parity scenario -- a recorded disagreement. The golden carries
  // Python's verdict so that if the oracle ever starts refusing this archive,
  // this test fails and the deviation is retired rather than forgotten.
  const f = scratch();
  try {
    assert.equal(GOLDEN.documented_deviation.python_valid, true, "the oracle accepted it");
    const path = join(f.dir, "deviation.zip");
    writeFileSync(path, Buffer.from(GOLDEN.documented_deviation.archive_base64, "base64"));
    const result = verifyBackupArchive(path);
    assert.equal(result.valid, false, "the port refuses it");
    assert.equal(GOLDEN.documented_deviation.typescript_valid, false);
  } finally {
    f.cleanup();
  }
});
