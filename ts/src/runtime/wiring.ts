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
//   Gemini CLI  `gemini skills link --consent <dir>` links every skill in the
//               directory into `~/.gemini/skills/` (0.61.0; a nested directory
//               symlink is NOT discovered, the user tier is one level deep),
//               and hooks live in `~/.gemini/settings.json`, absolute paths.
//               Two steps. The Operating Instructions arrive through the
//               SessionStart hook (D13).
//   Codex       `~/.codex/skills/<dir>` is discovered recursively, and
//               `~/.codex/AGENTS.md` is the global instructions file
//               (`codex debug prompt-input`, 0.157.0). Two steps, and the
//               session is run through the shipped wrapper, since Codex has
//               no hooks this integration uses.

import { join } from "node:path";

export type RuntimeName = "pi" | "claude" | "gemini" | "codex";

export interface RuntimeWiring {
  /** The runtime, as a person names it. */
  readonly title: string;
  /** The command whose presence on the PATH means the runtime is installed. */
  readonly command: string;
  /** What to run or edit, one entry per step, built from the package root. */
  readonly steps: readonly ((root: string) => readonly string[])[];
}

/** Gemini CLI's four hooks, as the user-level settings.json wants them. */
function geminiHooksSettings(root: string): string {
  const hook = (event: string, name: string, script: string) =>
    `    "${event}": [{ "hooks": [{ "name": "mirror-${name}", "type": "command", "command": "${join(root, ".gemini/hooks", script)}", "timeout": 30000 }] }]`;
  return [
    "{",
    '  "hooks": {',
    [
      hook("SessionStart", "session-start", "session-start.sh"),
      hook("BeforeAgent", "log-user", "log-user.sh"),
      hook("AfterAgent", "log-assistant", "log-assistant.sh"),
      hook("SessionEnd", "session-end", "session-end.sh"),
    ].join(",\n"),
    "  }",
    "}",
  ].join("\n");
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
        "(the plugin loads every session: skills under /mm:, the hooks, and the MCP server)",
      ],
    ],
  },
  gemini: {
    title: "Gemini CLI",
    command: "gemini",
    steps: [
      (root) => [`gemini skills link --consent "${join(root, ".pi/skills")}"`],
      (root) => [
        "merge into ~/.gemini/settings.json:",
        ...geminiHooksSettings(root)
          .split("\n")
          .map((line) => `  ${line}`),
      ],
    ],
  },
  codex: {
    title: "Codex",
    command: "codex",
    steps: [
      (root) => [`ln -s "${join(root, ".pi/skills")}" ~/.codex/skills/mirror-mind`],
      (root) => [
        `ln -s "${join(root, "AGENTS.md")}" ~/.codex/AGENTS.md`,
        "(or append that file to the ~/.codex/AGENTS.md you already have)",
        `then start Codex through "${join(root, "scripts/codex-mirror.sh")}" instead of codex`,
      ],
    ],
  },
};

const ORDER: readonly RuntimeName[] = ["pi", "claude", "gemini", "codex"];

/** The runtimes whose command is on the PATH, in display order. */
export function detectRuntimes(
  env: NodeJS.ProcessEnv,
  isExecutable: (path: string) => boolean,
): RuntimeName[] {
  const dirs = (env.PATH ?? "").split(":").filter(Boolean);
  return ORDER.filter((runtime) =>
    dirs.some((dir) => isExecutable(join(dir, RUNTIME_WIRING[runtime].command))),
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
