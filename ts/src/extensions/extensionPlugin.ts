// CV21.DS5.US2 — the per-home extensions plugin.
//
// A Mirror home's installed extensions reach Claude Code, Codex, Antigravity, and
// Grok Build as one generated plugin per home, in the canonical plugin's format:
//
//   <home>/runtime/plugin/
//     .agents/plugins/marketplace.json     the Codex marketplace, named for the home
//     mirror-ext-<user>/
//       .claude-plugin/plugin.json         name, version, description — no hooks, no server
//       plugin.json                        the root marker Grok and agy read (DS10.US1)
//       skills/<dir>/SKILL.md              each installed extension's `claude` skill
//
// DS5.TS1 measured the three shapes DS12.TS5 left open and chose this one: a plugin is
// listed and found on all four runtimes, needs no manifest rewritten (it carries the
// `claude` skill the manifests already declare), and installs beside another home's.
// Its price is that Codex, agy, and Grok copy a plugin, so a changed extension is live
// only after a reinstall — which is why the version matters: Codex keys its cache by
// it and `runtime diagnose` compares it.
//
// The generator is a pure function from the home's `claude` catalog — the same reader
// `expose-claude` projects from, so the plugin carries what `expose-claude` exposes —
// to a sorted file map. The version is `0.1.<generation>`, advanced by one when the
// tree differs from the one on disk and held when it does not: an identical
// regeneration must not tell every runtime it is stale. The writer replaces the tree
// atomically (write `plugin.next`, rename over `plugin`), so Claude Code, which reads
// the directory in place through a link, never sees a half tree. The tree holds only
// regular files the generator wrote.

import {
  type Dirent,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { pythonJsonDumpsIndentedOrdered } from "#util/pyGenerators.ts";
import { discoverExtensions, extensionsRootForHome, runtimeSkillsRootForHome } from "./catalog.ts";
import { filesystemSkillDirName } from "./catalogWrites.ts";

export const EXTENSION_PLUGIN_SEGMENTS: readonly string[] = ["runtime", "plugin"];
const MARKETPLACE_RELATIVE = ".agents/plugins/marketplace.json";
const VERSION_PREFIX = "0.1.";

/** The plugin's name, which is also its Codex marketplace's: one per home. */
export function extensionPluginName(user: string): string {
  return `mirror-ext-${user}`;
}

/** The marketplace root: what `codex plugin marketplace add` takes. */
export function extensionPluginRoot(mirrorHome: string): string {
  return join(mirrorHome, ...EXTENSION_PLUGIN_SEGMENTS);
}

/** The plugin directory: what Claude Code links, and agy and Grok install. */
export function extensionPluginDirectory(mirrorHome: string): string {
  return join(extensionPluginRoot(mirrorHome), extensionPluginName(basename(mirrorHome)));
}

/** Relative path → file content, sorted by path. */
export type PluginFileMap = Readonly<Record<string, string>>;

export interface PluginEntry {
  /** The `claude` block's `command_name`, e.g. `ext:review-copy`. */
  readonly commandName: string;
  /** The installed skill file's bytes, copied verbatim: frontmatter is the author's. */
  readonly content: string;
}

export interface PluginPlan {
  readonly name: string;
  readonly version: string;
  readonly generation: number;
  readonly skills: number;
  /** True when the tree differs from `previous` (or there was none). */
  readonly changed: boolean;
  readonly files: PluginFileMap;
}

export interface PreviousPlugin {
  readonly generation: number;
  readonly files: PluginFileMap;
}

function render(user: string, entries: readonly PluginEntry[], generation: number): PluginFileMap {
  const name = extensionPluginName(user);
  const version = `${VERSION_PREFIX}${generation}`;
  const sorted = [...entries].sort((a, b) =>
    a.commandName < b.commandName ? -1 : a.commandName > b.commandName ? 1 : 0,
  );
  const skills = sorted.length;
  const manifest = {
    name,
    version,
    description: `Extensions of the Mirror home ${user}: ${skills} skill${skills === 1 ? "" : "s"}`,
  };
  const marketplace = {
    name,
    owner: { name: "Mirror Mind" },
    plugins: [
      {
        name,
        source: { source: "local", path: `./${name}` },
        description: manifest.description,
      },
    ],
  };
  const files: Record<string, string> = {
    [MARKETPLACE_RELATIVE]: `${pythonJsonDumpsIndentedOrdered(marketplace)}\n`,
    [`${name}/.claude-plugin/plugin.json`]: `${pythonJsonDumpsIndentedOrdered(manifest)}\n`,
    [`${name}/plugin.json`]: `${pythonJsonDumpsIndentedOrdered(manifest)}\n`,
  };
  for (const entry of sorted) {
    files[`${name}/skills/${filesystemSkillDirName(entry.commandName)}/SKILL.md`] = entry.content;
  }
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

function sameFiles(a: PluginFileMap, b: PluginFileMap): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => key in b && a[key] === b[key]);
}

/**
 * The plan: the tree at the previous generation, compared to the previous tree;
 * when it differs, the tree at the next generation. The version appears in both
 * manifests, so a changed tree is re-rendered after the bump.
 */
export function planExtensionPlugin(input: {
  user: string;
  entries: readonly PluginEntry[];
  previous: PreviousPlugin | null;
}): PluginPlan {
  const name = extensionPluginName(input.user);
  const skills = input.entries.length;
  if (input.previous === null) {
    const files = render(input.user, input.entries, 1);
    return { name, version: `${VERSION_PREFIX}1`, generation: 1, skills, changed: true, files };
  }
  const held = render(input.user, input.entries, input.previous.generation);
  if (sameFiles(held, input.previous.files)) {
    return {
      name,
      version: `${VERSION_PREFIX}${input.previous.generation}`,
      generation: input.previous.generation,
      skills,
      changed: false,
      files: held,
    };
  }
  const generation = input.previous.generation + 1;
  return {
    name,
    version: `${VERSION_PREFIX}${generation}`,
    generation,
    skills,
    changed: true,
    files: render(input.user, input.entries, generation),
  };
}

/** The tree on disk as a file map with its generation, or null when there is none. */
export function readExtensionPlugin(mirrorHome: string): PreviousPlugin | null {
  const root = extensionPluginRoot(mirrorHome);
  const manifestPath = join(extensionPluginDirectory(mirrorHome), ".claude-plugin", "plugin.json");
  if (!existsSync(manifestPath)) return null;
  let generation: number;
  try {
    const parsed: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
    const version =
      typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>).version
        : undefined;
    const match = typeof version === "string" ? /^0\.1\.(\d+)$/.exec(version) : null;
    if (match === null) return null;
    generation = Number(match[1]);
  } catch {
    return null;
  }
  const files: Record<string, string> = {};
  for (const path of walk(root)) {
    files[path.slice(root.length + 1)] = readFileSync(path, "utf8");
  }
  return {
    generation,
    files: Object.fromEntries(
      Object.entries(files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    ),
  };
}

function walk(root: string): string[] {
  const found: string[] = [];
  let entries: Dirent[];
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) found.push(...walk(path));
    else if (entry.isFile()) found.push(path);
  }
  return found.sort();
}

/**
 * Replace the tree atomically: the map is written to `plugin.next`, then renamed over
 * `plugin`. The path a runtime links or installed from is unchanged; a removed skill's
 * directory is gone because the whole tree is new. Mode 0700, like the rest of the home.
 */
export function writeExtensionPlugin(mirrorHome: string, files: PluginFileMap): void {
  const root = extensionPluginRoot(mirrorHome);
  const next = `${root}.next`;
  const old = `${root}.old`;
  rmSync(next, { recursive: true, force: true });
  mkdirSync(next, { recursive: true, mode: 0o700 });
  for (const [relative, content] of Object.entries(files)) {
    const path = join(next, relative);
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, content, { encoding: "utf8", mode: 0o600 });
  }
  rmSync(old, { recursive: true, force: true });
  if (existsSync(root)) renameSync(root, old);
  renameSync(next, root);
  rmSync(old, { recursive: true, force: true });
}

export interface ExtensionPluginReport {
  readonly name: string;
  readonly directory: string;
  readonly marketplaceRoot: string;
  readonly version: string;
  readonly skills: number;
  readonly changed: boolean;
  /** Installed extensions that declare no `claude` block, and so are not carried. */
  readonly notCarried: readonly string[];
}

/** The home's `claude` catalog entries that still have a skill file, as plugin entries. */
export function claudeCatalogEntries(mirrorHome: string): PluginEntry[] | null {
  const catalogPath = join(runtimeSkillsRootForHome(mirrorHome, "claude"), "extensions.json");
  if (!existsSync(catalogPath)) return null;
  let items: unknown[];
  try {
    const parsed: unknown = JSON.parse(readFileSync(catalogPath, "utf8"));
    const list =
      typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>).extensions
        : undefined;
    items = Array.isArray(list) ? list : [];
  } catch {
    items = [];
  }
  const entries: PluginEntry[] = [];
  for (const item of items) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const commandName = record.command_name;
    const skillPath = record.installed_skill_path;
    if (typeof commandName !== "string" || typeof skillPath !== "string") continue;
    if (!existsSync(skillPath)) continue;
    entries.push({ commandName, content: readFileSync(skillPath, "utf8") });
  }
  return entries;
}

/**
 * Regenerate the home's plugin from its `claude` catalog. A home with no catalog has
 * never installed an extension that declares `claude`, and gets no plugin.
 */
export function regenerateExtensionPlugin(mirrorHome: string): ExtensionPluginReport | null {
  const entries = claudeCatalogEntries(mirrorHome);
  if (entries === null) return null;
  const carried = new Set(readCatalogIds(mirrorHome) ?? []);
  const notCarried = discoverExtensions(extensionsRootForHome(mirrorHome))
    .manifests.map((manifest) => manifest.id)
    .filter((id) => !carried.has(id))
    .sort();
  const plan = planExtensionPlugin({
    user: basename(mirrorHome),
    entries,
    previous: readExtensionPlugin(mirrorHome),
  });
  if (plan.changed || readExtensionPlugin(mirrorHome) === null)
    writeExtensionPlugin(mirrorHome, plan.files);
  return {
    name: plan.name,
    directory: extensionPluginDirectory(mirrorHome),
    marketplaceRoot: extensionPluginRoot(mirrorHome),
    version: plan.version,
    skills: plan.skills,
    changed: plan.changed,
    notCarried,
  };
}

/** The extension ids the home's `claude` catalog names, or null without a catalog. */
function readCatalogIds(mirrorHome: string): string[] | null {
  const catalogPath = join(runtimeSkillsRootForHome(mirrorHome, "claude"), "extensions.json");
  if (!existsSync(catalogPath)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(catalogPath, "utf8"));
    const list =
      typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>).extensions
        : undefined;
    if (!Array.isArray(list)) return [];
    return list
      .map((item) =>
        typeof item === "object" && item !== null && !Array.isArray(item)
          ? (item as Record<string, unknown>).id
          : undefined,
      )
      .filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}
