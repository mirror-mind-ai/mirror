// CV22.DS7.US8 — a broken Builder core breaks only the Builder commands.
//
// The Builder tree is imported lazily, so the rest of the front door never
// loads it. This test used to pin a second property, that `MIRROR_TS_BUILD=0`
// still reached Python with the core broken; the revert left with the Python
// engine at CV22.DS10.TS5, and the isolation is what remains.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { bootstrapDatabase } from "#db/bootstrap.ts";

const CLI = new URL("../../src/frontDoor/cli.ts", import.meta.url).pathname;
const REPO_ROOT = new URL("../../..", import.meta.url).pathname;

function run(cliArgs: string[], env: NodeJS.ProcessEnv, cwd = REPO_ROOT) {
  const result = spawnSync(process.execPath, [CLI, ...cliArgs], { cwd, encoding: "utf8", env });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test("a throwing Builder core fails `build` loudly and leaves other commands alone", () => {
  const root = mkdtempSync("/tmp/builder-broken-core-");
  const home = join(root, "home");
  mkdirSync(home, { recursive: true });
  bootstrapDatabase(join(home, "memory.db")).close();
  const hook = join(root, "hook.mjs");
  writeFileSync(
    hook,
    `import { registerHooks } from "node:module";\n` +
      `registerHooks({ resolve(specifier, context, nextResolve) {\n` +
      `  if (specifier === "#builder/index.ts") return { shortCircuit: true, url: "data:text/javascript,throw new Error('BROKEN_BUILDER_CORE')" };\n` +
      `  return nextResolve(specifier, context);\n` +
      `} });\n`,
  );
  const base: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: root,
    MIRROR_HOME: home,
    MIRROR_USER: "home",
    MEMORY_ENV: "",
    NODE_OPTIONS: `--no-warnings --import=${hook}`,
  };
  try {
    // The shipped default, with no gate in the environment.
    const broken = run(["build", "inspect-method", "ariad"], base);
    assert.equal(broken.status, 1);
    assert.match(broken.stderr, /BROKEN_BUILDER_CORE/);

    const unrelated = run(["welcome", "--status-line"], base);
    assert.equal(unrelated.status, 0, unrelated.stderr);
    assert.doesNotMatch(unrelated.stderr, /BROKEN_BUILDER_CORE/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
