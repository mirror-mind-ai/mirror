// CR163 — the probe `tempDir.test.ts` runs through a real `node --test`, with
// TMPDIR at an empty directory. Not a suite file: its name does not end in
// `.test.ts`, so the suite's glob skips it.
//
// TEMP_DIR_PROBE_MODE: `pass`, `fail` (one test fails), or `stuck` (one home
// holds a directory its owner cannot write, so it cannot be removed).
// TEMP_DIR_PROBE_REPORT: where the file's own `after` hook writes what it made.

import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { tempDir } from "#helpers/tempDir.ts";

const mode = process.env.TEMP_DIR_PROBE_MODE ?? "pass";
const reportPath = process.env.TEMP_DIR_PROBE_REPORT ?? "";

const homes: string[] = [];
let stuck: string | null = null;

// Made by the file itself, beside the helper's homes: not the helper's to remove.
const beside = mkdtempSync(join(tmpdir(), "probe-beside-"));

after(() => {
  // The helper removes on exit, after every hook: the file's own still finds its home.
  writeFileSync(join(homes[0], "after-hook.txt"), "written by the file's own after hook");
  const report = { homes, beside, afterHook: "found its home", stuck };
  writeFileSync(reportPath, JSON.stringify(report));
});

test("makes its homes", () => {
  homes.push(tempDir("probe-home-"), tempDir("probe-home-"));
  if (mode === "stuck") {
    stuck = tempDir("probe-stuck-");
    mkdirSync(join(stuck, "locked"));
    writeFileSync(join(stuck, "locked", "file"), "x");
    chmodSync(join(stuck, "locked"), 0o500);
  }
});

test("fails when asked to", () => {
  if (mode === "fail") throw new Error("the probe fails, as asked");
});
