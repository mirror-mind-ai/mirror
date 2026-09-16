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
import { existsSync } from "node:fs";
import type { RenderedCommand } from "./catalog.ts";

export const MIRROR_CLI_PROTOCOL = "mirror-cli-v1";

/** The host's own id rule (`compat_host._EXTENSION_ID`). */
const EXTENSION_ID = /^[a-z][a-z0-9-]*$/;

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

  const command = options.hostCommand ?? DEFAULT_HOST_COMMAND;
  const spawn = options.spawn ?? spawnSync;
  const result = spawn(command[0] as string, command.slice(1), {
    cwd: options.hostCwd ?? process.cwd(),
    env: options.environment ?? process.env,
    input: `${JSON.stringify(buildSubcommandRequest(dispatch, options.databasePath))}\n`,
    // stdin is the request pipe; stdout and stderr are the user's.
    stdio: ["pipe", "inherit", "inherit"],
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    windowsHide: true,
    shell: false,
  });
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
