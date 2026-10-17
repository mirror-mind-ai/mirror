// Generate the canonical Mirror Mind Claude plugin (manifest + skills), the
// Codex marketplace that names it (CV21.DS4.US1), and the Claude Code copies of
// Pi-sourced skills.
//
// The Node port of `src/memory/plugins/claude.py` and its wrapper
// `scripts/build_claude_plugin.py` (CV22.DS10.TS5, slice B).
//
// The Zero Python gate assigns the builder to **US3**, on the grounds that US3
// decides what it builds. But it is a `.py` file, and TS5's done condition is
// that `git ls-files '*.py'` is empty -- so the file cannot survive this story
// whoever owns its content. Decision D6 resolves that: the port lands here,
// byte-identical in output; US3 still owns the shape of what it emits when the
// npm entry point becomes real.
//
// The plugin skills are generated from `.claude/skills/` (the Claude-tuned
// source), with one exception since CR102. A Pi-sourced skill
// (`piSourcedSkills.ts`) has one body in every runtime, so this module also
// generates its `.claude/skills/` copy from `.pi/skills/`, and takes its plugin
// copy from that generated content rather than from the file on disk. Hooks
// under `plugins/mirror-mind/hooks/` are hand-authored plugin source and are
// NOT managed by this module -- which is precisely why TS5's inventory had to
// find their interpreter spawns by reading them.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";

import { packageVersion } from "#runtime/version.ts";
import { claudeVariant, PI_SKILLS_DIR, PI_SOURCED_SKILLS } from "./piSourcedSkills.ts";

export const PLUGIN_NAME = "mirror-mind";
export const PLUGIN_DESCRIPTION =
  "Mirror Mind — local-first memory and identity for agentic runtimes.";
export const PLUGIN_AUTHOR = "Mirror Mind";

export const SKILLS_SOURCE_DIR = ".claude/skills";
export const PLUGIN_DIR = "plugins/mirror-mind";
export const SKILL_FILENAME = "SKILL.md";

/**
 * Where Codex reads a marketplace from, under the marketplace root, which for
 * the shipped package is the package root (CV21.DS4.US1; DS12.TS2 static 5).
 */
export const MARKETPLACE_PATH = ".agents/plugins/marketplace.json";

/** A file the generator owns, addressed relative to the repo root. */
export interface GeneratedFile {
  readonly relativePath: string;
  readonly content: string;
  /** The authored file it derives from, when a person could mistake it for one. */
  readonly source?: string;
}

/**
 * The project version, read from source.
 *
 * Read from source rather than from installed metadata, so the build is
 * deterministic. `packageVersion` is the single body that answers this for the
 * whole core (US2 decision D2); CV22.DS10.TS5 re-pointed it at
 * `package.json` and this builder followed with no edit, which is the point
 * of there being one body.
 */
export function readVersion(repoRoot: string): string {
  const version = packageVersion(repoRoot);
  if (!version) throw new Error(`version not found from ${repoRoot}`);
  return version;
}

/**
 * The directories the MCP entry and the plugin's hook wrappers search for
 * `mirror` and `node` when the PATH does not hold them: a GUI launch leaves
 * the npm global bin off it. One list, so `mcpEntry.test.ts` can hold the
 * entry's search equal to the wrappers' (`generate_hook_wrappers.sh`).
 */
export const GLOBAL_BIN_DIRS = ['"$HOME/.nvm/current/bin"', "/opt/homebrew/bin", "/usr/local/bin"];

/**
 * The MCP entry's locator (CV21.DS2.US6).
 *
 * The manifest used to name `${CLAUDE_PLUGIN_ROOT}/mcp/launch.sh`. Claude Code
 * expands that variable; Codex does not expand it in an MCP command (DS12.TS2
 * L6), so the server never started there. The locator is the launcher's
 * search, inline: `MIRROR_BIN`, the PATH, then the global bin directories for
 * `mirror`; `MIRROR_NODE`, the PATH, the directory `mirror` was found in, then
 * the same directories for `node`. A client whose PATH holds neither (a GUI
 * launch) still starts the server, and one with no `mirror` anywhere gets one
 * stderr line naming the install step, and exit 1.
 *
 * Written for what three runtimes do to the string (the US6 spike):
 *
 *   * POSIX `sh`: `/bin/sh` is dash on Linux;
 *   * no `${...}`: Claude Code expands that form in MCP configuration, and a
 *     runtime that did so with an unset name would blank it;
 *   * no positional parameter (`$1`, `$@`, ...) and no backtick, for the same
 *     reason, and because the text travels through two JSON encoders;
 *   * variables named `mmbin`, `mmnode`, `mmdir`: Grok substitutes SET
 *     environment variables by name inside MCP args at load time (`$HOME`
 *     became the path), so a script variable with a name a person exports
 *     would be replaced before the shell ever saw it.
 */
export const MCP_LOCATOR = [
  'mmbin=""',
  '[ -n "$MIRROR_BIN" ] && [ -x "$MIRROR_BIN/mirror" ] && mmbin="$MIRROR_BIN/mirror"',
  '[ -n "$mmbin" ] || mmbin="$(command -v mirror 2>/dev/null)"',
  `for mmdir in ${GLOBAL_BIN_DIRS.join(" ")}; do [ -n "$mmbin" ] && break; [ -x "$mmdir/mirror" ] && mmbin="$mmdir/mirror"; done`,
  '[ -n "$mmbin" ] || { echo "mirror-mind: mirror not found on PATH; the MCP server cannot start. Install mirror-mind (npm install -g mirror-mind) or set MIRROR_BIN to its bin directory." >&2; exit 1; }',
  'mmnode="$MIRROR_NODE"',
  '[ -n "$mmnode" ] && [ -x "$mmnode" ] || mmnode="$(command -v node 2>/dev/null)"',
  `for mmdir in "$(dirname "$mmbin")" ${GLOBAL_BIN_DIRS.join(" ")}; do [ -n "$mmnode" ] && break; [ -x "$mmdir/node" ] && mmnode="$mmdir/node"; done`,
  '[ -n "$mmnode" ] || { echo "mirror-mind: node not found on PATH; the MCP server cannot start. Set MIRROR_NODE." >&2; exit 1; }',
  'exec "$mmnode" "$mmbin" mcp',
].join("; ");

/** The `mcpServers` entry: the locator, run by the system shell. */
export const MCP_ENTRY: { readonly command: string; readonly args: readonly string[] } = {
  command: "/bin/sh",
  args: ["-c", MCP_LOCATOR],
};

/**
 * The Claude plugin manifest (minimal; no unsupported keys).
 *
 * Declares the Mirror MCP server so the canonical package carries it. The
 * entry names no file of the plugin's and no variable a runtime must expand
 * (`MCP_LOCATOR`): Claude Code, Codex, and Grok render it as written, and
 * each starts the server from it (CV21.DS2.US6).
 */
export function buildManifest(version: string): Record<string, unknown> {
  return {
    name: PLUGIN_NAME,
    version,
    description: PLUGIN_DESCRIPTION,
    author: { name: PLUGIN_AUTHOR },
    mcpServers: {
      [PLUGIN_NAME]: { command: MCP_ENTRY.command, args: [...MCP_ENTRY.args] },
    },
  };
}

/** The manifest as deterministic JSON text, byte-identical to Python's. */
export function manifestJson(version: string): string {
  return `${JSON.stringify(buildManifest(version), null, 2)}\n`;
}

/**
 * The Codex marketplace the package ships (CV21.DS4.US1).
 *
 * `codex plugin marketplace add <package root>` reads it, and
 * `codex plugin add mirror-mind@mirror-mind` copies the plugin it names into
 * Codex's cache, at the version the plugin manifest carries: the marketplace
 * itself has none. One local source, the plugin directory, relative to the
 * root. Generated beside the manifest so the plugin's name lives in one
 * constant and `--check` guards both files.
 */
export function buildMarketplace(): Record<string, unknown> {
  return {
    name: PLUGIN_NAME,
    owner: { name: PLUGIN_AUTHOR },
    plugins: [
      {
        name: PLUGIN_NAME,
        source: { source: "local", path: `./${PLUGIN_DIR}` },
        description: PLUGIN_DESCRIPTION,
      },
    ],
  };
}

/** The marketplace as deterministic JSON text. */
export function marketplaceJson(): string {
  return `${JSON.stringify(buildMarketplace(), null, 2)}\n`;
}

/**
 * The skill markdown file, matching `skill.md` case-insensitively.
 *
 * Case-insensitive makes the generator robust on both case-sensitive and
 * case-insensitive filesystems, including older checkouts that may still
 * contain lowercase `skill.md`.
 */
function findSkillMarkdown(skillDir: string): string | null {
  for (const entry of readdirSync(skillDir, { withFileTypes: true, encoding: "utf8" }).sort(
    (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  )) {
    if (entry.isFile() && entry.name.toLowerCase() === SKILL_FILENAME.toLowerCase()) {
      return join(skillDir, entry.name);
    }
  }
  return null;
}

/**
 * `[skillDirName, markdownPath]` for each skill under `.claude/skills/`. Most
 * are authored there. A Pi-sourced skill's file is generated instead
 * (`piSourcedSkills.ts`), and `planGeneratedFiles` takes that one from its Pi
 * copy, never from this path.
 */
export function discoverSkillSources(repoRoot: string): [string, string][] {
  const base = join(repoRoot, SKILLS_SOURCE_DIR);
  const sources: [string, string][] = [];
  const entries = readdirSync(base, { withFileTypes: true, encoding: "utf8" }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  for (const child of entries) {
    if (!child.isDirectory()) continue;
    const markdown = findSkillMarkdown(join(base, child.name));
    if (markdown === null) continue;
    sources.push([child.name, markdown]);
  }
  return sources;
}

/**
 * The `.claude/skills/` copy of each Pi-sourced skill, generated from its Pi
 * copy. Refuses, before anything is written, when a listed skill has no Pi
 * copy: generation would otherwise stop without a word, and the old Claude copy
 * would pass for an authored one again.
 */
function planPiSourcedClaudeCopies(repoRoot: string): Map<string, GeneratedFile> {
  const copies = new Map<string, GeneratedFile>();
  for (const skill of PI_SOURCED_SKILLS) {
    const source = join(PI_SKILLS_DIR, skill, SKILL_FILENAME);
    const path = join(repoRoot, source);
    if (!existsSync(path)) {
      throw new Error(
        `${source}: missing, but ${skill} is listed as Pi-sourced in ts/src/guards/piSourcedSkills.ts`,
      );
    }
    copies.set(skill, {
      relativePath: join(SKILLS_SOURCE_DIR, skill, SKILL_FILENAME),
      content: claudeVariant(skill, readFileSync(path, "utf8"), source),
      source,
    });
  }
  return copies;
}

/** Every file the generator owns, without touching the filesystem. */
export function planGeneratedFiles(repoRoot: string): GeneratedFile[] {
  const version = readVersion(repoRoot);
  const claudeCopies = planPiSourcedClaudeCopies(repoRoot);

  const pluginSkills = new Map<string, GeneratedFile>();
  for (const [name, markdown] of discoverSkillSources(repoRoot)) {
    if (claudeCopies.has(name)) continue;
    pluginSkills.set(name, {
      relativePath: join(PLUGIN_DIR, "skills", name, SKILL_FILENAME),
      content: readFileSync(markdown, "utf8"),
    });
  }
  for (const [name, claudeCopy] of claudeCopies) {
    pluginSkills.set(name, {
      relativePath: join(PLUGIN_DIR, "skills", name, SKILL_FILENAME),
      content: claudeCopy.content,
      source: claudeCopy.source,
    });
  }

  return [
    {
      relativePath: join(PLUGIN_DIR, ".claude-plugin", "plugin.json"),
      content: manifestJson(version),
    },
    { relativePath: MARKETPLACE_PATH, content: marketplaceJson() },
    ...claudeCopies.values(),
    ...[...pluginSkills].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, file]) => file),
  ];
}

/** One drift line; a derived file also names the source a person should edit. */
function driftLine(kind: "missing" | "out of date", file: GeneratedFile): string {
  const from = file.source
    ? ` (generated from ${file.source}: edit the source, then regenerate)`
    : "";
  return `${kind}: ${file.relativePath}${from}`;
}

function generatedSkillFiles(repoRoot: string): string[] {
  const skillsRoot = join(repoRoot, PLUGIN_DIR, "skills");
  if (!existsSync(skillsRoot)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(skillsRoot, { withFileTypes: true, encoding: "utf8" })) {
    if (!entry.isDirectory()) continue;
    const candidate = join(skillsRoot, entry.name, SKILL_FILENAME);
    if (existsSync(candidate)) found.push(candidate);
  }
  return found.sort();
}

/**
 * Write every generated file, the plugin and the `.claude/skills/` copies of
 * Pi-sourced skills, or report drift when `write` is false.
 *
 * Returns human-readable drift descriptions. In check mode the list is the
 * assertion target (empty == in sync). In write mode it is empty and the files
 * are written; stale generated skills are removed.
 */
export function materialize(repoRoot: string, options: { write: boolean }): string[] {
  const desired = planGeneratedFiles(repoRoot);
  const desiredPaths = new Set(desired.map((file) => file.relativePath));
  const problems: string[] = [];

  for (const generated of desired) {
    const target = join(repoRoot, generated.relativePath);
    if (options.write) {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, generated.content, "utf8");
    } else if (!existsSync(target)) {
      problems.push(driftLine("missing", generated));
    } else if (readFileSync(target, "utf8") !== generated.content) {
      problems.push(driftLine("out of date", generated));
    }
  }

  for (const existing of generatedSkillFiles(repoRoot)) {
    const rel = relative(repoRoot, existing);
    if (desiredPaths.has(rel)) continue;
    if (options.write) {
      const parent = dirname(existing);
      for (const leftover of readdirSync(parent).sort()) unlinkSync(join(parent, leftover));
      rmdirSync(parent);
    } else {
      problems.push(`stale: ${rel}`);
    }
  }

  return problems;
}
