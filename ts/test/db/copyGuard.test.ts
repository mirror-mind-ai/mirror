import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { assertCopyTarget, CopyOnlyGuardError } from "../../src/db/copyGuard.ts";

test("assertCopyTarget refuses a live memory.db and paths outside tmp/", () => {
  assert.throws(() => assertCopyTarget("/home/x/.mirror/memory.db"), CopyOnlyGuardError);
  assert.throws(() => assertCopyTarget("/home/x/other.db"), CopyOnlyGuardError);
});

test("assertCopyTarget allows a copy under tmp/", () => {
  assert.doesNotThrow(() => assertCopyTarget("tmp/parity/python-copy.db"));
  assert.doesNotThrow(() => assertCopyTarget("/repo/tmp/parity/ts-copy.db"));
});

test("assertCopyTarget refuses a symlink under tmp/ pointing at a live database", () => {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-guard-"));
  try {
    const live = join(dir, "memory.db");
    writeFileSync(live, "live");
    const tmpDir = join(dir, "tmp");
    mkdirSync(tmpDir);
    const link = join(tmpDir, "copy.db");
    symlinkSync(live, link);
    assert.throws(() => assertCopyTarget(link), /symlink/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("assertCopyTarget refuses a tmp/.. traversal that resolves outside tmp/", () => {
  // Synthetic, environment-independent: the parent chain does not exist, so the
  // guard normalizes lexically and `tmp/..` cancels out. The OLD guard checked
  // the raw string (which contains a `tmp` segment) and would have allowed this;
  // the resolved path `/mirror-guard-root/escape.db` has no `tmp` segment. Using
  // a real mkdtemp dir here would be wrong on Linux, where the system tmpdir is
  // itself `/tmp` and a traversal staying under it is legitimately in tmp.
  assert.throws(() => assertCopyTarget("/mirror-guard-root/tmp/../escape.db"), CopyOnlyGuardError);
});
