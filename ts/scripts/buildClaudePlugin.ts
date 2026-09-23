#!/usr/bin/env node
// Generate the canonical Mirror Mind Claude plugin (manifest + skills).
//
// The Node port of `scripts/build_claude_plugin.py` (CV22.DS10.TS5, slice B,
// decision D6). Output must be byte-identical to the Python original's; the
// self-test proves it by planning both and comparing.
//
// Usage:
//   node ts/scripts/buildClaudePlugin.ts            # write the generated files
//   node ts/scripts/buildClaudePlugin.ts --check    # report drift, exit 1 if any

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { materialize, PLUGIN_DIR } from "#guards/claudePlugin.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function main(argv: readonly string[]): number {
  const check = argv.includes("--check");
  const problems = materialize(REPO_ROOT, { write: !check });

  if (check) {
    if (problems.length > 0) {
      console.log("Claude plugin is out of sync with .claude/skills/:");
      for (const problem of problems) console.log(`  - ${problem}`);
      console.log("\nRegenerate with: node ts/scripts/buildClaudePlugin.ts");
      return 1;
    }
    console.log("Claude plugin is in sync.");
    return 0;
  }

  console.log(`Generated Claude plugin under ${join(PLUGIN_DIR)}`);
  return 0;
}

process.exit(main(process.argv.slice(2)));
