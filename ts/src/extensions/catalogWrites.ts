// The extension catalog WRITES (CV22.DS7.TS4 plateau 5).
//
// Port of `sync_extensions_for_runtime`, `install_extension`,
// `uninstall_extension`, `expose_claude_runtime_skills`, and
// `cleanup_claude_runtime_skills` from `src/memory/cli/extensions.py`.
//
// These are the first commands in the family that touch the filesystem, and
// the corpus grades them by what they LEAVE ON DISK -- every file in the mirror
// home, the runtime target root, and the Claude project root -- not by what
// they print. Four measured facts shape the port:
//
//   1. **The catalog is written with Python's `json.dumps(doc, indent=2)`, so
//      non-ASCII is ESCAPED.** A summary reading `Café notes — a fixture` lands
//      as `Caf\u00e9 notes \u2014 a fixture`. `JSON.stringify` would write raw
//      UTF-8 and silently change a file both cores read. And the key order is
//      insertion order, not sorted.
//   2. **A Claude command name contains `:`, which is illegal on Windows**, so
//      filesystem names go through `filesystemSkillDirName` while the CATALOG
//      keeps the runtime command unchanged. `ext:notes` lives in `ext-notes/`.
//   3. **Install identifies an extension by its DIRECTORY NAME**, never by the
//      manifest id. An extension in `ext-mismatch/` whose manifest says
//      `id: mismatch` has its migrations checked against the prefix
//      `ext_ext_mismatch_` and fails. Reading the id from the manifest would
//      "fix" a behavior the installed world depends on.
//   4. **Install rebuilds each runtime catalog from EVERY installed
//      extension**, not from the one being installed, while the printed report
//      stays focused on that one. Feeding the writer a single manifest would
//      drop every other extension from the catalog Pi and Claude discover
//      through, leaving their SKILL.md files orphaned on disk.

import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import type { WritableDatabase } from "#db/database.ts";
import { pythonJsonDumpsIndentedOrdered } from "#util/pyGenerators.ts";
import type { BindingDeps } from "./bindings.ts";
import {
  discoverExtensions,
  extensionsRootForHome,
  type RenderedCommand,
  runtimeSkillsRootForHome,
} from "./catalog.ts";
import { readProvidersWithoutRuntime } from "./contextRuntime.ts";
import { readSubcommandListing } from "./dispatch.ts";
import { ExtensionError, ExtensionValidationError } from "./errors.ts";
import { type ExtensionManifest, loadExtensionManifest } from "./manifest.ts";
import { runMigrations } from "./migrations.ts";

/** Port of `_COPY_IGNORE_PATTERNS`: never shipped inside an installed tree. */
const COPY_IGNORE_EXACT = new Set([
  ".git",
  "__pycache__",
  ".venv",
  ".pytest_cache",
  ".ruff_cache",
  ".mypy_cache",
  "node_modules",
  ".DS_Store",
]);
const COPY_IGNORE_SUFFIX = ".pyc";

// A port of Python's `re.sub(r'[<>:"/\\|?*\x00-\x1f]', '-', ...)`, the rule that
// keeps a runtime command name legal as a Windows path segment. Dropping the
// control range would let a control character reach a directory name and
// diverge from the oracle on the one platform this guard exists for.
// biome-ignore lint/suspicious/noControlCharactersInRegex: the control range is the ported rule
const ILLEGAL_PATH_CHARACTERS = /[<>:"/\\|?*\u0000-\u001f]/g;

export interface CatalogEntry {
  id: string;
  name: string;
  category: string;
  kind: string;
  summary: string;
  runtime: string;
  command_name: string;
  source_extension_dir: string;
  manifest_path: string;
  source_skill_path: string;
  installed_skill_path: string;
}

/** Port of `_filesystem_skill_dir_name`. */
export function filesystemSkillDirName(commandName: string): string {
  const safe = pyStripSpacesAndDots(commandName.replace(ILLEGAL_PATH_CHARACTERS, "-"));
  return safe || "extension";
}

/** Python's `str.strip(" .")`: both ends, any mix of the two characters. */
function pyStripSpacesAndDots(text: string): string {
  return text.replace(/^[ .]+/, "").replace(/[ .]+$/, "");
}

/** Port of `_legacy_filesystem_skill_dir_names`. */
export function legacyFilesystemSkillDirNames(commandName: string): string[] {
  const safe = filesystemSkillDirName(commandName);
  return commandName === safe ? [] : [commandName];
}

/** Port of `_skill_markdown_declares_command`. */
function skillMarkdownDeclaresCommand(skillPath: string, commandName: string): boolean {
  let content: string;
  try {
    content = readFileSync(skillPath, "utf8");
  } catch {
    return false;
  }
  const names = new Set([commandName, filesystemSkillDirName(commandName)]);
  for (const name of names) {
    for (const marker of [`name: "${name}"`, `name: '${name}'`, `name: ${name}`]) {
      if (content.includes(marker)) return true;
    }
  }
  return false;
}

/**
 * Port of `_remove_legacy_skill_dir_if_owned`.
 *
 * Deliberately conservative, and the conservatism is the point: it deletes a
 * directory named after the raw command only when the SKILL.md inside declares
 * that same command. A `ext:notes/` directory a human wrote for something else
 * is left alone.
 */
export function removeLegacySkillDirIfOwned(root: string, commandName: string): string[] {
  const removed: string[] = [];
  for (const legacyName of legacyFilesystemSkillDirNames(commandName)) {
    const legacyDir = join(root, legacyName);
    if (!isDirectory(legacyDir)) continue;
    if (!skillMarkdownDeclaresCommand(join(legacyDir, "SKILL.md"), commandName)) continue;
    rmSync(legacyDir, { recursive: true, force: true });
    removed.push(legacyDir);
  }
  return removed;
}

function isDirectory(path: string): boolean {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Port of `_catalog_entry_for_manifest`. */
function catalogEntryForManifest(
  manifest: ExtensionManifest,
  runtime: string,
  targetSkillPath: string,
): CatalogEntry {
  const runtimeData = manifest.runtimes[runtime];
  return {
    id: manifest.id,
    name: manifest.name,
    category: manifest.category,
    kind: manifest.kind,
    summary: manifest.summary,
    runtime,
    command_name: runtimeData?.commandName ?? "",
    source_extension_dir: manifest.root,
    manifest_path: manifest.manifestPath,
    source_skill_path: runtimeData?.skillPath ?? "",
    installed_skill_path: targetSkillPath,
  };
}

/** Port of `_write_catalog` + `_catalog_document`. */
function writeCatalog(
  path: string,
  runtime: string,
  targetRoot: string,
  items: readonly CatalogEntry[],
  deps: BindingDeps,
): void {
  mkdirSync(dirname(path), { recursive: true });
  const document = {
    schema_version: "1",
    runtime,
    target_root: targetRoot,
    generated_at: deps.nowIso(),
    extensions: items,
  };
  writeFileSync(path, `${pythonJsonDumpsIndentedOrdered(document)}\n`, "utf8");
}

/** Port of `_load_catalog`: a missing or corrupt catalog is an EMPTY one. */
function loadCatalogItems(path: string): unknown[] {
  if (!existsSync(path)) return [];
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return [];
  }
  if (Array.isArray(data)) return data;
  if (typeof data !== "object" || data === null) return [];
  const extensions = (data as Record<string, unknown>).extensions;
  return Array.isArray(extensions) ? extensions : [];
}

/** Port of `_prune_catalog_for_extension`. */
function pruneCatalogForExtension(
  catalogPath: string,
  extensionId: string,
  runtime: string,
  targetRoot: string,
  deps: BindingDeps,
): void {
  const items = loadCatalogItems(catalogPath).filter(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      !Array.isArray(item) &&
      (item as Record<string, unknown>).id !== extensionId,
  ) as CatalogEntry[];
  writeCatalog(catalogPath, runtime, targetRoot, items, deps);
}

/** Port of `sync_extensions_for_runtime`. */
export function syncExtensionsForRuntime(
  manifests: readonly ExtensionManifest[],
  runtime: string,
  targetRoot: string,
  deps: BindingDeps,
): CatalogEntry[] {
  mkdirSync(targetRoot, { recursive: true });
  const synced: CatalogEntry[] = [];
  for (const manifest of manifests) {
    const runtimeData = manifest.runtimes[runtime];
    if (!runtimeData) continue;
    const skillPath = runtimeData.skillPath;
    if (!skillPath) continue;
    const commandName = runtimeData.commandName;
    const targetDir = join(targetRoot, filesystemSkillDirName(commandName));
    mkdirSync(targetDir, { recursive: true });
    const targetSkillPath = join(targetDir, "SKILL.md");
    copyFileSync(skillPath, targetSkillPath);
    removeLegacySkillDirIfOwned(targetRoot, commandName);
    synced.push(catalogEntryForManifest(manifest, runtime, targetSkillPath));
  }
  writeCatalog(join(targetRoot, "extensions.json"), runtime, targetRoot, synced, deps);
  return synced;
}

/**
 * Port of `_should_copy_source_tree`.
 *
 * The symlink branch is a refusal, not an optimization: the production layout
 * links an installed extension straight at its source repository, and
 * `copytree(dirs_exist_ok=True)` writes THROUGH such a link, mutating a
 * directory the user never asked to change.
 */
export function shouldCopySourceTree(sourceDir: string, targetDir: string): boolean {
  if (existsSync(targetDir) && realpathSync(sourceDir) === realpathSync(targetDir)) return false;
  if (isSymlink(targetDir)) {
    throw new ExtensionValidationError(
      `installed extension path is a symlink pointing outside the install ` +
        `source: ${targetDir} -> ${realpathSync(targetDir)}. Refusing to install ` +
        `through it, which would modify the link target. Remove the symlink ` +
        `first, or run \`python -m memory ext ${basename(targetDir)} migrate\` to ` +
        `re-run migrations without copying.`,
    );
  }
  return true;
}

function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/** Port of `shutil.copytree(..., ignore=ignore_patterns(*_COPY_IGNORE_PATTERNS))`. */
function copyTreeIgnoring(sourceDir: string, targetDir: string): void {
  cpSync(sourceDir, targetDir, {
    recursive: true,
    force: true,
    filter: (source) => {
      const name = basename(source);
      return !COPY_IGNORE_EXACT.has(name) && !name.endsWith(COPY_IGNORE_SUFFIX);
    },
  });
}

export interface InstallReport {
  extensionId: string;
  sourceDir: string;
  installedDir: string;
  synced: Array<readonly [string, CatalogEntry[]]>;
  migrationsApplied: number;
  /**
   * Capabilities the manifest documents but declares no runtime for.
   *
   * Install SUCCEEDS with these present. A skill-only extension, or one being
   * migrated a capability at a time, is legal -- refusing here would block the
   * very incremental migration CV22.DS10.TS2 exists to enable. The report says
   * so out loud instead, because the alternative is a user discovering it at
   * the first refusal a week later.
   */
  unmigrated: string[];
}

export interface InstallOptions {
  extensionId: string;
  sourceRoot: string;
  mirrorHome: string;
  runtime: string | null;
  db: WritableDatabase;
  deps: BindingDeps;
}

/** Port of `install_extension` + `_post_install_command_skill`. */
export function installExtension(options: InstallOptions): InstallReport {
  const { extensionId, mirrorHome, deps } = options;
  const sourceDir = join(options.sourceRoot, extensionId);
  loadExtensionManifest(sourceDir);

  const targetExtensionsRoot = extensionsRootForHome(mirrorHome);
  const targetExtensionDir = join(targetExtensionsRoot, extensionId);
  mkdirSync(targetExtensionsRoot, { recursive: true });
  if (shouldCopySourceTree(sourceDir, targetExtensionDir)) {
    copyTreeIgnoring(sourceDir, targetExtensionDir);
  }

  const installedManifest = loadExtensionManifest(targetExtensionDir);
  const runtimes =
    options.runtime !== null ? [options.runtime] : Object.keys(installedManifest.runtimes).sort();

  // A prompt-skill has no Python at all: no migrations, no register.
  let migrationsApplied = 0;
  if (installedManifest.kind === "command-skill") {
    try {
      migrationsApplied = runMigrations(
        options.db,
        extensionId,
        join(targetExtensionDir, "migrations"),
        deps,
      );
    } catch (error) {
      if (!(error instanceof ExtensionError)) throw error;
      throw new ExtensionValidationError(
        `migrations failed for extension/${extensionId}: ${error.message}`,
      );
    }
  }

  // Fact 4: rebuild from everything installed, report only this one.
  const installed = discoverExtensions(targetExtensionsRoot).manifests;
  const synced: Array<readonly [string, CatalogEntry[]]> = [];
  for (const runtimeName of runtimes) {
    const runtimeTargetRoot = runtimeSkillsRootForHome(mirrorHome, runtimeName);
    const all = syncExtensionsForRuntime(installed, runtimeName, runtimeTargetRoot, deps);
    synced.push([runtimeName, all.filter((entry) => entry.id === extensionId)] as const);
  }

  return {
    extensionId,
    sourceDir,
    installedDir: targetExtensionDir,
    synced,
    migrationsApplied,
    unmigrated: unmigratedCapabilities(targetExtensionDir),
  };
}

/**
 * What still needs a runtime, in one list, labelled by kind.
 *
 * Each module reads its own manifest section -- `dispatch` owns
 * `cli.subcommands[]`, `contextRuntime` owns `mirror_context_providers[]` --
 * and install merely composes them. Putting a second manifest parser here is
 * how the three readers would drift.
 */
function unmigratedCapabilities(extensionDir: string): string[] {
  const subcommands = readSubcommandListing(extensionDir)
    .filter((entry) => !entry.hasRuntime)
    .map((entry) => `subcommand '${entry.name}'`);
  const providers = readProvidersWithoutRuntime(extensionDir).map(
    (id) => `context provider '${id}'`,
  );
  return [...subcommands, ...providers];
}

export interface UninstallReport {
  extensionId: string;
  installedDir: string;
  bindingsRemoved: number;
  removed: Array<readonly [string, string[]]>;
  sourceRemoved: boolean;
}

/** Port of `uninstall_extension`. */
export function uninstallExtension(options: {
  extensionId: string;
  mirrorHome: string;
  runtime: string | null;
  db: WritableDatabase;
  deps: BindingDeps;
}): UninstallReport {
  const { extensionId, mirrorHome, deps } = options;
  const installedDir = join(extensionsRootForHome(mirrorHome), extensionId);
  if (!existsSync(installedDir)) {
    throw new ExtensionValidationError(`installed extension not found: ${installedDir}`);
  }
  const manifest = loadExtensionManifest(installedDir);
  const runtimes =
    options.runtime !== null ? [options.runtime] : Object.keys(manifest.runtimes).sort();

  const removed: Array<readonly [string, string[]]> = [];
  for (const runtimeName of runtimes) {
    const runtimeData = manifest.runtimes[runtimeName];
    if (!runtimeData) {
      removed.push([runtimeName, []] as const);
      continue;
    }
    const runtimeRoot = runtimeSkillsRootForHome(mirrorHome, runtimeName);
    const commandName = runtimeData.commandName;
    const targetDirs = [
      join(runtimeRoot, filesystemSkillDirName(commandName)),
      ...legacyFilesystemSkillDirNames(commandName).map((name) => join(runtimeRoot, name)),
    ];
    const removedPaths: string[] = [];
    for (const targetDir of targetDirs) {
      if (!existsSync(targetDir)) continue;
      rmSync(targetDir, { recursive: true, force: true });
      removedPaths.push(targetDir);
    }
    pruneCatalogForExtension(
      join(runtimeRoot, "extensions.json"),
      extensionId,
      runtimeName,
      runtimeRoot,
      deps,
    );
    removed.push([runtimeName, removedPaths] as const);
  }

  // D4: the code goes, the DATA stays. Bindings cannot resolve without the
  // source tree, so they are deleted; the extension's own `ext_<id>_*` tables
  // are deliberately preserved for a future purge command to decide about.
  let bindingsRemoved = 0;
  if (options.runtime === null) {
    if (manifest.kind === "command-skill") {
      const result = options.db
        .prepare("DELETE FROM _ext_bindings WHERE extension_id = ?")
        .run(extensionId);
      bindingsRemoved = Number(result.changes) || 0;
    }
    rmSync(installedDir, { recursive: true, force: true });
  }

  return {
    extensionId,
    installedDir,
    bindingsRemoved,
    removed,
    sourceRemoved: options.runtime === null,
  };
}

export interface ClaudeCleanupReport {
  projectRoot: string;
  claudeSkillsRoot: string;
  overlayCatalogPath: string;
  removed: string[];
}

export interface ClaudeExposeReport extends ClaudeCleanupReport {
  exposed: Array<{ commandName: string; sourceSkillPath: string; targetSkillPath: string }>;
}

function claudeSkillsRootFor(projectRoot: string): string {
  return join(projectRoot, ".claude", "skills");
}

/** Port of `_load_claude_overlay_catalog`: a LIST, or nothing. */
function loadOverlayCatalog(path: string): unknown[] {
  if (!existsSync(path)) return [];
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Port of `cleanup_claude_runtime_skills`. */
export function cleanupClaudeRuntimeSkills(projectRoot: string): ClaudeCleanupReport {
  const claudeSkillsRoot = claudeSkillsRootFor(projectRoot);
  const overlayCatalogPath = join(claudeSkillsRoot, "extensions.external.json");
  const removed: string[] = [];

  for (const item of loadOverlayCatalog(overlayCatalogPath)) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
    const targetSkillPath = (item as Record<string, unknown>).target_skill_path;
    if (typeof targetSkillPath !== "string") continue;
    if (existsSync(targetSkillPath)) {
      rmSync(targetSkillPath);
      removed.push(targetSkillPath);
    }
    // Only an EMPTY parent is removed: a directory holding anything else is
    // not ours to delete.
    const parent = dirname(targetSkillPath);
    if (existsSync(parent) && readdirSync(parent).length === 0) rmSync(parent, { recursive: true });
  }

  if (existsSync(overlayCatalogPath)) rmSync(overlayCatalogPath);

  return { projectRoot, claudeSkillsRoot, overlayCatalogPath, removed };
}

/** Port of `expose_claude_runtime_skills`. */
export function exposeClaudeRuntimeSkills(
  projectRoot: string,
  catalog: { extensions: unknown[] },
): ClaudeExposeReport {
  const claudeSkillsRoot = claudeSkillsRootFor(projectRoot);
  mkdirSync(claudeSkillsRoot, { recursive: true });
  const cleanup = cleanupClaudeRuntimeSkills(projectRoot);

  const exposed: ClaudeExposeReport["exposed"] = [];
  for (const item of catalog.extensions) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const commandName = record.command_name;
    const installedSkillPath = record.installed_skill_path;
    if (typeof commandName !== "string" || typeof installedSkillPath !== "string") continue;
    if (!existsSync(installedSkillPath)) continue;
    const targetDir = join(claudeSkillsRoot, filesystemSkillDirName(commandName));
    mkdirSync(targetDir, { recursive: true });
    const targetSkillPath = join(targetDir, "SKILL.md");
    copyFileSync(installedSkillPath, targetSkillPath);
    cleanup.removed.push(...removeLegacySkillDirIfOwned(claudeSkillsRoot, commandName));
    exposed.push({ commandName, sourceSkillPath: installedSkillPath, targetSkillPath });
  }

  const overlayCatalogPath = join(claudeSkillsRoot, "extensions.external.json");
  writeFileSync(
    overlayCatalogPath,
    `${pythonJsonDumpsIndentedOrdered(
      exposed.map((entry) => ({
        command_name: entry.commandName,
        source_skill_path: entry.sourceSkillPath,
        target_skill_path: entry.targetSkillPath,
      })),
    )}\n`,
    "utf8",
  );
  return {
    projectRoot,
    claudeSkillsRoot,
    overlayCatalogPath,
    removed: cleanup.removed,
    exposed,
  };
}

/** Port of `load_runtime_catalog`: the STRICT reader, which refuses. */
export function loadRuntimeCatalog(runtime: string, mirrorHome: string): { extensions: unknown[] } {
  const catalogPath = join(runtimeSkillsRootForHome(mirrorHome, runtime), "extensions.json");
  if (!existsSync(catalogPath)) {
    throw new ExtensionValidationError(`runtime catalog not found: ${catalogPath}`);
  }
  let parsed: unknown = {};
  try {
    parsed = JSON.parse(readFileSync(catalogPath, "utf8"));
  } catch {
    parsed = { schema_version: "1", extensions: [] };
  }
  const catalog = (
    Array.isArray(parsed)
      ? { schema_version: "0", extensions: parsed }
      : typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>)
        : { schema_version: "1", extensions: [] }
  ) as Record<string, unknown>;
  if (catalog.schema_version !== "1") {
    throw new ExtensionValidationError(
      `unsupported runtime catalog schema '${String(catalog.schema_version)}' in ${catalogPath}`,
    );
  }
  if (catalog.runtime !== runtime) {
    throw new ExtensionValidationError(
      `runtime catalog ${catalogPath} does not match runtime '${runtime}'`,
    );
  }
  if (!Array.isArray(catalog.extensions)) {
    throw new ExtensionValidationError(
      `invalid runtime catalog extensions payload in ${catalogPath}`,
    );
  }
  return { extensions: catalog.extensions };
}

/** The `install` report, in Python's print order. */
export function renderInstallReport(report: InstallReport): RenderedCommand {
  const lines = [
    `Installed extension/${report.extensionId}`,
    `  source: ${report.sourceDir}`,
    `  installed: ${report.installedDir}`,
  ];
  for (const [runtimeName, items] of report.synced) {
    lines.push(`  runtime ${runtimeName}:`);
    for (const item of items) {
      lines.push(`    ${item.command_name} -> ${item.installed_skill_path}`);
    }
  }
  // On stderr, not stdout: the install SUCCEEDED, and a warning must not land
  // in the bytes a caller parses as the install report.
  const stderr =
    report.unmigrated.length === 0
      ? ""
      : [
          `Warning: extension/${report.extensionId} declares no runtime for ` +
            `${report.unmigrated.length} capability(ies):`,
          ...report.unmigrated.map((entry) => `  ${entry}`),
          "These will refuse until they declare a runtime. " +
            "See docs/releases/pending-cutoffs.md.",
          "",
        ].join("\n");
  return { stdout: `${lines.join("\n")}\n`, stderr, exitCode: 0 };
}

/** The `uninstall` report, in Python's print order. */
export function renderUninstallReport(report: UninstallReport): RenderedCommand {
  const lines = [
    `Uninstalled extension/${report.extensionId}`,
    `  installed: ${report.installedDir}`,
  ];
  if (report.sourceRemoved) lines.push("  source tree: removed");
  if (report.bindingsRemoved) {
    lines.push(`  bindings: ${report.bindingsRemoved} row(s) removed`);
  }
  for (const [runtimeName, items] of report.removed) {
    lines.push(`  runtime ${runtimeName}:`);
    for (const item of items) lines.push(`    removed ${item}`);
  }
  return { stdout: `${lines.join("\n")}\n`, stderr: "", exitCode: 0 };
}
