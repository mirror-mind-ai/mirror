// `runtime update` — the pipeline, driven for a concrete install kind.
// (CV22.DS10.US2)
//
// Everything structural lives elsewhere: the stage vocabulary and render in
// `updatePipeline.ts`, the gate in `updateGate.ts`, the git verbs in
// `strategies/clone.ts`, the install answer in `installKind.ts`. This module
// is the ORDER those are used in, and the two places the redesign departs from
// the oracle:
//
//   1. `capture` is a stage. The oracle reads `previous_commit` as a side
//      effect of the status report; here it is recorded deliberately, before
//      anything can move, because the recovery block is only as useful as that
//      value and `apply` must be unreachable without it.
//
//   2. `migrate` and `validate` run in FRESH PROCESSES on the code that was
//      just installed. The oracle migrates in-process, with the modules it
//      imported before the fast-forward -- so a migration authored in the new
//      commit is invisible to the very run that installed it.

import { spawnSync } from "node:child_process";
import { verifyBackupArchive } from "#runtime/backup.ts";
import type { InstallKind } from "#runtime/installKind.ts";
import {
  captureCommit,
  cloneRecoveryCommand,
  defaultGitRunner,
  fastForward,
  fetchUpstream,
  type GitRunner,
  installedChanges,
} from "#runtime/strategies/clone.ts";
import type { statusAllowsUpdatePreflight } from "#runtime/updateGate.ts";
import { stage, type UpdateResult, type UpdateStage } from "#runtime/updatePipeline.ts";

export interface UpdateSpawn {
  /** Runs the FRONT DOOR again, on the code now installed. */
  (argv: readonly string[]): { code: number; stdout: string; stderr: string };
}

export interface UpdateDeps {
  install: InstallKind;
  /** `origin/<channel>` for a clone. */
  upstream: string | null;
  channel: string;
  mirrorHome: string | null;
  /** The status report, re-read after apply through a fresh process. */
  statusReady: () => { ready: boolean; detail: string };
  gate: () => ReturnType<typeof statusAllowsUpdatePreflight> & { ready: boolean };
  createBackup: () => string | null;
  /**
   * Injected like every other seam so the pipeline's ORDER can be driven
   * without real archives. The default is the real verifier -- the stage is
   * worthless if it can be satisfied by anything cheaper.
   */
  verifyBackup?: (path: string) => { valid: boolean; note: string | null };
  git?: GitRunner;
  spawnFrontDoor: UpdateSpawn;
  fetch?: boolean;
  migrate?: boolean;
  /** Plan only: report what WOULD happen and touch nothing. */
  dryRun?: boolean;
  /**
   * The self-repair lane. A minimal gate (readable checkout, upstream, clean
   * tree), fast-forward, migrations SKIPPED, and an instruction to rerun
   * `runtime update` with the repaired updater. It exists for the failure the
   * ordinary gate cannot survive: an updater too broken to evaluate its own
   * status, which is why entering it must not depend on that status.
   */
  repair?: boolean;
  /** Why the repair lane was entered, when it was entered automatically. */
  repairReason?: string;
}

function failed(
  stages: UpdateStage[],
  previousRef: string | null,
  backupPath: string | null,
  recovery: string[],
): UpdateResult {
  return {
    stages,
    previousRef,
    newRef: null,
    backupPath,
    success: false,
    recovery,
    installedChanges: [],
  };
}

export function runUpdate(deps: UpdateDeps): UpdateResult {
  const git = deps.git ?? defaultGitRunner;
  const stages: UpdateStage[] = [];
  const doFetch = deps.fetch !== false;
  const doMigrate = deps.migrate !== false;

  if (deps.install.kind === "unknown") {
    stages.push(stage("status gate", "fail", `install kind unknown: ${deps.install.reason}`));
    return failed(stages, null, null, [
      "Mirror could not identify how it is installed, so it will not update itself.",
      "A git checkout updates in place; a global npm install updates through npm.",
    ]);
  }
  if (deps.install.kind === "package") {
    // Plateau 4 owns this strategy. Refusing explicitly beats a half-answer.
    stages.push(stage("status gate", "fail", "package installs are not updatable yet"));
    return failed(stages, deps.install.version, null, [
      "This Mirror is a package install; its update strategy lands with npm distribution.",
      `Reinstall manually with: npm install -g ${deps.install.name}@${deps.channel}`,
    ]);
  }

  const repository = deps.install.repository;

  if (deps.repair === true) return runRepairLane(deps, repository, git, stages);

  // --- gate ---------------------------------------------------------------
  const verdict = deps.gate();
  if (!verdict.ready) {
    if (!verdict.allowed) {
      stages.push(stage("status gate", "fail", "runtime status is not ready"));
      return failed(stages, null, null, [
        "Run: runtime diagnose",
        "Resolve the reported drift, then retry runtime update.",
      ]);
    }
    stages.push(stage("status gate", "pass", `update-safe preflight drift (${verdict.detail})`));
  } else {
    stages.push(stage("status gate", "pass"));
  }

  // --- capture ------------------------------------------------------------
  const previousRef = captureCommit(repository, git);
  if (previousRef === null) {
    stages.push(stage("capture", "fail", "could not read the current commit"));
    return failed(stages, null, null, [
      "Mirror must be a readable git checkout to update in place.",
    ]);
  }
  stages.push(stage("capture", "pass", previousRef));

  if (deps.upstream === null) {
    stages.push(stage("plan", "fail", "no upstream configured"));
    return failed(stages, previousRef, null, [
      "Configure an upstream branch with git, then retry runtime update.",
    ]);
  }
  const upstream = deps.upstream;

  // --- fetch --------------------------------------------------------------
  if (doFetch) {
    const fetched = fetchUpstream(repository, upstream, git);
    if (!fetched.ok) {
      stages.push(stage("fetch", "fail", fetched.detail));
      return failed(stages, previousRef, null, [
        "Check network connectivity and remote access.",
        "Retry runtime update, or use --no-fetch to plan from local refs only.",
      ]);
    }
    stages.push(stage("fetch", "pass", fetched.detail));
  } else {
    stages.push(stage("fetch", "skip", "--no-fetch"));
  }

  // --- plan ---------------------------------------------------------------
  const ahead = countCommits(repository, `${upstream}..HEAD`, git);
  const behind = countCommits(repository, `HEAD..${upstream}`, git);
  if (ahead === null || behind === null) {
    stages.push(stage("plan", "fail", `cannot compare against ${upstream}`));
    return failed(stages, previousRef, null, [
      `Resolve upstream tracking for ${upstream}, then retry runtime update.`,
    ]);
  }
  if (ahead === 0 && behind === 0) {
    stages.push(stage("plan", "pass", "already up to date"));
    return {
      stages,
      previousRef,
      newRef: previousRef,
      backupPath: null,
      success: true,
      recovery: [],
      installedChanges: [],
    };
  }
  if (ahead > 0) {
    const note = behind > 0 ? "branch diverged" : "local commits present";
    stages.push(stage("plan", "fail", note));
    return failed(stages, previousRef, null, [
      behind > 0
        ? "Branch diverged; reconcile local and upstream commits manually."
        : "Local branch is ahead of upstream; push or reset before updating.",
      "The working tree and the database are unchanged.",
      `Current commit: ${previousRef}`,
    ]);
  }
  stages.push(stage("plan", "pass", `pull ${behind} remote commit(s)`));

  if (deps.dryRun === true) {
    // Everything above this line is read-only. Stopping here is the whole
    // promise of a dry run: the stages a real run would take next are named,
    // not performed.
    stages.push(stage("backup", "skip", "dry run"));
    stages.push(stage("verify backup", "skip", "dry run"));
    stages.push(stage("fast-forward", "skip", `would pull ${behind} commit(s) from ${upstream}`));
    stages.push(stage("migrate", "skip", "dry run"));
    stages.push(stage("post-update status", "skip", "dry run"));
    return {
      stages,
      previousRef,
      newRef: null,
      backupPath: null,
      success: true,
      recovery: [],
      installedChanges: [],
    };
  }

  // --- backup + verify ----------------------------------------------------
  let backupPath: string | null;
  try {
    backupPath = deps.createBackup();
  } catch (error) {
    stages.push(stage("backup", "fail", error instanceof Error ? error.message : String(error)));
    return failed(stages, previousRef, null, [
      `Backup directory must be writable: ${deps.mirrorHome ?? "<mirror home>"}`,
    ]);
  }
  if (backupPath === null) {
    stages.push(stage("backup", "fail", "database not found"));
    return failed(stages, previousRef, null, [
      `Expected a database under: ${deps.mirrorHome ?? "<mirror home>"}`,
    ]);
  }
  stages.push(stage("backup", "pass", backupPath));

  const verification = (deps.verifyBackup ?? verifyBackupArchive)(backupPath);
  if (!verification.valid) {
    stages.push(stage("verify backup", "fail", verification.note ?? "invalid backup"));
    return failed(stages, previousRef, backupPath, [
      `Backup created but failed verification: ${backupPath}`,
      "Inspect the archive before retrying runtime update; the tree has not moved.",
    ]);
  }
  stages.push(stage("verify backup", "pass"));

  // --- apply (the first irreversible step) --------------------------------
  const applied = fastForward(repository, upstream, git);
  if (!applied.ok) {
    stages.push(stage("fast-forward", "fail", applied.detail));
    return failed(stages, previousRef, backupPath, [
      "Working tree is unchanged because fast-forward refused.",
      `Backup: ${backupPath}`,
      `Recover with: ${cloneRecoveryCommand(previousRef)}`,
    ]);
  }
  const newRef = captureCommit(repository, git);
  stages.push(stage("fast-forward", "pass", `${previousRef} -> ${newRef ?? "unknown"}`));
  const changes = installedChanges(repository, previousRef, newRef, git);

  // --- migrate (fresh process, NEW code) ----------------------------------
  if (doMigrate) {
    const result = deps.spawnFrontDoor(
      deps.mirrorHome
        ? ["runtime", "migrate", "--mirror-home", deps.mirrorHome]
        : ["runtime", "migrate"],
    );
    if (result.code !== 0) {
      stages.push(stage("migrate", "fail", firstLine(result.stderr || result.stdout)));
      return {
        ...failed(stages, previousRef, backupPath, [
          `Backup: ${backupPath}`,
          `Code is on ${newRef ?? "the new commit"}; the database may be partly migrated.`,
          `Restore the database from the backup, then: ${cloneRecoveryCommand(previousRef)}`,
        ]),
        newRef,
      };
    }
    stages.push(stage("migrate", "pass", migrateSummary(result.stdout)));
  } else {
    stages.push(stage("migrate", "skip", "--skip-migrations"));
  }

  // --- validate (fresh process) -------------------------------------------
  const post = deps.statusReady();
  if (!post.ready) {
    stages.push(stage("post-update status", "fail", post.detail));
    return {
      ...failed(stages, previousRef, backupPath, [
        `Code is on ${newRef ?? "the new commit"} and the database may be migrated.`,
        `Backup: ${backupPath}`,
        "Run: runtime diagnose",
      ]),
      newRef,
    };
  }
  stages.push(stage("post-update status", "pass"));

  return {
    stages,
    previousRef,
    newRef,
    backupPath,
    success: true,
    recovery: [],
    installedChanges: changes,
  };
}

/**
 * The repair lane: the smallest safe act that can make a broken updater
 * usable again. No status gate (the status is what is broken), no migrations
 * (the new code owns those on the next ordinary run), and the same
 * fast-forward-only discipline.
 */
function runRepairLane(
  deps: UpdateDeps,
  repository: string,
  git: GitRunner,
  stages: UpdateStage[],
): UpdateResult {
  stages.push(
    stage("repair preflight", "pass", deps.repairReason ?? "requested with --repair-updater"),
  );

  const previousRef = captureCommit(repository, git);
  if (previousRef === null) {
    stages.push(stage("capture", "fail", "could not read the current commit"));
    return failed(stages, null, null, ["Mirror must be a readable git checkout to repair."]);
  }
  stages.push(stage("capture", "pass", previousRef));

  const dirty = git(["status", "--porcelain"], repository);
  if (dirty.code !== 0 || dirty.stdout.trim() !== "") {
    stages.push(stage("repair preflight", "fail", "git tree is dirty"));
    return failed(stages, previousRef, null, [
      "Commit or stash local changes, then retry runtime update --repair-updater.",
    ]);
  }
  if (deps.upstream === null) {
    stages.push(stage("plan", "fail", "no upstream configured"));
    return failed(stages, previousRef, null, [
      "Configure an upstream branch with git, then retry.",
    ]);
  }

  if (deps.fetch !== false) {
    const fetched = fetchUpstream(repository, deps.upstream, git);
    stages.push(stage("fetch", fetched.ok ? "pass" : "fail", fetched.detail));
    if (!fetched.ok) {
      return failed(stages, previousRef, null, [
        "Check network connectivity, or retry with --no-fetch to repair from local refs.",
      ]);
    }
  } else {
    stages.push(stage("fetch", "skip", "--no-fetch"));
  }

  const behind = countCommits(repository, `HEAD..${deps.upstream}`, git);
  const ahead = countCommits(repository, `${deps.upstream}..HEAD`, git);
  if (behind === null || ahead === null || ahead > 0) {
    stages.push(stage("plan", "fail", ahead && ahead > 0 ? "branch diverged" : "cannot compare"));
    return failed(stages, previousRef, null, [
      "Reconcile local and upstream commits manually, then retry.",
      `Current commit: ${previousRef}`,
    ]);
  }
  if (behind === 0) {
    stages.push(stage("plan", "pass", "already up to date"));
    stages.push(stage("migrate", "skip", "repair lane"));
    return {
      stages,
      previousRef,
      newRef: previousRef,
      backupPath: null,
      success: true,
      recovery: [],
      installedChanges: [],
    };
  }
  stages.push(stage("plan", "pass", `pull ${behind} remote commit(s)`));

  const applied = fastForward(repository, deps.upstream, git);
  if (!applied.ok) {
    stages.push(stage("fast-forward", "fail", applied.detail));
    return failed(stages, previousRef, null, [
      "Working tree is unchanged because fast-forward refused.",
      `Recover with: ${cloneRecoveryCommand(previousRef)}`,
    ]);
  }
  const newRef = captureCommit(repository, git);
  stages.push(stage("fast-forward", "pass", `${previousRef} -> ${newRef ?? "unknown"}`));
  stages.push(stage("migrate", "skip", "repair lane: the ordinary update owns migrations"));

  return {
    stages,
    previousRef,
    newRef,
    backupPath: null,
    success: true,
    recovery: [],
    installedChanges: installedChanges(repository, previousRef, newRef, git),
  };
}

function countCommits(repository: string, range: string, git: GitRunner): number | null {
  const result = git(["rev-list", "--count", range], repository);
  if (result.code !== 0) return null;
  const value = Number.parseInt(result.stdout.trim(), 10);
  return Number.isNaN(value) ? null : value;
}

function firstLine(text: string): string {
  return text.trim().split("\n")[0] ?? "migration failed";
}

/** The one line from `runtime migrate`'s render worth carrying into a stage. */
function migrateSummary(stdout: string): string {
  const match = /^Migrate result: (.+)$/m.exec(stdout);
  return match?.[1] ?? "completed";
}

/** Spawn the front door again, inheriting the environment explicitly. */
export function frontDoorSpawner(cliPath: string, env: NodeJS.ProcessEnv): UpdateSpawn {
  return (argv) => {
    const result = spawnSync(process.execPath, [cliPath, ...argv], {
      encoding: "utf8",
      // A spawned front door does NOT inherit `--env-file`; the variables it
      // needs are passed explicitly or it resolves a different home than the
      // process that launched it.
      env: { ...env, NODE_OPTIONS: env.NODE_OPTIONS ?? "--no-warnings" },
    });
    return {
      code: result.status ?? -1,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  };
}
