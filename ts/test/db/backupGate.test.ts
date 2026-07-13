import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { BackupGateError, requireBackup, sha256File } from "../../src/db/backupGate.ts";

function tempFile(contents: string): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-backup-"));
  const path = join(dir, "backup.db");
  writeFileSync(path, contents);
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("sha256File hashes file bytes as hex", () => {
  const { path, cleanup } = tempFile("hello");
  try {
    assert.equal(
      sha256File(path),
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  } finally {
    cleanup();
  }
});

test("requireBackup passes for a present, matching backup", () => {
  const { path, cleanup } = tempFile("db-bytes");
  try {
    assert.doesNotThrow(() => requireBackup({ path, sha256: sha256File(path) }));
  } finally {
    cleanup();
  }
});

test("requireBackup throws when the backup is undefined", () => {
  assert.throws(() => requireBackup(undefined), BackupGateError);
});

test("requireBackup throws when the backup file is missing", () => {
  assert.throws(
    () => requireBackup({ path: "/no/such/tmp/backup.db", sha256: "0".repeat(64) }),
    BackupGateError,
  );
});

test("requireBackup throws when the recorded hash no longer matches", () => {
  const { path, cleanup } = tempFile("db-bytes");
  try {
    assert.throws(() => requireBackup({ path, sha256: "0".repeat(64) }), BackupGateError);
  } finally {
    cleanup();
  }
});
