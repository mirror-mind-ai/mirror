// CV22.DS10.US3 plateau 1 -- one resolver for every reader of the tree.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

import { runningTreeRoot } from "#runtime/treeRoot.ts";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");

test("the running tree root is this repository, wherever the process was started", () => {
  // The resolver is anchored at the module's own file, so the cwd -- which
  // for a skill run inside Pi is the user's project, and for an installed
  // package is anything -- plays no part.
  assert.equal(runningTreeRoot(), REPO_ROOT);
  assert.ok(existsSync(join(runningTreeRoot(), "package.json")));
  assert.ok(existsSync(join(runningTreeRoot(), "templates", "identity")));
  assert.ok(existsSync(join(runningTreeRoot(), "docs", "releases")));
});
