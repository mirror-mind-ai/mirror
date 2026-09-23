#!/usr/bin/env node
// Fail CI when a skill copy reaches Python, or when the three copies disagree
// about a command's entry point. (CV22.DS10.US2, decision D6)
//
// The Node successor to `scripts/check_skill_command_parity.py`. The port is
// not cosmetic: a guard whose job is to assert that nothing invokes the Python
// interpreter cannot itself require that interpreter to run. After TS5 there
// would be nothing left to execute the Python version, and the check that
// proves Python is gone would be the last thing keeping it.
//
// The ALLOWLIST MECHANISM IS DELETED, not emptied. CR072 introduced it so that
// each remaining Python invocation had to name the story that owed its port;
// by the end of CV22.DS10.US2 every entry was paid off. Keeping an empty
// dictionary would invite the next story to add a row to it, which is exactly
// the escape hatch DS10's Skill Invocation Gate exists to close. The assertion
// is now absolute: no skill copy, and no file in the packaged plugin, may
// invoke `uv run python -m memory`.
//
// What is checked, and what deliberately is not:
//
//   * CHECKED -- `.claude` and `plugins/mirror-mind` skill copies are
//     byte-identical.
//   * CHECKED -- for every command a skill documents, all three copies reach
//     it through the same entry point.
//   * CHECKED -- ABSENCE of `uv run python -m memory` in all three skill
//     trees AND anywhere in `plugins/mirror-mind/` (manifest, commands, hooks,
//     skills), which is the packaged-plugin half of the gate: an installed
//     user resolves that directory, not this repository's `.pi/`.
//   * NOT CHECKED -- argument spellings, frontmatter names, per-runtime Usage
//     sections, or the Portuguese/English examples. Those differences are
//     deliberate (CR071).
//
// Usage:  node ts/scripts/checkSkillCommandParity.ts

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const REPO_ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const PI_ROOT = join(REPO_ROOT, ".pi", "skills");
const CLAUDE_ROOT = join(REPO_ROOT, ".claude", "skills");
const PLUGIN_DIR = join(REPO_ROOT, "plugins", "mirror-mind");
const PLUGIN_ROOT = join(PLUGIN_DIR, "skills");

const FRONT_DOOR_RE = /ts\/src\/frontDoor\/cli\.ts\s+(?<rest>.+)$/;
const PYTHON_RE = /uv run python -m memory\s*(?<rest>.*)$/;

type EntryPoint = "front-door" | "python";

function exists(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

/** The command a documented invocation reaches, ignoring its arguments. */
function commandName(rest: string): string {
  for (const token of rest.split(/\s+/)) {
    if (token.startsWith("-") || token.startsWith("<") || token.startsWith("[")) break;
    if (token.startsWith("$") || token.startsWith('"')) break;
    return token;
  }
  return rest.trim();
}

function entryPoints(path: string): Map<string, Set<EntryPoint>> {
  const found = new Map<string, Set<EntryPoint>>();
  for (const line of read(path).split("\n")) {
    for (const [pattern, entry] of [
      [FRONT_DOOR_RE, "front-door"],
      [PYTHON_RE, "python"],
    ] as const) {
      const match = pattern.exec(line);
      if (match?.groups) {
        const command = commandName(match.groups.rest ?? "");
        const set = found.get(command) ?? new Set<EntryPoint>();
        set.add(entry);
        found.set(command, set);
        break;
      }
    }
  }
  return found;
}

function copiesOf(skill: string): Record<string, string> {
  return {
    ".pi": join(PI_ROOT, skill, "SKILL.md"),
    ".claude": join(CLAUDE_ROOT, skill, "SKILL.md"),
    "plugins/mirror-mind": join(PLUGIN_ROOT, skill, "SKILL.md"),
  };
}

function checkByteIdentity(skill: string, problems: string[]): void {
  const claude = join(CLAUDE_ROOT, skill, "SKILL.md");
  const plugin = join(PLUGIN_ROOT, skill, "SKILL.md");
  if (!exists(claude) || !exists(plugin)) {
    problems.push(`${skill}: missing a .claude or plugins/mirror-mind copy`);
    return;
  }
  if (!readFileSync(claude).equals(readFileSync(plugin))) {
    problems.push(`${skill}: .claude and plugins/mirror-mind copies are not byte-identical`);
  }
}

function checkEntryPoints(skill: string, problems: string[]): void {
  const present = Object.entries(copiesOf(skill)).filter(([, path]) => exists(path));
  if (present.length < 2) return;

  const maps = present.map(([label, path]) => [label, entryPoints(path)] as const);
  const commands = new Set<string>();
  for (const [, map] of maps) for (const command of map.keys()) commands.add(command);

  for (const command of [...commands].sort()) {
    const documented = maps
      .map(([label, map]) => [label, map.get(command)] as const)
      .filter((pair): pair is readonly [string, Set<EntryPoint>] => pair[1] !== undefined);
    // A command only one copy documents is a prose difference, not a flip that
    // missed a copy. Out of scope by design.
    if (documented.length < 2) continue;

    const shapes = new Set(documented.map(([, set]) => [...set].sort().join("+")));
    if (shapes.size > 1) {
      const detail = documented.map(([label, set]) => `${label}=${[...set].sort().join("+")}`);
      problems.push(`${skill}: \`${command}\` disagrees on entry point -> ${detail.join(", ")}`);
    }
  }
}

/** Every file under a directory, recursively. */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

/**
 * The gate's own assertion: the Python entry point is ABSENT, not merely
 * agreed upon. Scans the three skill trees and the WHOLE packaged plugin --
 * manifest, commands, hooks, skills -- because an installed user resolves that
 * directory rather than this repository's `.pi/`.
 */
function checkPythonAbsent(problems: string[]): void {
  const roots = [PI_ROOT, CLAUDE_ROOT, PLUGIN_DIR].filter(exists);
  for (const root of roots) {
    for (const path of walk(root)) {
      if (/\.(png|jpg|jpeg|gif|zip|ico)$/i.test(path)) continue;
      let text: string;
      try {
        text = read(path);
      } catch {
        continue;
      }
      text.split("\n").forEach((line, index) => {
        if (PYTHON_RE.test(line)) {
          problems.push(
            `${relative(REPO_ROOT, path)}:${index + 1} invokes \`uv run python -m memory\` — ` +
              "route it through the front door (CV22.DS10 Skill Invocation Gate)",
          );
        }
      });
    }
  }
}

export function main(): number {
  if (!exists(PI_ROOT)) {
    process.stderr.write(`skill parity check: ${PI_ROOT} not found\n`);
    return 1;
  }
  const problems: string[] = [];
  const skills = readdirSync(PI_ROOT)
    .filter((name) => statSync(join(PI_ROOT, name)).isDirectory())
    .sort();

  for (const skill of skills) {
    checkByteIdentity(skill, problems);
    checkEntryPoints(skill, problems);
  }
  checkPythonAbsent(problems);

  if (problems.length > 0) {
    process.stdout.write("skill command parity: DRIFT DETECTED\n\n");
    for (const problem of problems) process.stdout.write(`  ${problem}\n`);
    process.stdout.write(
      "\nRemediation: a flip must update the invocation in ALL THREE skill copies.\n" +
        "Switch the lagging copies to the same entry point `.pi` uses; leave argument\n" +
        "spellings and the Portuguese/English examples alone (CR071). There is no\n" +
        "allowlist: CV22.DS10.US2 paid off the last entry and deleted the mechanism,\n" +
        "because a Python invocation cannot be correct once Python is gone.\n",
    );
    return 1;
  }

  process.stdout.write(
    `skill command parity: clean -- ${skills.length} skills agree on every entry point, ` +
      "and no copy invokes Python.\n",
  );
  return 0;
}

if (import.meta.filename === process.argv[1]) {
  process.exit(main());
}
