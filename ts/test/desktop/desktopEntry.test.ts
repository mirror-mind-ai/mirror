// CV24.DS1 — `mirror-mind/desktop`, imported the way Mirror Desktop will.
//
// The entry's whole difficulty is where it runs: under `node_modules`, where
// Node refuses to strip TypeScript types. Run inside this checkout it would
// pass whether or not it registers the hook, so these tests copy the shipped
// subset into a scratch project's `node_modules/mirror-mind` and import it by
// package name from a separate Node process, with no flags and no Mirror
// variable in the environment.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, test } from "node:test";

import { bootstrapDatabase } from "#db/bootstrap.ts";
import { tempDir } from "#helpers/tempDir.ts";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");

/** A scratch project with this package installed, as npm lays it out. */
function project(): string {
  const root = tempDir("mirror-desktop-entry-");
  const pkg = join(root, "node_modules", "mirror-mind");
  mkdirSync(join(pkg, "ts"), { recursive: true });
  for (const part of ["bin", "lib", "ts/src", "package.json"]) {
    cpSync(join(REPO_ROOT, part), join(pkg, part), { recursive: true });
  }
  // The one runtime dependency, where npm would hoist it.
  symlinkSync(join(REPO_ROOT, "node_modules", "yaml"), join(root, "node_modules", "yaml"));
  return root;
}

function run(cwd: string, code: string, ...args: string[]) {
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? "", HOME: cwd };
  return spawnSync(process.execPath, ["--input-type=module", "-e", code, ...args], {
    cwd,
    env,
    encoding: "utf8",
  });
}

const PROBE = `
const mine = () => {};
process.on("warning", mine);
const desktop = await import("mirror-mind/desktop");
const report = desktop.inspectMigrationState(process.argv[1]);
console.log(JSON.stringify({
  api: desktop.DESKTOP_API_VERSION,
  names: Object.keys(desktop).sort(),
  state: report.state,
  pending: report.pending,
  warningListenerKept: process.listeners("warning").includes(mine),
}));
`;

describe("mirror-mind/desktop from node_modules", () => {
  test("imports by package name, with no flags, and reports a database", () => {
    const root = project();
    const dbPath = join(root, "tmp-home", "memory.db");
    mkdirSync(join(root, "tmp-home"));
    bootstrapDatabase(dbPath).close();

    const result = run(root, PROBE, dbPath);
    assert.equal(result.status, 0, result.stderr);
    const out = JSON.parse(result.stdout);
    assert.equal(out.api, 1);
    assert.deepEqual(out.names, [
      "ConversationCallRejectedError",
      "DESKTOP_API_VERSION",
      "DatabaseNotCurrentError",
      "appendConversationMessages",
      "ensureConversation",
      "inspectMigrationState",
      "rebindConversationJourney",
      "renameConversation",
    ]);
    assert.equal(out.state, "current");
    assert.deepEqual(out.pending, []);
  });

  test("leaves the host's warning listeners alone", () => {
    // A bin owns its process and filters warnings; a library runs inside a host
    // that does not expect its listeners removed.
    const root = project();
    const result = run(root, PROBE, join(root, "nothing-here.db"));
    assert.equal(result.status, 0, result.stderr);
    const out = JSON.parse(result.stdout);
    assert.equal(out.state, "missing");
    assert.equal(out.warningListenerKept, true);
  });

  test("exposes nothing but the entry and the manifest", () => {
    const root = project();
    const deep = run(root, `await import("mirror-mind/ts/src/db/migrationReport.ts");`);
    assert.notEqual(deep.status, 0);
    assert.match(deep.stderr, /ERR_PACKAGE_PATH_NOT_EXPORTED/);
    const manifest = run(
      root,
      `import { createRequire } from "node:module"; console.log(createRequire(process.cwd() + "/x.js")("mirror-mind/package.json").name);`,
    );
    assert.equal(manifest.status, 0, manifest.stderr);
    assert.equal(manifest.stdout.trim(), "mirror-mind");
  });
});
