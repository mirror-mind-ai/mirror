// CV22.DS7.US8 — the Builder revert survives a broken Builder core.

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

test("MIRROR_TS_BUILD=0 reaches Python when the lazy Builder boundary throws", () => {
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
  // A developer shell's own revert must not make the broken run pass vacuously.
  delete base.MIRROR_TS_BUILD;

  try {
    // The shipped default, with no gate in the environment.
    const broken = run(["build", "inspect-method", "ariad"], base);
    assert.equal(broken.status, 1);
    assert.match(broken.stderr, /BROKEN_BUILDER_CORE/);

    const reverted = run(["build", "inspect-method", "ariad"], {
      ...base,
      MIRROR_TS_BUILD: "0",
    });
    assert.equal(reverted.status, 0, reverted.stderr);
    assert.match(reverted.stdout, /^■ Builder Method Available/);
    assert.doesNotMatch(reverted.stderr, /BROKEN_BUILDER_CORE/);

    const unrelated = run(["welcome", "--status-line"], base);
    assert.equal(unrelated.status, 0, unrelated.stderr);
    assert.doesNotMatch(unrelated.stderr, /BROKEN_BUILDER_CORE/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
