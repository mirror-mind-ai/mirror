// The plugin wiring readers (CV21.DS4.TS6; Grok in CV21.DS10.US1; agy's
// reader in CV21.DS5.US2, read for the canonical plugin since CV21.DS11.TS4).
//
// Three runtimes hold the plugin outside the install tree. Codex copies it
// into a versioned cache (`$CODEX_HOME/plugins/cache/mirror-mind/mirror-mind/
// <version>`; CV21.DS4.US1), so an npm update changes the install but not
// that copy. Grok copies it too, under `$GROK_HOME/installed-plugins/<name>-
// <hash of the source path string>/`, recorded in `installed-plugins/
// registry.json` (grok 1.0.62); its copy carries the plugin's own
// `.claude-plugin/plugin.json`, so the version reads the same way the install
// tree's does. Claude Code links the plugin in place (`~/.claude/skills/
// mirror-mind`), so its failure mode is a dangling link, not a stale copy —
// and Grok's rules link (`~/.grok/rules/mirror-mind.md`) fails the same way.
//
// Every reader takes its root as an ARGUMENT, always. The defaulting —
// `$CODEX_HOME` else `~/.codex`, `$GROK_HOME` else `~/.grok`, and the Claude
// home — happens once, at the diagnose entry, from the env the caller
// already carries, never in here.
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

/**
 * A plugin as Codex caches it: `plugins/cache/<marketplace>/<name>/<version>`.
 * The canonical plugin is `mirror-mind/mirror-mind`; a home's extensions
 * plugin is `mirror-ext-<user>/mirror-ext-<user>` (CV21.DS5.US2).
 */
export interface CodexPluginIdentity {
  readonly marketplace: string;
  readonly name: string;
}

export const CANONICAL_CODEX_PLUGIN: CodexPluginIdentity = {
  marketplace: "mirror-mind",
  name: "mirror-mind",
};

/** Where Codex keeps a plugin's copies, below a Codex home. */
export function codexPluginCacheSegments(
  identity: CodexPluginIdentity = CANONICAL_CODEX_PLUGIN,
): readonly string[] {
  return ["plugins", "cache", identity.marketplace, identity.name];
}

/** The canonical plugin's cache path segments, as before DS5.US2. */
export const CODEX_PLUGIN_CACHE_SEGMENTS: readonly string[] = codexPluginCacheSegments();

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
 * `codex plugin add` REPLACES the cache directory (measured on 0.163.0,
 * CV21.DS5.US2's Debt Review): after a re-add at 0.1.2 only `0.1.2` remains,
 * and after a re-add at a lower 0.1.0 only `0.1.0`, which the prompt then
 * lists. So the newest entry is the only entry, and a reader that compared a
 * generation restarted below an older cache would still be reading what Codex
 * loads.
 *
 * `ahead` is a state, not a finding: `runtime update` refuses downgrades but
 * `npm install -g mirror-mind@old` does not ask, and the person who
 * downgraded on purpose needs no Codex advice from the older tree.
 */
export function codexPluginCacheState(
  codexHome: string,
  installedVersion: string,
  identity: CodexPluginIdentity = CANONICAL_CODEX_PLUGIN,
): CodexCacheState {
  const cachePath = join(codexHome, ...codexPluginCacheSegments(identity));
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

export interface LinkState {
  /** `healthy` means the target reads — including a plain directory or file copy. */
  state: "absent" | "healthy" | "dangling";
  linkPath: string;
  /** The link's own target when it is a symlink, else null. */
  target: string | null;
}

/**
 * Read one wiring link: Claude Code's plugin link (`~/.claude/skills/
 * mirror-mind`) or Grok's rules link (`~/.grok/rules/mirror-mind.md`).
 * Healthy means the target reads; a link that resolves to *another* install
 * tree is deliberately healthy too (TS6's documented silence) — chasing
 * where it points is a one-line amendment here if that case ever bites.
 */
export function pluginLinkState(linkPath: string): LinkState {
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

/** Where Grok keeps its copies and their registry, below a Grok home. */
export const GROK_INSTALLED_PLUGINS_SEGMENTS: readonly string[] = ["installed-plugins"];

export interface GrokCopy {
  /** The registry key: `<name>-<hash of the source path string>`. */
  key: string;
  path: string;
  version: string;
}

export interface GrokCopyState {
  /** `absent` covers no registry, no Mirror entry, and entries with no readable manifest. */
  state: "absent" | "current" | "behind" | "ahead";
  registryPath: string;
  /** Every copy carrying the plugin, with its manifest version. */
  copies: GrokCopy[];
  /** The newest copy's version, by semver — never a string sort. */
  newestCopied: string | null;
}

/**
 * Read Grok's install registry below `grokHome`, read-only. The registry
 * names each repo's `path` and the plugins it carries; a repo whose
 * `plugins` include `mirror-mind` is a copy, and its version is the copy's
 * own `.claude-plugin/plugin.json`, read by the same function the install
 * tree uses. A registry that does not parse, or a copy with no manifest,
 * claims nothing.
 *
 * The state is judged by the newest copy, as Codex's cache is. Two copies
 * are a finding of their own at the diagnose entry: a respelt install path
 * keys a second copy (probe, grok 1.0.62), and Grok loads one of them
 * without saying which.
 */
export function grokPluginCopyState(
  grokHome: string,
  installedVersion: string,
  pluginName = "mirror-mind",
): GrokCopyState {
  const registryPath = join(grokHome, ...GROK_INSTALLED_PLUGINS_SEGMENTS, "registry.json");
  const copies: GrokCopy[] = [];
  let repos: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(readFileSync(registryPath, "utf8"));
    const candidate =
      typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>).repos
        : undefined;
    if (typeof candidate !== "object" || candidate === null) {
      return { state: "absent", registryPath, copies, newestCopied: null };
    }
    repos = candidate as Record<string, unknown>;
  } catch {
    return { state: "absent", registryPath, copies, newestCopied: null };
  }
  for (const [key, entry] of Object.entries(repos)) {
    if (typeof entry !== "object" || entry === null) continue;
    const repo = entry as Record<string, unknown>;
    const plugins = repo.plugins;
    if (typeof plugins !== "object" || plugins === null || !(pluginName in plugins)) continue;
    const path =
      typeof repo.path === "string"
        ? repo.path
        : join(grokHome, ...GROK_INSTALLED_PLUGINS_SEGMENTS, key);
    const version = pluginManifestVersion(join(path, ".claude-plugin", "plugin.json"));
    if (version === null) continue;
    copies.push({ key, path, version });
  }
  if (copies.length === 0) return { state: "absent", registryPath, copies, newestCopied: null };
  let newest: string | null = null;
  for (const copy of copies) {
    if (newest === null || compareSemver(copy.version, newest) > 0) newest = copy.version;
  }
  const order = compareSemver(newest as string, installedVersion);
  const state = order < 0 ? "behind" : order > 0 ? "ahead" : "current";
  return { state, registryPath, copies, newestCopied: newest };
}

export interface AgyCopyState {
  /** `absent` covers no staged tree and a staged tree with no readable manifest. */
  state: "absent" | "current" | "behind" | "ahead";
  copyPath: string;
  copiedVersion: string | null;
}

/**
 * Read agy's staged copy of a plugin below a `.gemini` home, read-only:
 * `agy plugin install <dir>` stages the tree under `config/plugins/<name>/`
 * (CV21.DS7.US1), and the copy's own `.claude-plugin/plugin.json` carries
 * its version. Written for the extensions plugin (CV21.DS5.US2); since
 * CV21.DS11.TS4 it reads the canonical plugin's copy too, which agy 1.4.7
 * stages the same way (`mirror-mind/.claude-plugin/plugin.json`, measured in
 * a scratch HOME on 2026-10-24).
 */
export function agyPluginCopyState(
  geminiHome: string,
  installedVersion: string,
  pluginName: string,
): AgyCopyState {
  const copyPath = join(geminiHome, "config", "plugins", pluginName);
  const copiedVersion = pluginManifestVersion(join(copyPath, ".claude-plugin", "plugin.json"));
  if (copiedVersion === null) return { state: "absent", copyPath, copiedVersion: null };
  const order = compareSemver(copiedVersion, installedVersion);
  const state = order < 0 ? "behind" : order > 0 ? "ahead" : "current";
  return { state, copyPath, copiedVersion };
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
  return pluginManifestVersion(
    join(installRoot, "plugins", "mirror-mind", ".claude-plugin", "plugin.json"),
  );
}

/** The `version` of one plugin manifest on disk, or null when it does not read. */
function pluginManifestVersion(manifestPath: string): string | null {
  try {
    const raw = readFileSync(manifestPath, "utf8");
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
