// How each runtime is wired to an installed Mirror Mind. CV22.DS10.US3 plateau 3.
//
// `mirror init` prints these for the runtimes it finds on the PATH, so the
// person who just created a home is handed the next line rather than a page.
// Printing is not automating: the `runtime install <runtime>` non-goal stands,
// and every step here is one the person runs and can read first.
//
// Each step was verified at plateau 3 against the runtime's own documentation
// or, where the docs were silent, against the runtime itself from a scratch
// configuration directory (test guide, route 3):
//
//   Pi          `pi install <path>` loads a package from a local path without
//               copying (D6); the manifest's `pi` key names the extension and
//               the skills. One step.
//   Claude Code a plugin directory under `~/.claude/skills/` loads every
//               session as `<name>@skills-dir` with its skills, hooks, and MCP
//               server (`claude plugin list` / `details`, 2.1.283). One step.
//               The Operating Instructions arrive through the plugin's
//               SessionStart hook (D13).
//   Codex       `codex plugin marketplace add <root>` reads the package's
//               `.agents/plugins/marketplace.json`, and `codex plugin add
//               mirror-mind@mirror-mind` copies the plugin into Codex's cache
//               with its skills, hooks, and MCP server (0.162.1, CV21.DS12.TS2
//               static 5-7; CV21.DS4.US1). Two steps. Codex asks once, at the
//               next session, to trust the plugin's hooks (L1); the Operating
//               Instructions then arrive through its SessionStart hook as a
//               developer message (L4). Until DS4.US1 the two steps were a
//               skills link and an AGENTS.md link, with sessions run through
//               the shipped wrapper.
//   Antigravity `agy plugin install <plugin dir>` stages the plugin with its
//               agy-native layer in one step (CV21.DS7.US1, agy 1.4.2).
//
// Gemini CLI had an entry here (a skills link, then four hooks merged into
// `~/.gemini/settings.json` by absolute path) until CV21.DS8.US1 retired the
// integration; Antigravity is its successor.

import { join } from "node:path";
import { commandOnPath } from "#util/paths.ts";

export type RuntimeName = "pi" | "claude" | "codex" | "antigravity";

/**
 * The one Codex level-up command (CV21.DS4.TS6). Codex 0.163.0 has no
 * plugin-update verb, so re-adding is how a cached plugin reaches the
 * installed version. One constant so the wiring line `mirror init` prints
 * and the recommendation `runtime diagnose` prints cannot disagree (the
 * CR071 lesson at the string level).
 */
export const CODEX_PLUGIN_ADD_COMMAND = "codex plugin add mirror-mind@mirror-mind";

export interface RuntimeWiring {
  /** The runtime, as a person names it. */
  readonly title: string;
  /** The command whose presence on the PATH means the runtime is installed. */
  readonly command: string;
  /** What to run or edit, one entry per step, built from the package root. */
  readonly steps: readonly ((root: string) => readonly string[])[];
}

export const RUNTIME_WIRING: Readonly<Record<RuntimeName, RuntimeWiring>> = {
  pi: {
    title: "Pi",
    command: "pi",
    steps: [(root) => [`pi install "${root}"`]],
  },
  claude: {
    title: "Claude Code",
    command: "claude",
    steps: [
      (root) => [
        `ln -s "${join(root, "plugins/mirror-mind")}" ~/.claude/skills/mirror-mind`,
        "(the plugin loads every session: its skills, the hooks, and the MCP server)",
      ],
    ],
  },
  antigravity: {
    title: "Antigravity",
    command: "agy",
    steps: [
      // CV21.DS7.US1, probed on agy 1.4.2: one command stages the 25 skills
      // and the agy-native layer (the root plugin.json marker makes agy
      // treat the directory as a native plugin; without it, install converts
      // the Claude surfaces and overwrites the layer's hooks file). Per-turn
      // injection and logging land with DS7's TS2/TS3; this line promises
      // the install, nothing more.
      (root) => [`agy plugin install "${root}/plugins/mirror-mind"`],
    ],
  },
  codex: {
    title: "Codex",
    command: "codex",
    steps: [
      (root) => [`codex plugin marketplace add "${root}"`],
      () => [
        CODEX_PLUGIN_ADD_COMMAND,
        "(Codex asks once, at the next session, to trust the plugin's hooks; the plugin",
        "then loads every session: its skills, the hooks, and the MCP server)",
      ],
    ],
  },
};

const ORDER: readonly RuntimeName[] = ["pi", "claude", "codex", "antigravity"];

/** The runtimes whose command is on the PATH, in display order. */
export function detectRuntimes(
  env: NodeJS.ProcessEnv,
  isExecutable: (path: string) => boolean,
): RuntimeName[] {
  return ORDER.filter(
    (runtime) => commandOnPath(RUNTIME_WIRING[runtime].command, env, isExecutable) !== null,
  );
}

/** The wiring for one runtime, numbered when there is more than one step. */
export function runtimeWiringLines(runtime: RuntimeName, root: string): string[] {
  const wiring = RUNTIME_WIRING[runtime];
  const lines: string[] = [`${wiring.title}:`];
  wiring.steps.forEach((step, index) => {
    const [first = "", ...rest] = step(root);
    const prefix = wiring.steps.length > 1 ? `${index + 1}. ` : "";
    lines.push(`  ${prefix}${first}`);
    for (const line of rest) lines.push(`  ${" ".repeat(prefix.length)}${line}`);
  });
  return lines;
}
