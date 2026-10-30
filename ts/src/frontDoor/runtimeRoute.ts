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

import { accessSync, constants } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createZipBackup } from "#backup/zipBackup.ts";
import { dbNameForEnv, resolveMirrorHome } from "#frontDoor/dbPath.ts";
import { frontDoorLogPath, logFrontDoor } from "#frontDoor/frontDoorLog.ts";
import { homesRoot } from "#frontDoor/mirrorHomes.ts";
import { renderUnknownSubcommand } from "#frontDoor/usage.ts";
import {
  renderBackupVerification,
  renderRuntimeBackupCreated,
  verifyBackupArchive,
} from "#runtime/backup.ts";
import { channelFor, channelForReport, renderChannel, setChannel } from "#runtime/channel.ts";
import {
  diagnoseRuntime,
  extensionPluginFindings,
  extractionReasoningFindings,
  hookFailureFindings,
  hookNodeFindings,
  openRouterKeyFindings,
  pluginWiringFindings,
  probeModelPins,
  renderRuntimeDiagnosis,
  rootStateFindings,
  staleRevertGateFindings,
} from "#runtime/diagnose.ts";
import {
  checkUpdateAvailability,
  cloneRoleFor,
  inspectGitFor,
  inspectGitWorktree,
  packageVersion,
  renderRuntimeUpdateAvailability,
  renderRuntimeVersion,
  unavailableUpdateCheck,
  upstreamFor,
} from "#runtime/git.ts";
import {
  detectInstallKind,
  type InstallKind,
  inspectionRootFor,
  thisFrontDoorPath,
} from "#runtime/installKind.ts";
import { MIGRATE_DECLINED_EXIT, renderMigrate, runMigrate } from "#runtime/migrate.ts";
import {
  buildPendingReleaseNotes,
  buildPendingReleaseNotesFromRegistry,
  type ReleaseNotesBundle,
  readReleaseNote,
  renderReleaseNote,
  renderReleaseNotesBundle,
  unknownReleaseNotes,
} from "#runtime/releaseNotes.ts";
import { buildRuntimeStatus, renderRuntimeStatus, statusVerdict } from "#runtime/status.ts";
import {
  checkPackageUpdateAvailability,
  defaultNpmRunner,
  type NpmRunner,
  npmRootGlobal,
  renderPackageUpdateAvailability,
} from "#runtime/strategies/package.ts";
import { runningTreeRoot } from "#runtime/treeRoot.ts";
import { frontDoorSpawner, postUpdateHints, runUpdate, type UpdateSpawn } from "#runtime/update.ts";
import { statusAllowsUpdatePreflight } from "#runtime/updateGate.ts";
import { renderUpdateResult, updateLogDetail } from "#runtime/updatePipeline.ts";
import { expandHome } from "#util/paths.ts";
import { composeWelcome, type RemoteCheck, welcomeDisabled } from "#welcome/card.ts";
import { composeStatusLine } from "#welcome/statusLine.ts";
import { isoNow, recordUpToDate } from "#welcome/updateCache.ts";

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
  // CV22.DS10.US3 (D9): not on the oracle. Shows or sets the channel this
  // install follows, in the file its install kind keeps it in.
  "channel",
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
 * (Its own revert, `MIRROR_TS_RUNTIME_UPDATE=0`, left with the Python engine at
 * CV22.DS10.TS5.)
 */
export const TS_RUNTIME_UPDATE_SUBCOMMANDS: ReadonlyMap<string, string> = new Map([
  ["backup", "DS10.US2 runtime backup ported to TS"],
  ["update", "DS10.US2 runtime update ported to TS"],
  ["migrate", "DS10.US2 runtime migrate ported to TS"],
  ["channel", "DS10.US3 runtime channel (D9), TS-native"],
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
  /**
   * Where the command was run. No `runtime` read route consults it: since
   * CR134 and CR138 they answer for the install, wherever they run. Tests pass
   * it to show that it does not matter.
   */
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

/**
 * The seams of the routes that answer for the running install, beyond the
 * route's own: the install and its npm, for tests. The welcome (CR135) and
 * `release-notes pending` (CR134) take them.
 */
export interface InstallRouteIo extends RuntimeRouteIo {
  install?: InstallKind;
  npm?: NpmRunner;
  /** The OS home whose config directory holds a package's channel file. */
  osHome?: string;
}

export type WelcomeRouteIo = InstallRouteIo;

/**
 * Port of `welcome.main`. Always exits 0, like the oracle.
 *
 * The card and the status line answer for the install that is running, never
 * for the cwd (CR135): Pi renders both in the person's project.
 */
export function runWelcomeRoute(argv: readonly string[], io: WelcomeRouteIo = {}): number {
  const env = io.env ?? process.env;
  const args = argv.slice(1);
  if (welcomeDisabled(env)) return 0;

  const home = resolveWelcomeHome(optionValue(args, "--mirror-home"), env);
  // The running tree's manifest: a file read, so the status line still spawns nothing.
  const version = packageVersion(runningTreeRoot()) ?? "unknown";

  if (args.includes("--status-line")) {
    const line = composeStatusLine({
      mirrorHome: home,
      installedVersion: version,
      sessionId: optionValue(args, "--session-id"),
      env,
    });
    if (line) writeOut(io, `${line}\n`);
    return 0;
  }

  const { card, check } = composeWelcome({
    mirrorHome: home,
    install: io.install ?? detectThisInstall(),
    env,
    version,
    ...(io.npm === undefined ? {} : { npm: io.npm }),
    ...(io.osHome === undefined ? {} : { osHome: io.osHome }),
  });
  if (card) writeOut(io, `${card}\n`);
  if (home !== null && check !== null) logWelcomeCheck(home, env, check);
  return 0;
}

/**
 * One front-door line per remote check, so a slow session start can be
 * explained later: what was asked, how it answered, how long it took. Never a
 * path or a version.
 */
function logWelcomeCheck(home: string, env: NodeJS.ProcessEnv, check: RemoteCheck): void {
  logFrontDoor(frontDoorLogPath(join(home, dbNameForEnv(env.MEMORY_ENV || "production"))), {
    command: "welcome",
    route: "ts",
    exitCode: 0,
    detail: `update-check source=${check.source} verdict=${check.verdict} ms=${check.ms}`,
  });
}

/** Port of the read half of `cmd_runtime`. */
export async function runRuntimeReadRoute(
  argv: readonly string[],
  io: InstallRouteIo = {},
): Promise<number> {
  const env = io.env ?? process.env;
  const args = argv.slice(1);
  const subcommand = args[0] ?? "";
  // The version is the running tree's, never the cwd's: for a skill the cwd
  // is the user's project, and for an installed package it is anything
  // (CV22.DS10.US3, the fourth tree reader the plan's list did not name).
  const version = packageVersion(runningTreeRoot()) ?? "unknown";

  if (subcommand === "version") {
    const startArg = optionValue(args, "--start");
    const install = io.install ?? detectThisInstall();
    // The install's own repository, or the one `--start` names: the one
    // explicit way these commands run git outside the install (CR138).
    const root = inspectionRootFor(install, startArg ? expandHome(startArg) : null);
    writeOut(
      io,
      renderRuntimeVersion({
        version,
        install,
        git: inspectGitFor(install, root),
        cloneRole: cloneRoleFor(install, root),
        updateChannel: channelForReport(
          install,
          root,
          env,
          io.osHome ?? homedir(),
          optionValue(args, "--channel"),
        ),
      }),
    );
    return 0;
  }

  if (subcommand === "status") {
    const report = buildRuntimeStatus({
      mirrorHome: optionValue(args, "--mirror-home"),
      channel: optionValue(args, "--channel"),
      env,
      version,
      install: io.install ?? detectThisInstall(),
    });
    writeOut(io, renderRuntimeStatus(report, env));
    return statusVerdict(report) === "ready" ? 0 : 1;
  }

  if (subcommand === "diagnose") {
    // The install's own tree, so its worktree findings are Mirror's and never
    // the cwd project's (CR138).
    const install = io.install ?? detectThisInstall();
    const report = buildRuntimeStatus({
      mirrorHome: optionValue(args, "--mirror-home"),
      env,
      version,
      install,
    });
    const installRoot =
      install.kind === "clone"
        ? install.repository
        : install.kind === "package"
          ? install.root
          : null;
    const findings = [
      ...diagnoseRuntime(report, inspectGitWorktree(report.git.repository)),
      ...rootStateFindings(ambientHomesRoot(env)),
      // CV22.DS10.TS5: the transition's own leftovers. A stale MIRROR_TS_*
      // gate is inert and silently so; an unresolvable Node makes every hook
      // skip; and hooks.log holds what the hooks met in their own context.
      // All three are invisible without being asked for.
      ...staleRevertGateFindings(env),
      // CV9.DS9.TS1: a reasoning setting the transport ignores rather than fail
      // on (CR178) is silently not in force unless diagnose says so.
      ...extractionReasoningFindings(env),
      // CR187: with no key, memory extraction, embeddings, and consult are off,
      // and nothing else on this report would say so.
      ...openRouterKeyFindings(env),
      ...hookFailureFindings(report),
      ...hookNodeFindings(env, (path) => {
        try {
          accessSync(path, constants.X_OK);
          return true;
        } catch {
          return false;
        }
      }),
      // CV21.DS4.TS6: the plugin wiring. Codex's versioned cache goes stale
      // after an npm update; Claude Code's link can dangle. Absence is not
      // drift, so an unwired machine stays green.
      ...pluginWiringFindings(installRoot, env),
      // CV21.DS5.US2: the home's extensions plugin, as each runtime on the
      // PATH holds it. A stale copy is any version other than the home's.
      ...extensionPluginFindings(report.mirror_home, env, (path) => {
        try {
          accessSync(path, constants.X_OK);
          return true;
        } catch {
          return false;
        }
      }),
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
      const pending = pendingReleaseNotes(args, io, env, version);
      if ("usage" in pending) {
        writeErr(io, pending.usage);
        return 2;
      }
      writeOut(io, renderReleaseNotesBundle(pending.bundle));
      // `unknown` exits 1, as `update --check` does on `unresolved` (CR134, decision 3).
      return pending.bundle.unknown_reason === null ? 0 : 1;
    } else {
      // The notes ship in the package at the same path as in the checkout
      // (US3 D8), read from the tree that holds the running front door --
      // never from the cwd, which for a skill is the user's project.
      writeOut(io, renderReleaseNote(readReleaseNote(target, runningTreeRoot())));
    }
    return 0;
  }

  if (subcommand === "backup") return runRuntimeBackup(args.slice(1), io, env);
  if (subcommand === "migrate") return runRuntimeMigrate(args.slice(1), io, env);
  if (subcommand === "update") return runRuntimeUpdate(args.slice(1), io, env);
  if (subcommand === "channel") return runRuntimeChannel(args.slice(1), io, env);

  // Routing answers every name it does not recognize before dispatch (the
  // shared usage answer, CV22.DS10.TS5 D2 -- the shape US2 gave `runtime`
  // first). Reaching here means routing and this function disagree about the
  // family's names, so the same answer is given rather than a guess.
  writeErr(io, renderUnknownSubcommand("runtime", RUNTIME_SUBCOMMANDS, subcommand));
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
 * `runtime channel [stable|main]` (CV22.DS10.US3, D9): show the channel this
 * install follows, or set it. The file is the install kind's own; the
 * vocabulary is the pipeline's; nothing else is touched.
 */
function runRuntimeChannel(
  args: readonly string[],
  io: RuntimeRouteIo,
  env: NodeJS.ProcessEnv,
): number {
  const install = detectThisInstall();
  const requested = args.find((arg) => !arg.startsWith("-")) ?? null;
  // (A channel is read and written by layout evidence alone: a package user
  // with npm off the PATH can still choose one.)
  if (requested === null) {
    writeOut(io, renderChannel({ install, channel: channelFor(install, env), written: null }));
    return 0;
  }
  const written = setChannel(install, requested, env);
  if (!written.ok) {
    writeErr(io, `Error: ${written.reason}\n`);
    return written.exitCode;
  }
  writeOut(
    io,
    renderChannel({
      install,
      channel: channelFor(install, env),
      written: { previous: written.previous },
    }),
  );
  return 0;
}

/**
 * `runtime update [--check|--dry-run|--repair-updater] [--no-fetch]
 * [--skip-migrations] [--mirror-home PATH] [--channel stable|main]`.
 */
function runRuntimeUpdate(
  args: readonly string[],
  io: InstallRouteIo,
  env: NodeJS.ProcessEnv,
): number {
  const version = packageVersion(runningTreeRoot()) ?? "unknown";
  const channelOverride = optionValue(args, "--channel");
  // The update lane asks npm, once, whether `-g` addresses this install: a
  // package outside npm's own global root is not the one `npm install -g`
  // would replace. The read routes do not pay for the probe.
  //
  // npm runs in the tree the front door runs from -- for a package, the
  // install's own root -- and never in the cwd, whose `.npmrc` could name
  // another registry or prefix (CR135). The strategy's own calls stay out of
  // the cwd too; its apply runs from the parent of `node_modules` (`applyCwd`).
  //
  // Git runs in the clone's own checkout and nowhere else: the gate's report
  // and `--check` name no cwd (CR138), whose `.git/config` could name a
  // command for git to run.
  const install =
    io.install ??
    detectInstallKind({
      frontDoorPath: thisFrontDoorPath(),
      npmRootGlobal: npmRootGlobal(runningTreeRoot()),
    });
  const channel = channelFor(install, env, homedir(), channelOverride);

  if (args.includes("--check")) {
    // A package asks the registry the question the pipeline's plan stage
    // asks, and says which way the channel lies; a clone asks its remote.
    // Until CV22.DS10.US3 plateau 4 both asked git, from the cwd.
    if (install.kind === "package") {
      const availability = checkPackageUpdateAvailability(install, channel);
      writeOut(io, renderPackageUpdateAvailability(availability));
      return availability.status === "up_to_date" || availability.status === "update_available"
        ? 0
        : 1;
    }
    // An install that cannot be identified has no checkout to ask, and the
    // cwd is not one (CR138, decision 2). `runtime update` refuses it too.
    const availability =
      install.kind === "clone"
        ? checkUpdateAvailability(install.repository, channelOverride, version)
        : unavailableUpdateCheck(version, channel, `install kind unknown: ${install.reason}`);
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
      mirrorHome,
      channel: channelOverride,
      env,
      version,
      install,
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
  // The install now holds its channel's version: say so where the welcome card
  // and the status line read it, or they keep announcing what was just
  // installed (CR135).
  if (result.success && !args.includes("--dry-run")) {
    recordUpToDate(mirrorHome, {
      channel: channel.value,
      commit: install.kind === "clone" ? result.newRef : null,
      checkedAt: isoNow(),
    });
  }
  if (repair && result.success) {
    // After the stages, not before them: the instruction is what to do NEXT,
    // and it reads as a caption on a result the operator has already seen.
    writeOut(
      io,
      "\nThe updater was repaired. Run `runtime update` again to complete the update.\n",
    );
  }
  for (const hint of postUpdateHints(install, result, env)) writeOut(io, `\n${hint}\n`);
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

/**
 * The front door, spawned again on the code now installed. Through the bin
 * (`bin/mirror.js`, D15), never `cli.ts` itself: under `node_modules` Node
 * refuses to strip types, so a package's fresh-process migrate and validate
 * crashed at the first `.ts` import -- found by the update smoke's package
 * lane (CV22.DS10.US3 plateau 4). A checkout runs the same bin, as `npm link`
 * does.
 */
function spawner(env: NodeJS.ProcessEnv): UpdateSpawn {
  return frontDoorSpawner(join(runningTreeRoot(), "bin", "mirror.js"), env);
}

/**
 * How THIS front door is installed, by what the filesystem shows and nothing
 * spawned: a checkout by its `.git`, a package by npm's global layout and the
 * bin linked into it. The one place that needs npm's own word, the update
 * lane, probes `npm root -g` itself.
 */
function detectThisInstall(): InstallKind {
  return detectInstallKind({ frontDoorPath: thisFrontDoorPath() });
}

/**
 * `release-notes pending` for the install that is running, never for the cwd
 * (CR134), which for a skill is the person's project. A clone reads its own
 * channel's ref -- or `--ref` -- in its own repository; a package asks the
 * registry what its channel holds; an install that cannot be identified has no
 * source, and says so.
 */
function pendingReleaseNotes(
  args: readonly string[],
  io: InstallRouteIo,
  env: NodeJS.ProcessEnv,
  version: string,
): { bundle: ReleaseNotesBundle } | { usage: string } {
  const install = io.install ?? detectThisInstall();
  const osHome = io.osHome ?? homedir();
  const ref = optionValue(args, "--ref");
  const fetch = !args.includes("--no-fetch");

  if (install.kind === "clone") {
    return {
      bundle: buildPendingReleaseNotes({
        // `--from` omitted falls back to the running tree's own version.
        currentVersion: optionValue(args, "--from") ?? version,
        ref: ref ?? upstreamFor(channelFor(install, env, osHome)),
        repository: install.repository,
        fetch,
      }),
    };
  }

  if (install.kind === "package") {
    if (ref !== null) {
      return {
        usage:
          `release-notes pending: --ref names a git ref, and this install is a package ` +
          `(${install.name}@${install.version}), which reads its channel from the npm registry\n`,
      };
    }
    const currentVersion = optionValue(args, "--from") ?? install.version;
    const channel = channelFor(install, env, osHome).value;
    if (!fetch) {
      return {
        bundle: unknownReleaseNotes(
          currentVersion,
          `npm ${install.name}@${channel}`,
          "a package keeps no copy of its channel to read offline; run without --no-fetch",
        ),
      };
    }
    return {
      bundle: buildPendingReleaseNotesFromRegistry({
        currentVersion,
        install,
        channel,
        npm: io.npm ?? defaultNpmRunner,
      }),
    };
  }

  return {
    bundle: unknownReleaseNotes(
      optionValue(args, "--from") ?? version,
      null,
      `install kind unknown (${install.reason})`,
    ),
  };
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

/** Python's ambient `DEFAULT_USER_HOMES_DIR`: the homes root under the environment's home. */
function ambientHomesRoot(env: NodeJS.ProcessEnv): string {
  return homesRoot(env.HOME ?? env.USERPROFILE ?? "");
}
