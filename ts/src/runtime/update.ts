// `runtime update` — the pipeline body, run once for either install kind.
// (CV22.DS10.US2; one body over two strategies since CV22.DS10.US3 plateau 4,
// debt D-026.)
//
// Everything structural lives elsewhere: the stage vocabulary, the render, and
// the strategy seam in `updatePipeline.ts`, the gate in `updateGate.ts`, the
// git verbs and the clone strategy in `strategies/clone.ts`, the npm verbs and
// the package strategy in `strategies/package.ts`, the install answer in
// `installKind.ts`. This module is the ORDER those are used in, and the two
// places the redesign departs from the oracle:
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
//
// A LANE is a list of steps. The ordinary lane is the whole promise; the
// repair lane is the smallest safe act that can make a broken updater usable
// again -- no status gate (the status is what is broken), no backup, no
// migrations (the new code owns those on the next ordinary run). The lane is
// chosen once, below; no step asks which lane it is in.

import { spawnSync } from "node:child_process";
import { verifyBackupArchive } from "#runtime/backup.ts";
import type { InstallKind } from "#runtime/installKind.ts";
import { cloneStrategy, defaultGitRunner, type GitRunner } from "#runtime/strategies/clone.ts";
import { defaultNpmRunner, type NpmRunner, packageStrategy } from "#runtime/strategies/package.ts";
import type { statusAllowsUpdatePreflight } from "#runtime/updateGate.ts";
import {
  type ApplyStrategy,
  stage,
  type UpdateResult,
  type UpdateStage,
} from "#runtime/updatePipeline.ts";
import { commandOnPath } from "#util/paths.ts";
import { PROGRAM } from "#util/program.ts";
import { shellWord } from "#util/shellWord.ts";

/** Runs the FRONT DOOR again, on the code now installed. */
export type UpdateSpawn = (argv: readonly string[]) => {
  code: number;
  stdout: string;
  stderr: string;
};

export interface UpdateDeps {
  install: InstallKind;
  /** `origin/<channel>` for a clone; null for a package, which has no upstream. */
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
  /** The npm seam, injected for the same reason the git one is. */
  npm?: NpmRunner;
}

/** One update in flight: what the steps have learned so far. */
interface Run {
  readonly deps: UpdateDeps;
  readonly strategy: ApplyStrategy;
  readonly stages: UpdateStage[];
  previousRef: string | null;
  /** What `plan` found to apply; set only on an `ahead` outcome. */
  target: string | null;
  dryRunDetail: string | null;
  backupPath: string | null;
  newRef: string | null;
  changes: string[];
}

/** A step either ends the run with a result or lets the next step run. */
type Step = (run: Run) => UpdateResult | null;

function failed(run: Run, recovery: string[]): UpdateResult {
  return {
    stages: run.stages,
    previousRef: run.previousRef,
    newRef: run.newRef,
    backupPath: run.backupPath,
    success: false,
    recovery,
    installedChanges: [],
  };
}

function succeeded(run: Run): UpdateResult {
  return {
    stages: run.stages,
    previousRef: run.previousRef,
    newRef: run.newRef,
    backupPath: run.backupPath,
    success: true,
    recovery: [],
    installedChanges: run.changes,
  };
}

/** The ref `capture` recorded. A step that needs it runs after `capture` by construction. */
function captured(run: Run): string {
  if (run.previousRef === null) throw new Error("capture must run before this stage");
  return run.previousRef;
}

function backupLine(run: Run): string[] {
  return run.backupPath ? [`Backup: ${run.backupPath}`] : [];
}

// --- the steps ---------------------------------------------------------------

const statusGate: Step = (run) => {
  const verdict = run.deps.gate();
  if (verdict.ready) {
    run.stages.push(stage("status gate", "pass"));
    return null;
  }
  if (!verdict.allowed) {
    run.stages.push(stage("status gate", "fail", "runtime status is not ready"));
    return failed(run, [
      "Run: runtime diagnose",
      "Resolve the reported drift, then retry runtime update.",
    ]);
  }
  run.stages.push(stage("status gate", "pass", `update-safe preflight drift (${verdict.detail})`));
  return null;
};

const repairPreflight: Step = (run) => {
  run.stages.push(
    stage("repair preflight", "pass", run.deps.repairReason ?? "requested with --repair-updater"),
  );
  const verdict = run.strategy.repairGate();
  if (verdict.ok) return null;
  run.stages.push(stage("repair preflight", "fail", verdict.detail));
  return failed(run, verdict.recovery);
};

const capture: Step = (run) => {
  const outcome = run.strategy.capture();
  if (!outcome.ok) {
    run.stages.push(stage("capture", "fail", outcome.detail));
    return failed(run, outcome.recovery);
  }
  run.previousRef = outcome.ref;
  run.stages.push(stage("capture", "pass", outcome.detail));
  return null;
};

const fetch: Step = (run) => {
  const fetchUpstream = run.strategy.fetch;
  if (fetchUpstream === undefined) return null;
  if (run.deps.fetch === false) {
    run.stages.push(stage("fetch", "skip", "--no-fetch"));
    return null;
  }
  const outcome = fetchUpstream();
  if (!outcome.ok) {
    run.stages.push(stage("fetch", "fail", outcome.detail));
    return failed(run, outcome.recovery);
  }
  run.stages.push(stage("fetch", "pass", outcome.detail));
  return null;
};

const plan: Step = (run) => {
  const outcome = run.strategy.plan(captured(run));
  if (outcome.kind === "blocked") {
    run.stages.push(stage("plan", "fail", outcome.detail));
    return failed(run, outcome.recovery);
  }
  run.stages.push(stage("plan", "pass", outcome.detail));
  if (outcome.kind === "current") {
    // Nothing to do, and nothing was archived to find that out.
    run.newRef = run.previousRef;
    return succeeded(run);
  }
  run.target = outcome.target;
  run.dryRunDetail = outcome.dryRun;
  return null;
};

const dryRunStop: Step = (run) => {
  if (run.deps.dryRun !== true) return null;
  // Everything above this line is read-only. Stopping here is the whole
  // promise of a dry run: the stages a real run would take next are named,
  // not performed.
  run.stages.push(stage("backup", "skip", "dry run"));
  run.stages.push(stage("verify backup", "skip", "dry run"));
  run.stages.push(stage(run.strategy.applyStage, "skip", run.dryRunDetail ?? "dry run"));
  run.stages.push(stage("migrate", "skip", "dry run"));
  run.stages.push(stage("post-update status", "skip", "dry run"));
  return succeeded(run);
};

const backupAndVerify: Step = (run) => {
  const home = run.deps.mirrorHome ?? "<mirror home>";
  let backupPath: string | null;
  try {
    backupPath = run.deps.createBackup();
  } catch (error) {
    run.stages.push(
      stage("backup", "fail", error instanceof Error ? error.message : String(error)),
    );
    return failed(run, [`Backup directory must be writable: ${home}`]);
  }
  if (backupPath === null) {
    run.stages.push(stage("backup", "fail", "database not found"));
    return failed(run, [`Expected a database under: ${home}`]);
  }
  run.backupPath = backupPath;
  run.stages.push(stage("backup", "pass", backupPath));

  const verification = (run.deps.verifyBackup ?? verifyBackupArchive)(backupPath);
  if (!verification.valid) {
    run.stages.push(stage("verify backup", "fail", verification.note ?? "invalid backup"));
    return failed(run, [
      `Backup created but failed verification: ${backupPath}`,
      "Inspect the archive before retrying runtime update; nothing has moved.",
    ]);
  }
  run.stages.push(stage("verify backup", "pass"));
  return null;
};

const skipBackup: Step = (run) => {
  run.stages.push(stage("backup", "skip", "repair lane"));
  return null;
};

/** The first irreversible step. */
const apply: Step = (run) => {
  const previousRef = captured(run);
  if (run.target === null) throw new Error("plan must name a target before apply");
  const outcome = run.strategy.apply(previousRef, run.target);
  if (!outcome.ok) {
    run.stages.push(stage(run.strategy.applyStage, "fail", outcome.detail));
    return failed(run, [
      ...outcome.recovery,
      ...backupLine(run),
      `Recover with: ${run.strategy.recoveryCommand(previousRef)}`,
    ]);
  }
  run.newRef = outcome.newRef;
  run.changes = outcome.changes;
  run.stages.push(stage(run.strategy.applyStage, "pass", outcome.detail));
  return null;
};

/** Fresh process, NEW code. */
const migrate: Step = (run) => {
  if (run.deps.migrate === false) {
    run.stages.push(stage("migrate", "skip", "--skip-migrations"));
    return null;
  }
  const home = run.deps.mirrorHome;
  const result = run.deps.spawnFrontDoor(
    home ? ["runtime", "migrate", "--mirror-home", home] : ["runtime", "migrate"],
  );
  if (result.code !== 0) {
    run.stages.push(stage("migrate", "fail", firstLine(result.stderr || result.stdout)));
    return failed(run, [
      ...backupLine(run),
      `${run.strategy.installedState(run.newRef)}; the database may be partly migrated.`,
      `Restore the database from the backup, then: ${run.strategy.recoveryCommand(captured(run))}`,
    ]);
  }
  run.stages.push(stage("migrate", "pass", migrateSummary(result.stdout)));
  return null;
};

const skipMigrate: Step = (run) => {
  run.stages.push(stage("migrate", "skip", "repair lane: the ordinary update owns migrations"));
  return null;
};

/** Fresh process: the verdict comes from the code that was just installed. */
const validate: Step = (run) => {
  const post = run.deps.statusReady();
  if (!post.ready) {
    run.stages.push(stage("post-update status", "fail", post.detail));
    return failed(run, [
      `${run.strategy.installedState(run.newRef)} and the database may be migrated.`,
      ...backupLine(run),
      "Run: runtime diagnose",
    ]);
  }
  run.stages.push(stage("post-update status", "pass"));
  return null;
};

// --- the lanes ---------------------------------------------------------------

const ORDINARY_LANE: readonly Step[] = [
  statusGate,
  capture,
  fetch,
  plan,
  dryRunStop,
  backupAndVerify,
  apply,
  migrate,
  validate,
];

const REPAIR_LANE: readonly Step[] = [
  repairPreflight,
  capture,
  fetch,
  plan,
  dryRunStop,
  skipBackup,
  apply,
  skipMigrate,
];

function strategyFor(deps: UpdateDeps, install: Exclude<InstallKind, { kind: "unknown" }>) {
  if (install.kind === "package") {
    return packageStrategy(install, deps.channel, deps.npm ?? defaultNpmRunner);
  }
  return cloneStrategy(
    install.repository,
    deps.upstream ?? `origin/${deps.channel}`,
    deps.git ?? defaultGitRunner,
  );
}

export function runUpdate(deps: UpdateDeps): UpdateResult {
  const stages: UpdateStage[] = [];
  if (deps.install.kind === "unknown") {
    stages.push(stage("status gate", "fail", `install kind unknown: ${deps.install.reason}`));
    return {
      stages,
      previousRef: null,
      newRef: null,
      backupPath: null,
      success: false,
      recovery: [
        "Mirror could not identify how it is installed, so it will not update itself.",
        "A git checkout updates in place; a global npm install updates through npm.",
      ],
      installedChanges: [],
    };
  }

  const run: Run = {
    deps,
    strategy: strategyFor(deps, deps.install),
    stages,
    previousRef: null,
    target: null,
    dryRunDetail: null,
    backupPath: null,
    newRef: null,
    changes: [],
  };
  const lane = deps.repair === true ? REPAIR_LANE : ORDINARY_LANE;
  for (const step of lane) {
    const result = step(run);
    if (result !== null) return result;
  }
  return succeeded(run);
}

/**
 * What to say after the stages, when the update itself has nothing more to
 * say. One case today (CV22.DS10.US3 plateau 4): a clone whose PATH does not
 * reach `mirror`. Every skill invokes that name, and a checkout provides it
 * only after `npm link` has run once at its root -- the seam every clone user
 * crosses once, at the update that brought the skills saying it. A package
 * put `mirror` on the PATH by being installed; a failed update's last words
 * are its recovery block.
 */
export function postUpdateHints(
  install: InstallKind,
  result: UpdateResult,
  env: NodeJS.ProcessEnv,
  canExecute?: (path: string) => boolean,
): string[] {
  if (install.kind !== "clone" || !result.success) return [];
  if (commandOnPath(PROGRAM, env, canExecute) !== null) return [];
  // A command the person will paste: the path is one shell word (CR104).
  return [
    `\`${PROGRAM}\` is not on the PATH: run \`npm link\` once in ${shellWord(install.repository)}, so the skills can call it.`,
  ];
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
