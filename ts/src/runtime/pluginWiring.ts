// The plugin wiring readers (CV21.DS4.TS6).
//
// Two runtimes hold the plugin outside the install tree. Codex copies it into
// a versioned cache (`$CODEX_HOME/plugins/cache/mirror-mind/mirror-mind/
// <version>`; CV21.DS4.US1), so an npm update changes the install but not
// that copy — the one wiring that goes stale. Claude Code links the plugin in
// place (`~/.claude/skills/mirror-mind`), so its failure mode is a dangling
// link, not a stale copy.
//
// Both readers take their roots as ARGUMENTS, always. The defaulting —
// `$CODEX_HOME` else `~/.codex`, and the Claude home — happens once, at the
// diagnose entry, from the env the caller already carries, never in here.
// That is the CR123/128/137/142 lesson: a maintainer's machine has a real
// ~/.codex and a real ~/.claude, and a reader that consults the environment
// makes every fixture test machine-dependent exactly where maintainers work.
//
// Nothing here runs `codex` or mutates anything: Mirror reads directories and
// prints a command for the person to run. On the installed Codex 0.163.0,
// `codex plugin` has no update verb (add, list, marketplace, remove), so the
// level-up command is the re-add — `CODEX_PLUGIN_ADD_COMMAND`, the same
// constant `mirror init`'s wiring lines print (the CR071 lesson at the
// string level).

import { lstatSync, readdirSync, readFileSync, readlinkSync, statSync } from "node:fs";
import { join } from "node:path";
import { compareSemver, parseSemver } from "#util/semver.ts";

/** Where Codex keeps its copy, below a Codex home. */
export const CODEX_PLUGIN_CACHE_SEGMENTS: readonly string[] = [
  "plugins",
  "cache",
  "mirror-mind",
  "mirror-mind",
];

export interface CodexCacheState {
  /** `absent` covers no cache and a cache with no version-named entry. */
  state: "absent" | "current" | "behind" | "ahead";
  cachePath: string;
  /** The newest version-named entry, by semver — never a string sort. */
  newestCached: string | null;
}

/**
 * Read the Codex plugin cache below `codexHome`, read-only. Entries whose
 * names do not parse as versions (a partial download, an editor's leavings)
 * are ignored; a cache holding only those claims nothing and reads as absent.
 *
 * `ahead` is a state, not a finding: `runtime update` refuses downgrades but
 * `npm install -g mirror-mind@old` does not ask, and the person who
 * downgraded on purpose needs no Codex advice from the older tree.
 */
export function codexPluginCacheState(
  codexHome: string,
  installedVersion: string,
): CodexCacheState {
  const cachePath = join(codexHome, ...CODEX_PLUGIN_CACHE_SEGMENTS);
  let entries: string[];
  try {
    entries = readdirSync(cachePath);
  } catch {
    return { state: "absent", cachePath, newestCached: null };
  }
  let newest: string | null = null;
  for (const entry of entries) {
    if (parseSemver(entry)[0] < 0) continue;
    try {
      if (!statSync(join(cachePath, entry)).isDirectory()) continue;
    } catch {
      continue;
    }
    if (newest === null || compareSemver(entry, newest) > 0) newest = entry;
  }
  if (newest === null) return { state: "absent", cachePath, newestCached: null };
  const order = compareSemver(newest, installedVersion);
  const state = order < 0 ? "behind" : order > 0 ? "ahead" : "current";
  return { state, cachePath, newestCached: newest };
}

export interface ClaudeLinkState {
  /** `healthy` means the target reads — including a plain directory copy. */
  state: "absent" | "healthy" | "dangling";
  linkPath: string;
  /** The link's own target when it is a symlink, else null. */
  target: string | null;
}

/**
 * Read the Claude Code wiring below `claudeHome`. Healthy means the target
 * reads; a link that resolves to *another* install tree is deliberately
 * healthy too (TS6's documented silence) — chasing where it points is a
 * one-line amendment here if that case ever bites.
 */
export function claudePluginLinkState(claudeHome: string): ClaudeLinkState {
  const linkPath = join(claudeHome, "skills", "mirror-mind");
  let isLink = false;
  try {
    isLink = lstatSync(linkPath).isSymbolicLink();
  } catch {
    return { state: "absent", linkPath, target: null };
  }
  const target = isLink ? readlinkSync(linkPath) : null;
  try {
    statSync(linkPath);
  } catch {
    return { state: "dangling", linkPath, target };
  }
  return { state: "healthy", linkPath, target };
}

/**
 * The install tree's own plugin version, from the generated manifest.
 * `plugins/mirror-mind/.claude-plugin/plugin.json` is written by
 * `claudePlugin.ts` from `packageVersion()`, and the guard holds the
 * committed manifest equal to the generated one — the file is the authority,
 * not an assumption. Reading it FROM DISK is also what makes a post-update
 * hint honest: the process that ran the update is the old version's code,
 * but the tree it reads has already landed the new one.
 */
export function installedPluginVersion(installRoot: string): string | null {
  try {
    const raw = readFileSync(
      join(installRoot, "plugins", "mirror-mind", ".claude-plugin", "plugin.json"),
      "utf8",
    );
    const parsed: unknown = JSON.parse(raw);
    const version =
      typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>).version
        : undefined;
    return typeof version === "string" && version !== "" ? version : null;
  } catch {
    return null;
  }
}
