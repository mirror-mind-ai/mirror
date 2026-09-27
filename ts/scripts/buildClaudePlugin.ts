#!/usr/bin/env node
// Generate the canonical Mirror Mind Claude plugin (manifest + skills), and the
// Claude Code copies of Pi-sourced skills (CR102).
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
import { PI_SOURCED_SKILLS } from "#guards/piSourcedSkills.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function main(argv: readonly string[]): number {
  const check = argv.includes("--check");
  let problems: string[];
  try {
    problems = materialize(REPO_ROOT, { write: !check });
  } catch (error) {
    // A refusal comes before any write: say why, in one line.
    console.error(`buildClaudePlugin: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  if (check) {
    if (problems.length > 0) {
      console.log(
        "Generated Claude files are out of date (the plugin from .claude/skills/, " +
          "Pi-sourced skills from .pi/skills/):",
      );
      for (const problem of problems) console.log(`  - ${problem}`);
      console.log("\nRegenerate with: node ts/scripts/buildClaudePlugin.ts");
      return 1;
    }
    console.log("Claude plugin and Pi-sourced Claude skills are in sync.");
    return 0;
  }

  console.log(`Generated Claude plugin under ${join(PLUGIN_DIR)}`);
  console.log(`Generated the Claude copies of Pi-sourced skills: ${PI_SOURCED_SKILLS.join(", ")}`);
  return 0;
}

process.exit(main(process.argv.slice(2)));
