// CR019 — a Plan carries a project's own rules only by pointing to the development
// guide Prepare already looks for. The guide is never parsed, and a missing guide adds
// nothing: absence of that file is not absence of rules.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { DEVELOPMENT_GUIDE_PATH, projectContractRules } from "#builder/prepare.ts";

const roots: string[] = [];

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function project(withGuide: boolean): string {
  const root = mkdtempSync(join(tmpdir(), "cr019-prepare-"));
  roots.push(root);
  if (withGuide) {
    mkdirSync(join(root, "docs/process"), { recursive: true });
    writeFileSync(join(root, DEVELOPMENT_GUIDE_PATH), "# Development Guide\n", "utf8");
  }
  return root;
}

test("CR019: the guide Prepare reports is the one a Plan points to", () => {
  assert.equal(DEVELOPMENT_GUIDE_PATH, "docs/process/development-guide.md");
});

test("CR019: a project's contract rules are one pointer to its guide, or nothing", () => {
  assert.deepEqual(projectContractRules(project(true)), [
    "Follow the project's development guide: docs/process/development-guide.md.",
  ]);
  assert.deepEqual(projectContractRules(project(false)), [], "a missing guide adds nothing");
  assert.deepEqual(projectContractRules(null), [], "no project path, no project rules");
});
