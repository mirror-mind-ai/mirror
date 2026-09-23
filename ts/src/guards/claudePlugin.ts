// Generate the canonical Mirror Mind Claude plugin (manifest + skills).
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
// source). Hooks under `plugins/mirror-mind/hooks/` are hand-authored plugin
// source and are NOT managed by this module -- which is precisely why TS5's
// inventory had to find their interpreter spawns by reading them.

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

export const PLUGIN_NAME = "mirror-mind";
export const PLUGIN_DESCRIPTION =
  "Mirror Mind — local-first memory and identity for agentic runtimes.";
export const PLUGIN_AUTHOR = "Mirror Mind";

export const SKILLS_SOURCE_DIR = ".claude/skills";
export const PLUGIN_DIR = "plugins/mirror-mind";
export const SKILL_FILENAME = "SKILL.md";

/** A file the generator owns, addressed relative to the repo root. */
export interface GeneratedFile {
  readonly relativePath: string;
  readonly content: string;
}

/**
 * The project version, read from source.
 *
 * Python reads `pyproject.toml` directly so the build is deterministic from
 * source rather than from installed metadata. `packageVersion` is the single
 * body that answers this question for the whole TypeScript core (US2 decision
 * D2), and slice C re-points it at `ts/package.json` -- at which moment this
 * builder follows with no edit, which is the point of there being one body.
 */
export function readVersion(repoRoot: string): string {
  const version = packageVersion(repoRoot);
  if (!version) throw new Error(`version not found from ${repoRoot}`);
  return version;
}

/**
 * The Claude plugin manifest (minimal; no unsupported keys).
 *
 * Declares the Mirror MCP server so the canonical package carries it. Since
 * CV22.DS9.TS2 the entry is the plugin's own launcher rather than an engine,
 * so reverting never requires editing a plugin installed inside someone's
 * runtime (DS9 decision D5). TS5 removes that launcher's Python branch; US3
 * repoints this at the npm entry point.
 */
export function buildManifest(version: string): Record<string, unknown> {
  return {
    name: PLUGIN_NAME,
    version,
    description: PLUGIN_DESCRIPTION,
    author: { name: PLUGIN_AUTHOR },
    mcpServers: {
      // The placeholder is Claude Code's, expanded when it loads the plugin. A
      // JavaScript template would resolve at BUILD time, against this
      // repository, shipping an absolute path from the release machine.
      // biome-ignore lint/suspicious/noTemplateCurlyInString: Claude expands this at load time, not JS
      [PLUGIN_NAME]: { command: "${CLAUDE_PLUGIN_ROOT}/mcp/launch.sh" },
    },
  };
}

/** The manifest as deterministic JSON text, byte-identical to Python's. */
export function manifestJson(version: string): string {
  return `${JSON.stringify(buildManifest(version), null, 2)}\n`;
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

/** `[skillDirName, sourceMarkdownPath]` for each Claude skill. */
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

/** Every file the generator owns, without touching the filesystem. */
export function planGeneratedFiles(repoRoot: string): GeneratedFile[] {
  const version = readVersion(repoRoot);
  const files: GeneratedFile[] = [
    {
      relativePath: join(PLUGIN_DIR, ".claude-plugin", "plugin.json"),
      content: manifestJson(version),
    },
  ];
  for (const [name, markdown] of discoverSkillSources(repoRoot)) {
    files.push({
      relativePath: join(PLUGIN_DIR, "skills", name, SKILL_FILENAME),
      content: readFileSync(markdown, "utf8"),
    });
  }
  return files;
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
 * Write the generated plugin files, or report drift when `write` is false.
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
      problems.push(`missing: ${generated.relativePath}`);
    } else if (readFileSync(target, "utf8") !== generated.content) {
      problems.push(`out of date: ${generated.relativePath}`);
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
