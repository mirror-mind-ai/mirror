// `ext <id>` and `ext <id> <subcommand>` (CV22.DS7.TS4 plateau 4).
//
// The dispatch is the one leaf in DS7 whose behavior is decided by code Mirror
// does not own. Navigator decision D1 (2026-09-16) split it in two:
//
//   * TypeScript owns everything the dispatcher can decide by itself -- argv
//     splitting, the built-in verbs, the help guard, the installed check, and
//     the exit code. That half lives in `catalogCommands.ts` and produces the
//     `ExtensionDispatch` DECISION below, without running anything.
//   * Execution is this module. A subcommand whose extension declares a
//     language-neutral command runtime is executed directly; anything else
//     reaches the `cli` mode of the existing `memory.extensions.compat_host`
//     -- a second request kind of TS2's host, never a second host, under
//     DS10's single deletion gate.
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

/** The host's own id rule (`compat_host._EXTENSION_ID`). */
const EXTENSION_ID = /^[a-z][a-z0-9-]*$/;

/** The three spellings `_dispatch_subcommand` treats as the listing request. */
const HELP_SUBCOMMANDS = new Set(["--help", "-h", "help"]);

const DEFAULT_HOST_COMMAND = [
  "uv",
  "run",
  "python",
  "-m",
  "memory.extensions.compat_host",
] as const;

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
}

export interface ExtensionSubcommandRequest {
  protocol: typeof MIRROR_CLI_PROTOCOL;
  extension_id: string;
  subcommand: string;
  argv: readonly string[];
  mirror_home: string;
  extension_root: string;
  database_path: string;
}

export interface DispatchOptions {
  databasePath: string;
  hostCommand?: readonly string[];
  hostCwd?: string;
  environment?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  /** Injected so tests can assert what would be spawned without spawning. */
  spawn?: typeof spawnSync;
  onError?: (message: string) => void;
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

export function buildSubcommandRequest(
  dispatch: ExtensionDispatch,
  databasePath: string,
): ExtensionSubcommandRequest {
  return {
    protocol: MIRROR_CLI_PROTOCOL,
    extension_id: dispatch.extensionId,
    subcommand: dispatch.subcommand,
    argv: [...dispatch.argv],
    mirror_home: dispatch.mirrorHome,
    extension_root: dispatch.extensionRoot,
    database_path: databasePath,
  };
}

/**
 * Execute one extension subcommand and return its exit code.
 *
 * Refuses an id the host would refuse, BEFORE spawning: the installed check
 * has already passed at this point, so an id that cannot be a legal extension
 * id can only be a traversal attempt at a real directory. Python answers those
 * with a manifest traceback; TypeScript answers with one line on stderr at the
 * same exit code -- the recorded divergence class for this family.
 */
/**
 * Ask the host to load an installed command-skill and call `register(api)`.
 *
 * The one thing `extensions install` still cannot do without an interpreter.
 * Migrations are the TypeScript port's; this is the entrypoint import, and it
 * has to happen at install time for the reason Python does it there: an
 * extension whose `register` raises must fail the INSTALL, not the first
 * command someone runs a week later.
 *
 * A mode of the same `mirror-cli-v1` request kind, not a new protocol and not
 * a second host -- it dies with the rest of the bridge at DS10. Unlike a
 * dispatch, streams are captured: a registration is not a command, so its
 * output is diagnostics rather than product.
 */
export function validateExtensionRegister(
  extensionId: string,
  mirrorHome: string,
  extensionRoot: string,
  options: DispatchOptions,
): { ok: true } | { ok: false; message: string } {
  const command = options.hostCommand ?? DEFAULT_HOST_COMMAND;
  const spawn = options.spawn ?? spawnSync;
  const request = {
    protocol: MIRROR_CLI_PROTOCOL,
    mode: "validate_register",
    extension_id: extensionId,
    argv: [],
    mirror_home: mirrorHome,
    extension_root: extensionRoot,
    database_path: options.databasePath,
  };
  const result = spawn(command[0] as string, command.slice(1), {
    cwd: options.hostCwd ?? process.cwd(),
    env: options.environment ?? process.env,
    encoding: "utf8",
    input: `${JSON.stringify(request)}\n`,
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    windowsHide: true,
    shell: false,
  });
  if (result.error) {
    return {
      ok: false,
      message: `register(api) could not be validated for extension/${extensionId}: the Python host could not be started`,
    };
  }
  if (result.status === 0) return { ok: true };
  const reported = String(result.stderr ?? "")
    .trimEnd()
    .split("\n")
    .at(-1);
  return {
    ok: false,
    message: reported || `register(api) failed for extension/${extensionId}`,
  };
}

function spawnHost(
  dispatch: ExtensionDispatch,
  options: DispatchOptions,
  spawn: typeof spawnSync,
): ReturnType<typeof spawnSync> {
  const command = options.hostCommand ?? DEFAULT_HOST_COMMAND;
  return spawn(command[0] as string, command.slice(1), {
    cwd: options.hostCwd ?? process.cwd(),
    env: options.environment ?? process.env,
    input: `${JSON.stringify(buildSubcommandRequest(dispatch, options.databasePath))}\n`,
    // stdin is the request pipe; stdout and stderr are the user's.
    stdio: ["pipe", "inherit", "inherit"],
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    windowsHide: true,
    shell: false,
  });
}

export function runExtensionSubcommand(
  dispatch: ExtensionDispatch,
  options: DispatchOptions,
): number {
  const report = options.onError ?? ((message: string) => process.stderr.write(`${message}\n`));
  if (!EXTENSION_ID.test(dispatch.extensionId)) {
    report(`Mirror TS front door: '${dispatch.extensionId}' is not a valid extension id.`);
    return 1;
  }
  if (!existsSync(dispatch.extensionRoot)) return 1;

  // The listing stays with the host even for a declared extension: Python
  // answers it from the live `api.cli_registry`, and a manifest-rendered
  // listing would disagree with it for any extension that registers a
  // subcommand it never declared. DS10 owns the post-retirement listing.
  const declared = HELP_SUBCOMMANDS.has(dispatch.subcommand)
    ? undefined
    : readDeclaredCommands(dispatch.extensionRoot).find(
        (candidate) => candidate.name === dispatch.subcommand,
      );

  const spawn = options.spawn ?? spawnSync;
  const result = declared
    ? spawn(declared.command[0] as string, [...declared.command.slice(1), ...dispatch.argv], {
        cwd: dispatch.extensionRoot,
        env: declaredEnvironment(dispatch, options),
        // All three streams are the user's: a declared command may read stdin,
        // which is precisely what the legacy bridge cannot allow.
        stdio: "inherit",
        timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        windowsHide: true,
        shell: false,
      })
    : spawnHost(dispatch, options, spawn);
  if (result.error && declared) {
    report(
      `Mirror TS front door: extension/${dispatch.extensionId} declares a command for ` +
        `'${dispatch.subcommand}' that could not be started: ${result.error.message}`,
    );
    return 1;
  }
  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      report(
        "Mirror TS front door: could not spawn `uv` — extension subcommands still need " +
          "Python until their extension declares a command runtime.",
      );
    } else if (code === "ETIMEDOUT") {
      report(
        `Mirror TS front door: extension subcommand timed out after ` +
          `${options.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms.`,
      );
    } else {
      report(`Mirror TS front door: extension subcommand failed to run: ${result.error.message}`);
    }
    return 1;
  }
  return typeof result.status === "number" ? result.status : 1;
}
