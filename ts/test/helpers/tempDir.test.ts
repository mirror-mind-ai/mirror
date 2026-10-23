// CR163 — `tempDir`: every temp home the suite makes, removed when its test
// file's process exits.
//
// What a file leaves behind can only be seen after its process has gone, so
// the probe (`tempDirProbe.ts`, which the suite's glob skips) runs here through
// a real `node --test`, with TMPDIR at an empty directory of its own. The
// runner passes NODE_TEST_CONTEXT to its children; the probe's runner must not
// see it, or it would report as a child instead of exiting with a verdict.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, sep } from "node:path";
import test from "node:test";
import { tempDir } from "#helpers/tempDir.ts";

const PROBE = join(import.meta.dirname, "tempDirProbe.ts");

interface ProbeReport {
  homes: string[];
  beside: string;
  afterHook: string;
  stuck: string | null;
}

function runProbe(mode: "pass" | "fail" | "stuck") {
  const work = tempDir("temp-dir-probe-");
  const probeTmp = join(work, "tmp");
  mkdirSync(probeTmp);
  const reportPath = join(work, "report.json");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    TMPDIR: probeTmp,
    TEMP_DIR_PROBE_MODE: mode,
    TEMP_DIR_PROBE_REPORT: reportPath,
  };
  delete env.NODE_TEST_CONTEXT;
  const run = spawnSync(process.execPath, ["--test", PROBE], { env, encoding: "utf8" });
  const report = JSON.parse(readFileSync(reportPath, "utf8")) as ProbeReport;
  return { run, report, left: readdirSync(probeTmp), probeTmp: realpathSync(probeTmp) };
}

test("tempDir returns a fresh directory's real path under the system temp folder", () => {
  const a = tempDir("temp-dir-real-");
  const b = tempDir("temp-dir-real-");
  assert.notEqual(a, b);
  assert.equal(a, realpathSync(a), "the real path, so /var and /private/var never differ");
  assert.ok(a.startsWith(realpathSync(tmpdir()) + sep), `${a} is not under the temp folder`);
  assert.match(basename(a), /^temp-dir-real-/);
});

test("a passing file's homes are gone once its process exits, its own after hook having found them", () => {
  const { run, report, left, probeTmp } = runProbe("pass");
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.equal(report.afterHook, "found its home");
  assert.equal(report.homes.length, 2);
  for (const home of report.homes) {
    assert.ok(
      home.startsWith(probeTmp + sep),
      `${home} is not the real path under the probe's TMPDIR`,
    );
    assert.equal(existsSync(home), false, `${home} survived`);
  }
  // A directory the file made itself is not the helper's to remove (A12).
  assert.deepEqual(left, [basename(report.beside)]);
});

test("a failing file still fails, and its homes are gone too", () => {
  const { run, report, left } = runProbe("fail");
  assert.equal(run.status, 1, run.stdout + run.stderr);
  for (const home of report.homes) assert.equal(existsSync(home), false, `${home} survived`);
  assert.deepEqual(left, [basename(report.beside)]);
});

test("a home that cannot be removed costs one stderr line, and the verdict stands", {
  skip: process.getuid?.() === 0 ? "root removes anything" : false,
}, () => {
  const { run, report, left } = runProbe("stuck");
  assert.ok(report.stuck, "the probe made no stuck home");
  try {
    assert.equal(run.status, 0, run.stdout + run.stderr);
    const lines = `${run.stdout}${run.stderr}`
      .split("\n")
      .filter((line) => line.includes("tempDir: could not remove"));
    assert.equal(lines.length, 1, lines.join("\n"));
    assert.ok(lines[0].includes(`tempDir: could not remove ${report.stuck}: E`), lines[0]);
    assert.ok(
      left.includes(basename(report.stuck)),
      "the stuck home is left for the check to report",
    );
  } finally {
    // Unlocked, so this file's own exit removes it with the rest.
    chmodSync(join(report.stuck, "locked"), 0o700);
  }
});
