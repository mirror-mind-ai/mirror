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
import { createZipBackup } from "#backup/zipBackup.ts";
import { dbNameForEnv, resolveMirrorHome } from "#frontDoor/dbPath.ts";
import { frontDoorLogPath, logFrontDoor } from "#frontDoor/frontDoorLog.ts";
import {
  renderBackupVerification,
  renderRuntimeBackupCreated,
  verifyBackupArchive,
} from "#runtime/backup.ts";
import {
  diagnoseRuntime,
  probeModelPins,
  renderRuntimeDiagnosis,
  rootStateFindings,
} from "#runtime/diagnose.ts";
import {
  checkUpdateAvailability,
  inspectCloneRole,
  inspectGit,
  inspectGitWorktree,
  inspectUpdateChannel,
  packageVersion,
  renderRuntimeUpdateAvailability,
  renderRuntimeVersion,
  upstreamFor,
} from "#runtime/git.ts";
import { detectInstallKind } from "#runtime/installKind.ts";
import { MIGRATE_DECLINED_EXIT, renderMigrate, runMigrate } from "#runtime/migrate.ts";
import {
  buildPendingReleaseNotes,
  readReleaseNote,
  renderReleaseNote,
  renderReleaseNotesBundle,
} from "#runtime/releaseNotes.ts";
import { buildRuntimeStatus, renderRuntimeStatus, statusVerdict } from "#runtime/status.ts";
import { npmRootGlobal, readPackageChannel } from "#runtime/strategies/package.ts";
import { frontDoorSpawner, runUpdate, type UpdateSpawn } from "#runtime/update.ts";
import { statusAllowsUpdatePreflight } from "#runtime/updateGate.ts";
import { renderUpdateResult, updateLogDetail } from "#runtime/updatePipeline.ts";
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
 * Every `runtime` subcommand that EXISTS, in the order the oracle's argparse
 * lists them. One source of names: the usage line an unknown subcommand gets
 * is rendered from this, so it cannot drift from what the build answers.
 */
export const RUNTIME_SUBCOMMANDS = [
  "status",
  "version",
  "diagnose",
  "update",
  "release-notes",
  "release-doctor",
  "release-promote",
  "backup",
  // CV22.DS10.US2 (D8): not on the oracle. The updater spawns it in a fresh
  // process so the code that migrates is the code that was just installed.
  "migrate",
] as const;

/**
 * The `runtime` subcommands that stay Python, each named on purpose.
 *
 * `latest` and `pending` are ARGUMENTS of `release-notes`, not subcommands --
 * the 2026-09-07 decision text and the burn-down ledger's table listed them as
 * subcommands, and DS7.TS3 corrected that.
 *
 * CV22.DS10.US2 finished the correction the line above started: `pull` and
 * `stable` were in this set and have NEVER existed on either engine. `pull` is
 * the update planner's ACTION (`action: "pull"`); `stable` is the CHANNEL.
 * Both answer `invalid choice` with exit 2 on Python, so routing them here
 * claimed DS10 owed a port of something that was never a command. Four names,
 * and each leaves as its story flips it.
 */
/**
 * The updater family. US2 flipped it one subcommand at a time -- `backup`,
 * then `update` and the `migrate` verb D8 added -- and the set it emptied,
 * `DS10_RUNTIME_SUBCOMMANDS`, is gone: `release-doctor` and `release-promote`
 * were the last two names in it, and they are not ported but RETIRED from the
 * product surface, so they answer from the retired-surface table instead.
 *
 * Gated by `MIRROR_TS_RUNTIME_UPDATE`, deliberately NOT the reads' gate:
 * reverting a bad updater must not drag `status`, `version`, and `diagnose`
 * back to Python with it.
 */
export const TS_RUNTIME_UPDATE_SUBCOMMANDS = new Set(["backup", "update", "migrate"]);

/**
 * argparse's answer to a name that is not a subcommand, in TypeScript.
 *
 * Until US2 this fell through to Python, whose argparse names `__main__.py` --
 * a Python artifact that cannot survive TS5. At TS5 the fallthrough disappears
 * and nobody owns the answer, so TypeScript owns it now, while there is still
 * an oracle to compare against. The SHAPE is argparse's (usage, then one
 * `error:` line, both on stderr, exit 2); the vocabulary is the product's.
 * The deviation is deliberate and recorded in the story's plan.
 */
export function renderUnknownRuntimeSubcommand(subcommand: string): string {
  const choices = RUNTIME_SUBCOMMANDS.join(",");
  const detail =
    subcommand === ""
      ? "the following arguments are required: command"
      : `argument command: invalid choice: '${subcommand}' (choose from ${RUNTIME_SUBCOMMANDS.join(", ")})`;
  return `usage: runtime [-h] {${choices}} ...\nruntime: error: ${detail}\n`;
}

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
  /** Refusals go to stderr, as argparse's do. */
  stderr?: (text: string) => void;
}

function writeOut(io: RuntimeRouteIo, text: string): void {
  (io.stdout ?? ((value: string) => process.stdout.write(value)))(text);
}

function writeErr(io: RuntimeRouteIo, text: string): void {
  (io.stderr ?? ((value: string) => process.stderr.write(value)))(text);
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

  const version = packageVersion(cwd) ?? "unknown";
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
  const version = packageVersion(cwd) ?? "unknown";

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

  if (subcommand === "backup") return runRuntimeBackup(args.slice(1), io, env);
  if (subcommand === "migrate") return runRuntimeMigrate(args.slice(1), io, env);
  if (subcommand === "update") return runRuntimeUpdate(args.slice(1), io, env, cwd);

  // Not unreachable any more: the routing table sends every name it does not
  // recognize here, so that the refusal survives the oracle's deletion.
  writeErr(io, renderUnknownRuntimeSubcommand(subcommand));
  return 2;
}

/**
 * `runtime backup [--mirror-home PATH]` and `runtime backup --verify PATH`.
 *
 * NOT the `backup` command (DS7.TS1). That one creates and stops; this one is
 * the updater's safety stage, so it creates, verifies, and prints the manual
 * recovery route. The exit code follows the VERIFICATION, not the creation:
 * an archive that was written but does not open is a failure here, which is
 * the whole point of the stage.
 */
function runRuntimeBackup(
  args: readonly string[],
  io: RuntimeRouteIo,
  env: NodeJS.ProcessEnv,
): number {
  const verifyTarget = optionValue(args, "--verify");
  if (verifyTarget !== null) {
    const verification = verifyBackupArchive(expandHome(verifyTarget));
    writeOut(io, renderBackupVerification(verification));
    return verification.valid ? 0 : 1;
  }

  const explicitHome = optionValue(args, "--mirror-home");
  let mirrorHome: string;
  try {
    mirrorHome =
      explicitHome !== null
        ? expandHome(explicitHome)
        : resolveMirrorHome(env as Record<string, string | undefined>);
  } catch (error) {
    // Python writes the ValueError's own text and exits 1.
    writeErr(io, `${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  const dbPath = join(mirrorHome, dbNameForEnv(env.MEMORY_ENV || "production"));
  const backupPath = createZipBackup({
    dbPath,
    mirrorHome,
    backupDir: null,
    // The oracle passes `silent=True`: creation chatter would sit in the
    // middle of this command's own render.
    silent: true,
    env,
  });
  if (backupPath === null) {
    writeErr(io, `Database not found: ${dbPath}\n`);
    return 1;
  }

  const verification = verifyBackupArchive(backupPath);
  writeOut(io, renderRuntimeBackupCreated({ backupPath, mirrorHome, verification }));
  return verification.valid ? 0 : 1;
}

/** The mirror home this invocation addresses, or an error to print. */
function homeFor(
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): { home: string } | { error: string } {
  const explicit = optionValue(args, "--mirror-home");
  try {
    return {
      home:
        explicit !== null
          ? expandHome(explicit)
          : resolveMirrorHome(env as Record<string, string | undefined>),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/** `runtime migrate [--mirror-home PATH]` (CV22.DS10.US2, D8). */
function runRuntimeMigrate(
  args: readonly string[],
  io: RuntimeRouteIo,
  env: NodeJS.ProcessEnv,
): number {
  const resolved = homeFor(args, env);
  if ("error" in resolved) {
    writeErr(io, `${resolved.error}\n`);
    return 1;
  }
  const dbPath = join(resolved.home, dbNameForEnv(env.MEMORY_ENV || "production"));
  const outcome = runMigrate(dbPath);
  writeOut(io, renderMigrate(outcome));
  // A DECLINED migration exits non-zero (CV22.DS10.US2 debt D-025, paid in
  // TS5). The updater's migrate stage already fails on a non-zero code, so
  // this one line is what turns "the engine refused work it could not safely
  // do" from a passing stage into a failing one. Before this, `declined` and
  // `nothing pending` were the same exit 0.
  if (outcome.error !== null) return 1;
  return outcome.verdict === "declined" ? MIGRATE_DECLINED_EXIT : 0;
}

/**
 * `runtime update [--check|--dry-run|--repair-updater] [--no-fetch]
 * [--skip-migrations] [--mirror-home PATH] [--channel stable|main]`.
 */
function runRuntimeUpdate(
  args: readonly string[],
  io: RuntimeRouteIo,
  env: NodeJS.ProcessEnv,
  cwd: string,
): number {
  const version = packageVersion(cwd) ?? "unknown";
  const channelOverride = optionValue(args, "--channel");
  // `npm root -g` is resolved once, and only matters for identifying a
  // package install: a clone never pays for it.
  const install = detectInstallKind({
    frontDoorPath: frontDoorSelfPath(),
    npmRootGlobal: npmRootGlobal(),
  });
  const start = install.kind === "clone" ? install.repository : cwd;
  // The channel is scoped like the install: a clone's marker is per-checkout
  // and correctly tracked in git; a global npm install is per OS user, so its
  // channel lives in the user's config rather than in a Mirror home that one
  // of several could own.
  const channel =
    install.kind === "package"
      ? readPackageChannel(env, channelOverride)
      : inspectUpdateChannel(start, channelOverride);

  if (args.includes("--check")) {
    const availability = checkUpdateAvailability(start, channelOverride, version);
    writeOut(io, renderRuntimeUpdateAvailability(availability));
    return availability.status === "up_to_date" || availability.status === "update_available"
      ? 0
      : 1;
  }

  const resolved = homeFor(args, env);
  if ("error" in resolved) {
    writeErr(io, `${resolved.error}\n`);
    return 1;
  }
  const mirrorHome = resolved.home;
  const dbPath = join(mirrorHome, dbNameForEnv(env.MEMORY_ENV || "production"));

  // The repair lane is entered on request, and AUTOMATICALLY when the gate
  // throws rather than merely reporting trouble: an updater that cannot
  // evaluate its own status is exactly the failure the lane exists for, and
  // asking the broken status to authorize its own repair is circular.
  let repair = args.includes("--repair-updater");
  let repairReason = repair ? "requested with --repair-updater" : "";

  const gate = (): { ready: boolean; allowed: boolean; detail: string } => {
    const report = buildRuntimeStatus({
      start,
      mirrorHome,
      channel: channelOverride,
      env,
      version,
      // The gate needs a VERDICT, not a display field, and
      // `detectPythonVersion` spawns `uv run python` to fill one in. An
      // updater that spawns the interpreter it is replacing fails its own
      // acceptance -- caught by shadowing python/python3/uv on PATH during the
      // first end-to-end run. `statusAllowsUpdatePreflight` never reads this
      // field; `unknown` is the value the probe itself returns when it cannot
      // tell, so nothing downstream sees a value that could not occur.
      pythonVersion: "unknown",
    });
    const verdict = statusAllowsUpdatePreflight(report);
    return { ready: statusVerdict(report) === "ready", ...verdict };
  };

  if (!repair) {
    try {
      gate();
    } catch (error) {
      repair = true;
      repairReason = `runtime status crashed before update planning: ${
        error instanceof Error ? error.message.split("\n")[0] : String(error)
      }`;
    }
  }

  const result = runUpdate({
    install,
    upstream: install.kind === "clone" ? upstreamFor(channel) : null,
    channel: channel.value,
    mirrorHome,
    gate,
    // Re-read through a FRESH process, so the verdict comes from the code that
    // was just installed rather than from the modules this one imported.
    statusReady: () => {
      const probe = spawner(env)(["runtime", "status", "--mirror-home", mirrorHome]);
      return {
        ready: probe.code === 0,
        detail: probe.code === 0 ? "" : "runtime status is not ready",
      };
    },
    createBackup: () => createZipBackup({ dbPath, mirrorHome, backupDir: null, silent: true, env }),
    spawnFrontDoor: spawner(env),
    fetch: !args.includes("--no-fetch"),
    migrate: !args.includes("--skip-migrations"),
    dryRun: args.includes("--dry-run"),
    repair,
    ...(repairReason ? { repairReason } : {}),
  });

  writeOut(io, renderUpdateResult(result));
  if (repair && result.success) {
    // After the stages, not before them: the instruction is what to do NEXT,
    // and it reads as a caption on a result the operator has already seen.
    writeOut(
      io,
      "\nThe updater was repaired. Run `runtime update` again to complete the update.\n",
    );
  }
  // The log takes the install KIND word and the short refs, never the
  // repository path: this file's contract is "never argument values", and the
  // migrate_on_open entry beside it records a basename for the same reason.
  logFrontDoor(frontDoorLogPath(dbPath), {
    command: "runtime",
    route: "ts",
    exitCode: result.success ? 0 : 1,
    detail: updateLogDetail(install.kind, channel.value, result),
  });
  return result.success ? 0 : 1;
}

function spawner(env: NodeJS.ProcessEnv): UpdateSpawn {
  return frontDoorSpawner(frontDoorSelfPath(), env);
}

/** This front door's own path, which is also how the install kind is read. */
function frontDoorSelfPath(): string {
  return new URL("./cli.ts", import.meta.url).pathname;
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
