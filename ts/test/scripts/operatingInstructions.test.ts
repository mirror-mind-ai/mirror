// CV22.DS10.US3 plateau 1, decision D13 -- the operating instructions ship.
//
// Until this story AGENTS.md was a symlink to CLAUDE.md, and the one file held
// both Mirror's Operating Instructions (the modes, the persona signature, the
// Builder boundary, the Ariad transport invariant) and this repository's
// Project Context. An installed package shipped neither, so a session that
// answered /mm-mirror still did not behave as a mirror. Now AGENTS.md is the
// instructions alone, in the tarball, read natively by Pi and Codex from a
// project root; CLAUDE.md imports it and adds the Project Context for Claude
// Code and Gemini CLI, which expand @imports. Pi loads ONE context file per
// directory, AGENTS.md first, which is why the split goes this way round.

import assert from "node:assert/strict";
import { lstatSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const agents = readFileSync(join(REPO_ROOT, "AGENTS.md"), "utf8");
const claude = readFileSync(join(REPO_ROOT, "CLAUDE.md"), "utf8");

test("AGENTS.md is a real file holding the Operating Instructions and nothing about this repository", () => {
  assert.ok(lstatSync(join(REPO_ROOT, "AGENTS.md")).isFile(), "a symlink would not ship");
  assert.match(agents, /^## Mirror Operating Instructions$/m);
  assert.match(agents, /^### Operating Modes$/m);
  assert.match(agents, /Ariad surface transport invariant/);
  assert.match(agents, /Builder activation boundary/);
  assert.doesNotMatch(agents, /^## Project Context/m);
  assert.doesNotMatch(agents, /TDD for behavior changes/);
});

test("CLAUDE.md imports AGENTS.md and holds the Project Context alone", () => {
  assert.match(claude, /^@AGENTS\.md$/m);
  assert.match(claude, /^## Project Context/m);
  assert.doesNotMatch(claude, /^## Mirror Operating Instructions$/m);
});
