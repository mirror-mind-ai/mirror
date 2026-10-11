// `ext <id>` and `ext <id> <subcommand>` (CV22.DS7.TS4 plateau 4).
//
// The dispatch is the one leaf in DS7 whose behavior is decided by code Mirror
// does not own. Navigator decision D1 (2026-09-16) split it in two:
//
//   * TypeScript owns everything the dispatcher can decide by itself -- argv
//     splitting, the built-in verbs, the help guard, the installed check, and
//     the exit code. That half lives in `catalogCommands.ts` and produces the
//     `ExtensionDispatch` DECISION below, without running anything.
//   * Execution is this module.
//
// CV22.DS10.TS2 closed that gate. The Python compatibility host is deleted, so
// the ONLY thing this module executes is a subcommand whose extension declares
// a language-neutral `mirror-cli-v1` runtime. Everything else -- the listing,
// an unknown subcommand, a subcommand documented without a runtime -- is now a
// DECISION rendered as bytes in `catalogCommands.ts`, with no process at all.
// `readSubcommandListing` and `renderSubcommandListing` therefore live here,
// beside the manifest reader they share, but are called from the decision
// layer: parsing the manifest is this module's knowledge; choosing what to
// print is not.
//
// TWO measured facts shape this file, both recorded in the golden:
//
//   1. `_installed_extension_dir` builds its path with `Path.__truediv__` and
//      NEVER normalizes it, and that path is printed. `ext ../../etc ping`
//      answers `extension not installed: <home>/extensions/../../etc`, and an
//      ABSOLUTE id discards the extensions root entirely (`ext /etc ping`
//      reads `/etc/skill.yaml`). `join()` would quietly repair both, which is
//      the divergence this module exists to avoid.
//   2. Streams are INHERITED, not captured. A command's output is its product:
//      it must stream as it is produced, keep stdout/stderr interleaving, and
//      preserve the handler's exit code unchanged (a handler returning 3 exits
//      3; `int("7")` exits 7).
//
// KNOWN LIMIT, recorded rather than papered over: the request travels on the
// host's stdin, so a legacy handler cannot read the user's stdin through the
// bridge. Measured first -- no CLI handler in any installed extension reads
// stdin -- and the declared-runtime path is free to define stdin passthrough
// when it lands.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { parse } from "yaml";
import type { RenderedCommand } from "./catalog.ts";
import { tablePrefixFor } from "./migrations.ts";

export const MIRROR_CLI_PROTOCOL = "mirror-cli-v1";

/** The extension id rule, unchanged since the catalog defined it. */
const EXTENSION_ID = /^[a-z][a-z0-9-]*$/;

/** Generous but finite, like the front door's Python fallback. */
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * What the pure dispatcher decided, for a caller that is allowed to spawn.
 *
 * `subcommand` is `--help` for the `ext <id>` listing, which is how the Python
 * dispatcher already models it: the listing is a dispatch, not a separate
 * command, and it loads the extension exactly like any other subcommand.
 */
export interface ExtensionDispatch {
  kind: "extension-subcommand";
  extensionId: string;
  subcommand: string;
  argv: readonly string[];
  mirrorHome: string;
  extensionRoot: string;
  /**
   * The declared command to run, resolved by the decision layer.
   *
   * Carried on the decision rather than re-read here: deciding that this
   * subcommand was executable at all already required parsing the manifest,
   * and reading it twice is how two layers drift.
   */
  command: readonly string[];
}

export interface DispatchOptions {
  databasePath: string;
  environment?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  /** Injected so tests can assert what would be spawned without spawning. */
  spawn?: typeof spawnSync;
  onError?: (message: string) => void;
}

/**
 * One `cli.subcommands[]` entry as the listing needs it.
 *
 * `hasRuntime` is the migration state made visible: an entry the manifest
 * documents but declares no runtime for is listed, flagged, and refused --
 * never silently absent, which would read as "the extension lost a command"
 * rather than "this command needs migrating".
 */
export interface SubcommandEntry {
  name: string;
  summary: string;
  hasRuntime: boolean;
}

/**
 * A subcommand's declared, language-neutral command.
 *
 * It hangs off the `cli.subcommands[]` entries the manifest format already
 * had, rather than a parallel `commands[]` array: an extension keeps ONE list
 * of its subcommands, so a declared name and a documented name cannot drift.
 */
interface DeclaredCommand {
  name: string;
  command: string[];
}

/**
 * Read the declared commands, tolerantly.
 *
 * Deliberately NOT part of `loadExtensionManifest`: that function is a port of
 * Python's validator, graded byte for byte by the catalog reads, and Python
 * ignores `cli:` entirely. A TypeScript-only field that could FAIL validation
 * would make `extensions list` report an invalid extension where Python
 * reports a valid one.
 *
 * So every structural problem here -- unreadable manifest, wrong protocol,
 * empty argv, a path escaping the extension root -- drops that one entry and
 * lets the host answer, which is exactly what Python does today. A declaration
 * TypeScript will not execute is never a refusal; it is a fallback.
 */
export function readDeclaredCommands(extensionRoot: string): DeclaredCommand[] {
  let parsed: unknown;
  try {
    parsed = parse(readFileSync(join(extensionRoot, "skill.yaml"), "utf8"));
  } catch {
    return [];
  }
  if (!isRecord(parsed) || !isRecord(parsed.cli)) return [];
  const subcommands = parsed.cli.subcommands;
  if (!Array.isArray(subcommands)) return [];
  const declared: DeclaredCommand[] = [];
  const seen = new Set<string>();
  for (const entry of subcommands) {
    if (!isRecord(entry) || typeof entry.name !== "string" || entry.name.length === 0) continue;
    if (seen.has(entry.name)) continue;
    seen.add(entry.name);
    const runtime = entry.runtime;
    if (!isRecord(runtime) || runtime.protocol !== MIRROR_CLI_PROTOCOL) continue;
    const command = runtime.command;
    if (
      !Array.isArray(command) ||
      command.length === 0 ||
      !command.every((part) => typeof part === "string" && part.length > 0)
    ) {
      continue;
    }
    if (!commandStaysInside(extensionRoot, command as string[])) continue;
    declared.push({ name: entry.name, command: [...(command as string[])] });
  }
  return declared;
}

/**
 * Path-like arguments must resolve inside the installed extension root, the
 * same rule `provider_runtime.command` follows. An extension is trusted code,
 * but a manifest that reaches OUT of its own directory is not a contract --
 * it is a way to make the core launch something the installer never placed.
 */
function commandStaysInside(extensionRoot: string, command: readonly string[]): boolean {
  const root = resolve(extensionRoot);
  for (const [index, argument] of command.entries()) {
    const pathLike =
      isAbsolute(argument) ||
      argument.includes("/") ||
      argument.includes("\\") ||
      (index > 0 && /\.(?:[cm]?js|py)$/i.test(argument));
    if (!pathLike) continue;
    if (isAbsolute(argument)) return false;
    const candidate = resolve(root, argument);
    const rel = relative(root, candidate);
    if (rel === ".." || rel.startsWith(`..${"/"}`) || rel.startsWith("..\\")) return false;
    if (!existsSync(candidate)) return false;
  }
  return true;
}

/**
 * The context a declared command receives.
 *
 * In the ENVIRONMENT, never on stdin: stdin belongs to the user, which is the
 * one thing the legacy bridge cannot offer. Argv is appended to the declared
 * command verbatim, so a declared command sees exactly what a legacy handler
 * sees.
 */
function declaredEnvironment(
  dispatch: ExtensionDispatch,
  options: DispatchOptions,
): NodeJS.ProcessEnv {
  return {
    ...(options.environment ?? process.env),
    MIRROR_HOME: dispatch.mirrorHome,
    MIRROR_DATABASE_PATH: options.databasePath,
    MIRROR_EXTENSION_ID: dispatch.extensionId,
    MIRROR_EXTENSION_ROOT: dispatch.extensionRoot,
    MIRROR_TABLE_PREFIX: tablePrefixFor(dispatch.extensionId),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Python's `PurePath.__truediv__`, which is NOT `node:path.join`.
 *
 * Empty and `.` segments vanish, a trailing slash is dropped, `..` is
 * PRESERVED, and an absolute segment replaces the whole left side. Every one
 * of those is an observable byte in `extension not installed: <path>`.
 */
export function pythonPathJoin(root: string, segment: string): string {
  const absolute = segment.startsWith("/");
  const parts = segment.split("/").filter((part) => part !== "" && part !== ".");
  if (absolute) return parts.length === 0 ? "/" : `/${parts.join("/")}`;
  if (parts.length === 0) return root;
  const separator = root.endsWith("/") ? "" : "/";
  return `${root}${separator}${parts.join("/")}`;
}

/** Port of `_installed_extension_dir`. */
export function installedExtensionDir(mirrorHome: string, extensionId: string): string {
  return pythonPathJoin(pythonPathJoin(mirrorHome, "extensions"), extensionId);
}

/**
 * Port of the `not ext_dir.exists()` branch shared by `_dispatch_subcommand`
 * and `_cmd_migrate`: one printed line on stdout at exit 1, with the
 * unnormalized path.
 */
export function extensionNotInstalled(mirrorHome: string, extensionId: string): RenderedCommand {
  return {
    stdout: `extension not installed: ${installedExtensionDir(mirrorHome, extensionId)}\n`,
    stderr: "",
    exitCode: 1,
  };
}

export function isExtensionDispatch(value: unknown): value is ExtensionDispatch {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as ExtensionDispatch).kind === "extension-subcommand"
  );
}

/**
 * Every documented subcommand, declared or not, in manifest order.
 *
 * Tolerant for the same reason `readDeclaredCommands` is: a manifest problem
 * must never turn a listing into a refusal. An unreadable or shapeless
 * manifest simply has no subcommands to list.
 */
export function readSubcommandListing(extensionRoot: string): SubcommandEntry[] {
  let parsed: unknown;
  try {
    parsed = parse(readFileSync(join(extensionRoot, "skill.yaml"), "utf8"));
  } catch {
    return [];
  }
  if (!isRecord(parsed) || !isRecord(parsed.cli)) return [];
  const subcommands = parsed.cli.subcommands;
  if (!Array.isArray(subcommands)) return [];
  const declared = new Set(readDeclaredCommands(extensionRoot).map((entry) => entry.name));
  const entries: SubcommandEntry[] = [];
  const seen = new Set<string>();
  for (const entry of subcommands) {
    if (!isRecord(entry) || typeof entry.name !== "string" || entry.name.length === 0) continue;
    if (seen.has(entry.name)) continue;
    seen.add(entry.name);
    entries.push({
      name: entry.name,
      summary: typeof entry.summary === "string" ? entry.summary : "",
      hasRuntime: declared.has(entry.name),
    });
  }
  return entries;
}

/**
 * The `ext <id>` listing, rendered from the manifest.
 *
 * Python rendered this from the LIVE `api.cli_registry`, so a handler
 * registered but never documented appeared, and a documented-but-unregistered
 * one did not. With the host gone the manifest is the only source, which makes
 * this TypeScript's surface from here on -- a recorded divergence, not a
 * parity failure. Sorted by name, as Python sorted its registry, so the bytes
 * stay stable across manifest reordering.
 */
export function renderSubcommandListing(extensionId: string, entries: SubcommandEntry[]): string {
  const lines = [`=== subcommands of extension/${extensionId} ===`];
  if (entries.length === 0) {
    lines.push("  (none declared)");
    return `${lines.join("\n")}\n`;
  }
  const sorted = [...entries].sort((left, right) => (left.name < right.name ? -1 : 1));
  for (const entry of sorted) {
    const summary = entry.summary ? ` — ${entry.summary}` : "";
    const flag = entry.hasRuntime ? "" : "  (no runtime declared)";
    lines.push(`  ${entry.name}${summary}${flag}`);
  }
  return `${lines.join("\n")}\n`;
}

/**
 * What a documented subcommand with no declared runtime says now.
 *
 * One line naming the extension, the subcommand, and the fix. No traceback, no
 * spawn, no partial output: the command did not run, and the message says why
 * in the vocabulary of the thing the user has to change.
 */
export function noRuntimeRefusal(extensionId: string, subcommand: string): string {
  return (
    `Mirror: extension/${extensionId} declares no runtime for '${subcommand}'. ` +
    `The Python compatibility host was retired — declare ` +
    `cli.subcommands[].runtime (${MIRROR_CLI_PROTOCOL}) in skill.yaml. ` +
    `See docs/releases/pending-cutoffs.md.\n`
  );
}

/**
 * Execute one DECLARED extension subcommand and return its exit code.
 *
 * Every other outcome was decided before this is called, so there is exactly
 * one process here and one way to fail to start it. Refuses an id that cannot
 * be a legal extension id BEFORE spawning: the installed check has already
 * passed, so such an id can only be a traversal attempt at a real directory.
 */
export function runExtensionSubcommand(
  dispatch: ExtensionDispatch,
  options: DispatchOptions,
): number {
  const report = options.onError ?? ((message: string) => process.stderr.write(`${message}\n`));
  if (!EXTENSION_ID.test(dispatch.extensionId)) {
    report(`Mirror: '${dispatch.extensionId}' is not a valid extension id.`);
    return 1;
  }
  if (!existsSync(dispatch.extensionRoot)) return 1;

  const [executable, ...head] = dispatch.command;
  const spawn = options.spawn ?? spawnSync;
  const result = spawn(executable as string, [...head, ...dispatch.argv], {
    cwd: dispatch.extensionRoot,
    env: declaredEnvironment(dispatch, options),
    // All three streams are the user's: a declared command may read stdin,
    // which is precisely what the retired bridge could never allow.
    stdio: "inherit",
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    windowsHide: true,
    shell: false,
  });
  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code;
    if (code === "ETIMEDOUT") {
      report(
        `Mirror: extension/${dispatch.extensionId} '${dispatch.subcommand}' timed out after ` +
          `${options.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms.`,
      );
    } else {
      report(
        `Mirror: extension/${dispatch.extensionId} declares a command for ` +
          `'${dispatch.subcommand}' that could not be started: ${result.error.message}`,
      );
    }
    return 1;
  }
  return typeof result.status === "number" ? result.status : 1;
}
