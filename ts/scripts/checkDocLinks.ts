#!/usr/bin/env node
// Check the project's markdown docs for broken links and roadmap integrity.
//
// The Node port of `scripts/check_doc_links.py` (CV22.DS10.TS5, slice B).
// Output is byte-identical to the Python original's, because the two run side
// by side in CI for one commit and must agree on a clean tree AND on a seeded
// regression before the original is deleted -- the discipline US2 used to
// retire `check_skill_command_parity.py`.
//
// Usage:
//   node ts/scripts/checkDocLinks.ts
//
// Two independent, network-free, deterministic checks; exits 1 if either
// finds a problem, 0 if both are clean:
//
//   1. Every relative file link and anchor in every markdown file resolves.
//      Repo-relative links only, never external ones.
//   2. No two docs/project/roadmap/**/index.md files share a heading code --
//      the "one code -> one package" invariant Ariad's Expand depends on.
//
// Used by the `docs` CI workflow.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { checkRepo, checkRoadmapDuplicateHeadings } from "#docs/docsLint.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function main(): number {
  const linkProblems = checkRepo(REPO_ROOT);
  const duplicateProblems = checkRoadmapDuplicateHeadings(REPO_ROOT);

  if (linkProblems.length === 0 && duplicateProblems.length === 0) {
    console.log("docs link check: clean -- no broken relative links or anchors.");
    console.log("roadmap heading check: clean -- no duplicate heading codes.");
    return 0;
  }

  for (const problem of linkProblems) {
    console.log(`${problem.sourceFile}:${problem.line}: ${problem.reason} -> ${problem.target}`);
  }
  if (linkProblems.length > 0) {
    console.log(`\n${linkProblems.length} broken link(s)/anchor(s) found.`);
  }

  for (const problem of duplicateProblems) {
    console.log(`\nduplicate heading code '${problem.code}' claimed by:`);
    for (const path of problem.paths) console.log(`  - ${path}`);
  }
  if (duplicateProblems.length > 0) {
    console.log(`\n${duplicateProblems.length} duplicate roadmap heading code(s) found.`);
  }

  return 1;
}

process.exit(main());
