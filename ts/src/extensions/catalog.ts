// Extension catalog READS (CV22.DS7.TS4 plateau 1).
//
// Port of the read half of `src/memory/cli/extensions.py` plus the catalog
// branches of `cli/inspect.py` and `cli/ext.py`: discovery, the runtime
// filter, the runtime catalog file, and the five renderers behind
// `extensions list|validate`, `ext list`, `list extensions`, `inspect
// extension`, and `inspect runtime-catalog`.
//
// MEASURED AT PLATEAU 1, and the reason the golden grades exit codes:
// `extensions` and `ext` are hand-rolled parsers. Every refusal in this family
// prints to **stdout** and exits **1** -- stderr is empty even for a bare
// `inspect` or an unknown `list` target. Three measured facts a reading of the
// code would not have given:
//
//   * `extensions validate` and `extensions sync` print the INVALID block and
//     exit 1 BEFORE reaching their own "sync requires --runtime" message, so an
//     invalid extension masks a usage error;
//   * `ext --help` and a bare `ext` print the same bytes and differ only in
//     exit code (0 against 1);
//   * a MISSING or CORRUPT runtime catalog is rendered as an empty catalog at
//     exit **0**, not as an error -- `_load_catalog` swallows both.
//
// The write half (`sync`, `install`, `uninstall`, `expose-claude`,
// `clean-claude`) is plateau 4 and deliberately absent.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { sortByCodePoint } from "#util/pythonText.ts";
import { ExtensionValidationError } from "./errors.ts";
import { type ExtensionManifest, loadExtensionManifest } from "./manifest.ts";

/** Port of `default_extensions_dir_for_home`. */
export function extensionsRootForHome(mirrorHome: string): string {
  return join(mirrorHome, "extensions");
}

/** Port of `default_runtime_skills_dir_for_home`. */
export function runtimeSkillsRootForHome(mirrorHome: string, runtime: string): string {
  return join(mirrorHome, "runtime", "skills", runtime);
}

export interface DiscoveryResult {
  manifests: ExtensionManifest[];
  /** `(extension_id, message)` pairs, in discovery order. */
  errors: Array<readonly [string, string]>;
}

/**
 * Port of `discover_extensions`.
 *
 * A missing root is empty, not an error. A child that is not a directory or
 * carries no `skill.yaml` is skipped SILENTLY -- only a present-but-invalid
 * manifest becomes an error row. Python iterates `sorted(root.iterdir())`;
 * every child shares one parent, so that is name order by code point.
 */
export function discoverExtensions(extensionsRoot: string): DiscoveryResult {
  if (!existsSync(extensionsRoot)) return { manifests: [], errors: [] };

  const manifests: ExtensionManifest[] = [];
  const errors: Array<readonly [string, string]> = [];
  for (const name of sortByCodePoint(readdirSync(extensionsRoot))) {
    const child = join(extensionsRoot, name);
    if (!isDirectory(child)) continue;
    if (!existsSync(join(child, "skill.yaml"))) continue;
    try {
      manifests.push(loadExtensionManifest(child));
    } catch (error) {
      if (!(error instanceof ExtensionValidationError)) throw error;
      errors.push([name, error.message] as const);
    }
  }
  return { manifests, errors };
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Port of `filter_manifests_for_runtime`. */
export function filterManifestsForRuntime(
  manifests: readonly ExtensionManifest[],
  runtime: string | null,
): ExtensionManifest[] {
  if (runtime === null) return [...manifests];
  return manifests.filter((manifest) => runtime in manifest.runtimes);
}

function invalidBlock(errors: ReadonlyArray<readonly [string, string]>): string {
  if (errors.length === 0) return "";
  const lines = ["", "=== INVALID EXTENSIONS ==="];
  for (const [extensionId, message] of errors) lines.push(`  ${extensionId}: ${message}`);
  return `${lines.join("\n")}\n`;
}

/** Port of `print_extension_list`. */
export function renderExtensionList(
  manifests: readonly ExtensionManifest[],
  errors: ReadonlyArray<readonly [string, string]>,
  root: string,
): string {
  const lines = [`Extensions root: ${root}`, "=== EXTENSIONS ==="];
  if (manifests.length === 0) lines.push("  (none)");
  for (const manifest of manifests) {
    lines.push(`  ${manifest.id} [${manifest.kind}]`);
    lines.push(`    name: ${manifest.name}`);
    const parts = sortByCodePoint(Object.keys(manifest.runtimes)).map(
      (runtimeName) => `${runtimeName}=${manifest.runtimes[runtimeName]?.commandName ?? ""}`,
    );
    lines.push(`    runtimes: ${parts.join(", ")}`);
  }
  return `${lines.join("\n")}\n${invalidBlock(errors)}`;
}

/** Port of `ext._cmd_list`: command-skills only, id and summary. */
export function renderCommandSkillList(
  manifests: readonly ExtensionManifest[],
  errors: ReadonlyArray<readonly [string, string]>,
  root: string,
): string {
  const commandSkills = manifests.filter((manifest) => manifest.kind === "command-skill");
  const lines = [`Extensions root: ${root}`, "=== COMMAND-SKILL EXTENSIONS ==="];
  if (commandSkills.length === 0) lines.push("  (none)");
  for (const manifest of commandSkills) lines.push(`  ${manifest.id}: ${manifest.summary}`);
  return `${lines.join("\n")}\n${invalidBlock(errors)}`;
}

export interface RenderedCommand {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Port of `_inspect_extension`. The refusal is TWO stdout lines and exit 1,
 * with the validator's own message as the reason -- so a broken manifest and
 * an absent directory are reported the same way, differing only in the reason.
 */
export function renderInspectExtension(root: string, extensionId: string): RenderedCommand {
  let manifest: ExtensionManifest;
  try {
    manifest = loadExtensionManifest(join(root, extensionId));
  } catch (error) {
    if (!(error instanceof ExtensionValidationError)) throw error;
    return {
      stdout: `extension/${extensionId} not found or invalid\nreason: ${error.message}\n`,
      stderr: "",
      exitCode: 1,
    };
  }

  const lines = [
    `=== extension/${extensionId} ===`,
    `name: ${manifest.name}`,
    `category: ${manifest.category}`,
    `kind: ${manifest.kind}`,
    `summary: ${manifest.summary}`,
    `root: ${manifest.root}`,
    `manifest_path: ${manifest.manifestPath}`,
  ];
  if (manifest.entrypoint.length > 0) {
    lines.push("entrypoint:");
    for (const [key, value] of manifest.entrypoint) lines.push(`  ${key}: ${value}`);
  }
  lines.push("runtimes:");
  for (const runtimeName of sortByCodePoint(Object.keys(manifest.runtimes))) {
    const runtime = manifest.runtimes[runtimeName];
    if (runtime === undefined) continue;
    lines.push(`  ${runtimeName}:`);
    lines.push(`    command_name: ${runtime.commandName}`);
    if (runtime.skillFile) lines.push(`    skill_file: ${runtime.skillFile}`);
    if (runtime.skillPath) lines.push(`    skill_path: ${runtime.skillPath}`);
  }
  return { stdout: `${lines.join("\n")}\n`, stderr: "", exitCode: 0 };
}

export interface RuntimeCatalog {
  schemaVersion: unknown;
  runtime: unknown;
  generatedAt: unknown;
  extensions: unknown[];
}

/**
 * Port of `_load_catalog`. Absent, unreadable, and malformed all answer with
 * the same empty catalog -- the reason `inspect runtime-catalog` on a corrupt
 * file exits 0. A bare LIST is the schema-0 legacy shape.
 */
export function loadCatalog(catalogPath: string): RuntimeCatalog {
  const empty: RuntimeCatalog = {
    schemaVersion: "1",
    runtime: undefined,
    generatedAt: undefined,
    extensions: [],
  };
  if (!existsSync(catalogPath)) return empty;
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(catalogPath, "utf8"));
  } catch {
    return empty;
  }
  if (Array.isArray(data)) {
    return { schemaVersion: "0", runtime: undefined, generatedAt: undefined, extensions: data };
  }
  if (typeof data !== "object" || data === null) return empty;
  const record = data as Record<string, unknown>;
  return {
    schemaVersion: record.schema_version,
    runtime: record.runtime,
    generatedAt: record.generated_at,
    extensions: Array.isArray(record.extensions) ? record.extensions : [],
  };
}

function catalogField(value: unknown): string {
  return value === undefined || value === null ? "(unknown)" : String(value);
}

/** Port of `_inspect_runtime_catalog`. Always exit 0, even with no catalog. */
export function renderInspectRuntimeCatalog(runtimeRoot: string, runtime: string): string {
  const catalogPath = join(runtimeRoot, "extensions.json");
  const catalog = loadCatalog(catalogPath);
  const lines = [
    `=== runtime-catalog/${runtime} ===`,
    `runtime_root: ${runtimeRoot}`,
    `catalog_path: ${catalogPath}`,
    `schema_version: ${catalogField(catalog.schemaVersion)}`,
    `generated_at: ${catalogField(catalog.generatedAt)}`,
    "extensions:",
  ];
  if (catalog.extensions.length === 0) {
    lines.push("  (none)");
    return `${lines.join("\n")}\n`;
  }
  for (const item of catalog.extensions) {
    const entry = (typeof item === "object" && item !== null ? item : {}) as Record<
      string,
      unknown
    >;
    lines.push(`  ${catalogField(entry.id)} -> ${catalogField(entry.command_name)}`);
    lines.push(`    kind: ${catalogField(entry.kind)}`);
    lines.push(`    installed_skill_path: ${catalogField(entry.installed_skill_path)}`);
  }
  return `${lines.join("\n")}\n`;
}
