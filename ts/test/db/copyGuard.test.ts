import assert from "node:assert/strict";
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
