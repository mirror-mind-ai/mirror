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
//   Grok Build  `grok plugin install <plugin dir> --trust` copies the plugin
//               under `~/.grok/installed-plugins/` and enables it: its skills,
//               the hooks, and the MCP server, with no prompt left to answer
//               (CV21.DS10.US1, probed on grok 1.0.62). Then a link under
//               `~/.grok/rules/` carries the Operating Instructions as a rule
//               Grok loads in every project (~2.2k tokens by Grok's count):
//               Grok shows a SessionStart hook's context on screen only and
//               ignores a prompt hook's (DS12.TS4 L2/L3), so the plugin's
//               session-start delivery of D13 does not reach its model. Two
//               steps. The shapes not chosen -- the Claude link alone (skills,
//               no hooks), a link in `~/.grok/plugins/` (loads nothing until
//               a config entry is hand-written) -- are in decisions.md.
//
// Gemini CLI had an entry here (a skills link, then four hooks merged into
// `~/.gemini/settings.json` by absolute path) until CV21.DS8.US1 retired the
// integration; Antigravity is its successor.

import { join } from "node:path";
import { commandOnPath } from "#util/paths.ts";

export type RuntimeName = "pi" | "claude" | "codex" | "antigravity" | "grok";

/**
 * The one Codex level-up command (CV21.DS4.TS6). Codex 0.163.0 has no
 * plugin-update verb, so re-adding is how a cached plugin reaches the
 * installed version. One constant so the wiring line `mirror init` prints
 * and the recommendation `runtime diagnose` prints cannot disagree (the
 * CR071 lesson at the string level).
 */
export const CODEX_PLUGIN_ADD_COMMAND = "codex plugin add mirror-mind@mirror-mind";

/** Where the plugin directory lives below an installed package. */
export function pluginDirectory(root: string): string {
  return join(root, "plugins/mirror-mind");
}

/**
 * The one Grok level-up command (CV21.DS10.US1). Grok copies a local-path
 * plugin and keys the copy by the path STRING: `grok plugin update` is a
 * no-op for it (it answers "local symlink, already live" over a real copy,
 * grok 1.0.62), an install over the same string is refused as already
 * installed, and a differently spelt string installs a second copy beside
 * the first. So the level-up is uninstall, then install with the path `init`
 * printed -- a function of the root, so `diagnose` and `update` cannot spell
 * it differently (the CR071 lesson at the string level).
 */
export function grokPluginReinstallCommand(root: string): string {
  return `grok plugin uninstall mirror-mind --confirm && ${grokPluginInstallCommand(root)}`;
}

function grokPluginInstallCommand(root: string): string {
  return `grok plugin install "${pluginDirectory(root)}" --trust`;
}

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
      // `mkdir -p` first: a home that has never held a personal skill has no
      // ~/.claude/skills/ yet, and the link alone fails there (CV21.DS5.US2's
      // route, on the extensions plugin's step; the same line, paid here).
      (root) => [
        `mkdir -p ~/.claude/skills && ln -s "${pluginDirectory(root)}" ~/.claude/skills/mirror-mind`,
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
  grok: {
    title: "Grok Build",
    command: "grok",
    steps: [
      // CV21.DS10.US1, probed on grok 1.0.62: one command copies the plugin
      // and enables it. Consent lives in the line: what --trust activates,
      // and that Grok asks nothing afterwards (Codex's note says Codex asks
      // once; Grok's must say it does not).
      (root) => [
        grokPluginInstallCommand(root),
        "(--trust activates the plugin's hooks and MCP server, and Grok does not ask again;",
        "Grok keeps a copy of the plugin, so after an update `mirror runtime diagnose`",
        "names the command that brings it level)",
      ],
      // The Operating Instructions (D13) as a home-level rule. Grok loads
      // every *.md under ~/.grok/rules/ in every project, link or file.
      (root) => [
        `ln -s "${join(root, "AGENTS.md")}" ~/.grok/rules/mirror-mind.md`,
        "(the Operating Instructions, loaded as a rule in every Grok session, in",
        "every project: about 2.2k tokens per session)",
      ],
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

const ORDER: readonly RuntimeName[] = ["pi", "claude", "codex", "antigravity", "grok"];

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

// ---------------------------------------------------------------------------
// The per-home extensions plugin (CV21.DS5.US2). A Mirror home's installed
// extensions reach the four plugin runtimes as one generated plugin per home,
// `<home>/runtime/plugin/mirror-ext-<user>/`, in the canonical plugin's format
// but carrying skills only (DS5.TS1's decision). Each runtime takes it the way
// it takes the canonical plugin, and the three that copy it (Codex, agy, Grok)
// need one command per change to bring the copy level — measured in TS1.
// `mirror init` prints none of this: at init there is no extension. The
// `extensions` verbs print the step a runtime still needs, and `runtime
// diagnose` names the reinstall for a stale copy. Printing is not automating.

export interface ExtensionPluginPaths {
  /** The plugin directory: linked by Claude Code, installed by agy and Grok. */
  readonly dir: string;
  /** The marketplace root Codex adds: the plugin's parent, carrying `.agents/plugins/marketplace.json`. */
  readonly marketplace: string;
  /** `mirror-ext-<user>`: the plugin's name and its marketplace's. */
  readonly name: string;
}

/** The consent line printed under Grok's step: what `--trust` would activate here, which is nothing. */
export const EXTENSION_PLUGIN_GROK_TRUST_NOTE =
  "(this plugin carries skills only — no hooks and no MCP server for --trust to activate)";

/** The one-time wiring per runtime; Pi takes extensions through its own catalog and needs none. */
export function extensionPluginWiringSteps(
  runtime: RuntimeName,
  paths: ExtensionPluginPaths,
): string[] {
  switch (runtime) {
    case "claude":
      // `mkdir -p` first: a home that has never held a personal skill has no
      // ~/.claude/skills/ yet, and the link alone fails there (measured, US2's route).
      return [`mkdir -p ~/.claude/skills && ln -s "${paths.dir}" ~/.claude/skills/${paths.name}`];
    case "codex":
      return [
        `codex plugin marketplace add "${paths.marketplace}"`,
        `codex plugin add ${paths.name}@${paths.name}`,
      ];
    case "antigravity":
      return [`agy plugin install "${paths.dir}"`];
    case "grok":
      return [`grok plugin install "${paths.dir}" --trust`];
    case "pi":
      return [];
  }
}

/**
 * What brings a runtime's copy level after the plugin changed, measured in
 * DS5.TS1: Codex re-adds at the same version when the marketplace serves the
 * live directory; agy installs again; Grok refuses an install over the same
 * path and must uninstall first. Claude Code links and has no copy.
 */
export function extensionPluginReinstallCommand(
  runtime: RuntimeName,
  paths: ExtensionPluginPaths,
): string | null {
  switch (runtime) {
    case "claude":
    case "pi":
      return null;
    case "codex":
      return `codex plugin add ${paths.name}@${paths.name}`;
    case "antigravity":
      return `agy plugin install "${paths.dir}"`;
    case "grok":
      return `grok plugin uninstall ${paths.name} --confirm && grok plugin install "${paths.dir}" --trust`;
  }
}
