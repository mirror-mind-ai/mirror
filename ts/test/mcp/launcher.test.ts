// CV22.DS9.TS2 plateau 3 — the launcher the plugin manifest points at.
//
// DS9's D5 chose a launcher-level bridge over "revert by editing the installed
// plugin", because a revert that requires editing an installed plugin is not one
// a user can perform under pressure. This grades that bridge.
//
// Every case runs from a cwd that is NOT the repository, with the launcher
// copied where Claude Code would copy a plugin -- a directory that is no
// Mirror tree -- and the `mirror` bin first on a scratch PATH, so the
// launcher's own resolution is under test (CV22.DS10.US3 plateau 3, D5).
//
// Which engine answered is graded by observation, not by `serverInfo`: D4 makes
// the two engines report the same version on purpose, so the Python branch is
// proven by a stub `python3` that records its argv, and the TS branch by a JSON
// answer appearing at all.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { bootstrapDatabase } from "#db/bootstrap.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const TS_ROOT = join(HERE, "..", "..");
const REPO_ROOT = join(TS_ROOT, "..");
const REAL_LAUNCHER = join(REPO_ROOT, "plugins", "mirror-mind", "mcp", "launch.sh");

const INITIALIZE = `${JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {},
})}\n`;

interface Harness {
  launcher: string;
  /** Where the stub `python3` records its argv, when the Python branch runs. */
  pythonMarker: string;
  binDir: string;
  dbPath: string;
  cleanup: () => void;
}

/**
 * A plugin cache: the real launcher copied into it, a `.env` beside the
 * plugin under test control (which the launcher must NOT read), the `mirror`
 * bin on a scratch PATH as npm's global bin links it, and a stub `python3`
 * first on that PATH.
 *
 * The stub matters beyond convenience: `memory` is NOT importable from a bare
 * `python3` on this machine, so a real Python branch would fail with
 * ModuleNotFoundError and prove nothing about the launcher's routing.
 */
function harness(envFile: string | null): Harness {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-launcher-"));
  mkdirSync(join(dir, "plugins", "mirror-mind", "mcp"), { recursive: true });
  const launcher = join(dir, "plugins", "mirror-mind", "mcp", "launch.sh");
  copyFileSync(REAL_LAUNCHER, launcher);
  chmodSync(launcher, 0o755);
  if (envFile !== null) writeFileSync(join(dir, ".env"), envFile, "utf-8");

  const binDir = join(dir, "bin");
  mkdirSync(binDir);
  symlinkSync(join(REPO_ROOT, "bin", "mirror.js"), join(binDir, "mirror"));
  const pythonMarker = join(dir, "python-argv.txt");
  writeFileSync(
    join(binDir, "python3"),
    `#!/bin/sh\nprintf '%s\\n' "$*" > "${pythonMarker}"\nexit 0\n`,
    "utf-8",
  );
  chmodSync(join(binDir, "python3"), 0o755);

  const dbPath = join(dir, "memory.db");
  bootstrapDatabase(dbPath).close();

  return {
    launcher,
    pythonMarker,
    binDir,
    dbPath,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

interface RunResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

function runLauncher(h: Harness, extraEnv: Record<string, string> = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: `${h.binDir}:${process.env.PATH ?? ""}`,
      DB_PATH: h.dbPath,
    };
    delete env.NODE_OPTIONS;
    delete env.MIRROR_MCP_VERSION;
    delete env.MIRROR_TS_MCP;
    Object.assign(env, extraEnv);
    // A cwd that is not the repository: a client spawns this from the user's
    // project, and CV21's plugin contract forbids a repo-cwd assumption.
    const child = spawn(h.launcher, [], { cwd: tmpdir(), env, stdio: "pipe" });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", (chunk: string) => (stdout += chunk));
    child.stderr.on("data", (chunk: string) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout, stderr, code }));
    child.stdin.write(INITIALIZE);
    child.stdin.end();
  });
}

function serverInfo(stdout: string): { name: string; version: string } {
  const line = stdout.split("\n").filter(Boolean)[0];
  assert.ok(line, "the server answered nothing");
  return JSON.parse(line).result.serverInfo;
}

test("by default the launcher runs the TypeScript server", async () => {
  const h = harness(null);
  try {
    const run = await runLauncher(h);
    assert.equal(serverInfo(run.stdout).name, "mirror-mind");
    assert.equal(run.code, 0);
    assert.ok(!existsSync(h.pythonMarker), "the Python branch must not have run");
  } finally {
    h.cleanup();
  }
});

// CV22.DS10.TS5 removed the MIRROR_TS_MCP gate and the Python branch.
//
// Four cases lived here: the gate honored from the environment, from `.env`,
// the last assignment winning, and the environment outranking the file. They
// graded a revert to an engine that is being deleted -- and a gate that can
// only select a missing engine is worse than no gate, because a stale value in
// someone's `.env` would produce a dead server rather than a reverted one.
//
// What replaces them is the assertion that the gate cannot do anything at all,
// in either direction, plus `runtime diagnose` reporting any leftover
// MIRROR_TS_* variable as inert (hooks.test.ts).
test("a stale MIRROR_TS_MCP value cannot revert anything, from the environment or .env", async () => {
  for (const [label, envFile, env] of [
    ["environment", null, { MIRROR_TS_MCP: "0" }],
    [".env", "MIRROR_TS_MCP=0\n", {}],
    ["both", "MIRROR_TS_MCP=0\n", { MIRROR_TS_MCP: "0" }],
  ] as [string, string | null, Record<string, string>][]) {
    const h = harness(envFile);
    try {
      const run = await runLauncher(h, env);
      assert.equal(serverInfo(run.stdout).name, "mirror-mind", label);
      assert.equal(run.code, 0, label);
      assert.ok(!existsSync(h.pythonMarker), `${label}: nothing may spawn an interpreter`);
    } finally {
      h.cleanup();
    }
  }
});

test("a commented, similarly-named, or absent gate leaves TypeScript serving", async () => {
  // The DS8 validation holdback lived as commented gates in `.env`, so a
  // commented line must not revert anything -- and neither must someone else's
  // variable that merely contains the gate's name.
  for (const file of [
    "# MIRROR_TS_MCP=0\nSOMETHING_ELSE=1\n",
    "NOT_MIRROR_TS_MCP=0\n",
    "MIRROR_TS_MCP_EXTRA=0\n",
  ]) {
    const h = harness(file);
    try {
      const run = await runLauncher(h);
      assert.equal(serverInfo(run.stdout).name, "mirror-mind", `should not revert on: ${file}`);
      assert.ok(!existsSync(h.pythonMarker), `should not revert on: ${file}`);
    } finally {
      h.cleanup();
    }
  }
});

test("the environment reaches the server, and a .env beside the plugin is NOT read", async () => {
  // The client's environment is not the skill's: no `.env`, no NODE_OPTIONS,
  // any cwd. Until CV22.DS10.US3 the launcher passed --env-file-if-exists for
  // the .env three levels up from itself; a plugin copied into Claude Code's
  // cache has no such file, and a file that happened to be there would belong
  // to whoever owns that directory. Configuration is the entry's job now (D3):
  // its own tree's .env and the user's config file, never the plugin's.
  const both = harness("MIRROR_MCP_VERSION=1.1.1\n");
  try {
    const run = await runLauncher(both, { MIRROR_MCP_VERSION: "2.2.2" });
    assert.equal(serverInfo(run.stdout).version, "2.2.2", "the environment must reach the server");
  } finally {
    both.cleanup();
  }

  const fromFile = harness("MIRROR_MCP_VERSION=3.3.3\n");
  try {
    const run = await runLauncher(fromFile);
    assert.notEqual(
      serverInfo(run.stdout).version,
      "3.3.3",
      "a plugin-local .env must not be read",
    );
  } finally {
    fromFile.cleanup();
  }
});

test("no .env at all still serves — the file is optional, not required", async () => {
  const h = harness(null);
  try {
    const run = await runLauncher(h);
    assert.equal(run.code, 0);
    assert.equal(serverInfo(run.stdout).name, "mirror-mind");
  } finally {
    h.cleanup();
  }
});
