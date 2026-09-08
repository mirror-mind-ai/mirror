// Front-door routes for the daily-visible tail (CV22.DS7.TS3 plateau 5):
// `welcome` and the READ-ONLY `runtime` subcommands.
//
// The subcommand allowlist here is the enforcement point for the plan's
// central boundary. `runtime` carries both the read surface this story ports
// and the git-based updater and release machinery, which the 2026-09-07
// decision assigned to CV22.DS10 for redesign under npm distribution. Those
// stay Python by EXPLICIT REFUSAL, never by inheritance (RS009's rule): a
// future subcommand added to Python must not silently acquire a TS route
// because the command name already had one.

import { join } from "node:path";
import { resolveMirrorHome } from "#frontDoor/dbPath.ts";
import {
  diagnoseRuntime,
  probeModelPins,
  renderRuntimeDiagnosis,
  rootStateFindings,
} from "#runtime/diagnose.ts";
import {
  inspectCloneRole,
  inspectGit,
  inspectGitWorktree,
  inspectUpdateChannel,
  renderRuntimeVersion,
  versionFromPyproject,
} from "#runtime/git.ts";
import {
  buildPendingReleaseNotes,
  readReleaseNote,
  renderReleaseNote,
  renderReleaseNotesBundle,
} from "#runtime/releaseNotes.ts";
import { buildRuntimeStatus, renderRuntimeStatus, statusVerdict } from "#runtime/status.ts";
import { expandHome } from "#util/paths.ts";
import { composeWelcome, welcomeDisabled } from "#welcome/card.ts";
import { composeStatusLine } from "#welcome/statusLine.ts";

/** The `runtime` subcommands this story ports. */
export const TS_RUNTIME_READ_SUBCOMMANDS = new Set([
  "status",
  "version",
  "diagnose",
  "release-notes",
]);

/**
 * The `runtime` subcommands that stay Python, each named on purpose.
 * `latest` and `pending` are ARGUMENTS of `release-notes`, not subcommands --
 * the 2026-09-07 decision text and the burn-down ledger's table listed them as
 * subcommands, and this story corrects that.
 */
export const DS10_RUNTIME_SUBCOMMANDS = new Set([
  "update",
  "pull",
  "stable",
  "backup",
  "release-doctor",
  "release-promote",
]);

function optionValue(args: readonly string[], name: string): string | null {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

/**
 * The mirror home for a welcome invocation. An explicit `--mirror-home` is
 * authoritative even when the repository `.env` supplies MIRROR_USER, matching
 * the oracle's `resolve_mirror_home(mirror_home=..., mirror_user="")`: tests
 * and one-off diagnostics must not be shadowed by the ambient user.
 */
function resolveWelcomeHome(explicit: string | null, env: NodeJS.ProcessEnv): string | null {
  try {
    if (explicit !== null) {
      if (explicit === "") return null;
      return resolveMirrorHome({ MIRROR_HOME: expandHome(explicit), MIRROR_USER: "" });
    }
    return resolveMirrorHome(env);
  } catch {
    return null;
  }
}

export interface RuntimeRouteIo {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdout?: (text: string) => void;
}

function writeOut(io: RuntimeRouteIo, text: string): void {
  (io.stdout ?? ((value: string) => process.stdout.write(value)))(text);
}

/** Port of `welcome.main`. Always exits 0, like the oracle. */
export function runWelcomeRoute(argv: readonly string[], io: RuntimeRouteIo = {}): number {
  const env = io.env ?? process.env;
  const cwd = io.cwd ?? process.cwd();
  const args = argv.slice(1);
  if (welcomeDisabled(env)) return 0;

  const home = resolveWelcomeHome(optionValue(args, "--mirror-home"), env);

  if (args.includes("--status-line")) {
    const line = composeStatusLine({
      mirrorHome: home,
      sessionId: optionValue(args, "--session-id"),
      env,
    });
    if (line) writeOut(io, `${line}\n`);
    return 0;
  }

  const version = versionFromPyproject(cwd) ?? "unknown";
  const card = composeWelcome({
    mirrorHome: home,
    cwd,
    env,
    version,
    updateChannel: inspectUpdateChannel(cwd, null),
  });
  if (card) writeOut(io, `${card}\n`);
  return 0;
}

/** Port of the read half of `cmd_runtime`. */
export async function runRuntimeReadRoute(
  argv: readonly string[],
  io: RuntimeRouteIo = {},
): Promise<number> {
  const env = io.env ?? process.env;
  const cwd = io.cwd ?? process.cwd();
  const args = argv.slice(1);
  const subcommand = args[0] ?? "";
  const version = versionFromPyproject(cwd) ?? "unknown";

  if (subcommand === "version") {
    const startArg = optionValue(args, "--start");
    const start = startArg ? expandHome(startArg) : cwd;
    writeOut(
      io,
      renderRuntimeVersion({
        version,
        git: inspectGit(start),
        cloneRole: inspectCloneRole(start),
        updateChannel: inspectUpdateChannel(start, optionValue(args, "--channel")),
      }),
    );
    return 0;
  }

  if (subcommand === "status") {
    const report = buildRuntimeStatus({
      start: cwd,
      mirrorHome: optionValue(args, "--mirror-home"),
      channel: optionValue(args, "--channel"),
      env,
      version,
    });
    writeOut(io, renderRuntimeStatus(report, env));
    return statusVerdict(report) === "ready" ? 0 : 1;
  }

  if (subcommand === "diagnose") {
    const report = buildRuntimeStatus({
      start: cwd,
      mirrorHome: optionValue(args, "--mirror-home"),
      env,
      version,
    });
    const findings = [
      ...diagnoseRuntime(report, inspectGitWorktree(report.git.repository)),
      ...rootStateFindings(homesRoot(env)),
      // No catalog provider until DS8: inconclusive, which is also the
      // oracle's answer when it cannot reach OpenRouter.
      ...(await probeModelPins(null, "")),
    ];
    writeOut(io, renderRuntimeDiagnosis(findings));
    return findings.length === 0 ? 0 : 1;
  }

  if (subcommand === "release-notes") {
    const target = firstPositional(args.slice(1)) ?? "latest";
    if (target === "pending") {
      writeOut(
        io,
        renderReleaseNotesBundle(
          buildPendingReleaseNotes({
            // `--from` omitted falls back to the checkout's own version,
            // exactly as the oracle does before normalizing.
            currentVersion: optionValue(args, "--from") ?? version,
            ref: optionValue(args, "--ref") ?? "origin/stable",
            fetch: !args.includes("--no-fetch"),
            start: cwd,
          }),
        ),
      );
    } else {
      writeOut(io, renderReleaseNote(readReleaseNote(target, cwd)));
    }
    return 0;
  }

  // Unreachable through the routing table, which allowlists by subcommand.
  throw new Error(`runtime subcommand not ported to TS: ${subcommand || "(none)"}`);
}

/**
 * argparse's positional for `release-notes`: the first bare token that is not
 * consumed as the VALUE of `--from` or `--ref`. Walking the list is the only
 * way to tell `release-notes --ref pending` (a ref named pending) from
 * `release-notes pending` (the bundle).
 */
function firstPositional(args: readonly string[]): string | null {
  const valued = new Set(["--from", "--ref"]);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] as string;
    if (valued.has(arg)) {
      index += 1;
      continue;
    }
    if (arg.startsWith("-")) continue;
    return arg;
  }
  return null;
}

/** Python's ambient `DEFAULT_USER_HOMES_DIR`: `<home>/.mirror-minds`. */
function homesRoot(env: NodeJS.ProcessEnv): string {
  const home = env.HOME ?? env.USERPROFILE ?? "";
  return join(home, ".mirror-minds");
}
