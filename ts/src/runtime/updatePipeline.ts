// The update pipeline: what Mirror promises when it updates itself.
// (CV22.DS10.US2)
//
//   gate -> capture -> plan -> fetch -> backup -> verify -> apply
//        -> migrate -> validate
//
// The order is the oracle's, and it is load-bearing in both directions: plan
// and fetch are cheap and read-only, so they come first and a no-op update
// never archives the database; `apply` is the first irreversible step, so
// nothing reaches it until `capture` recorded where to go back to and
// `verify backup` proved the archive opens.
//
// Only `apply` differs between a clone and a package. Everything here is the
// same for both, which is why it lives in its own module rather than inside
// either strategy -- and why the seam between the body and a strategy is
// declared here too (CV22.DS10.US3 plateau 4, debt D-026): the body in
// `update.ts` runs the order above once, and a strategy answers only the
// questions whose answer depends on how Mirror was installed.

export type StageState = "pass" | "fail" | "skip";

export interface UpdateStage {
  name: string;
  state: StageState;
  detail?: string;
}

export interface UpdateResult {
  stages: UpdateStage[];
  /**
   * Where to go back to, read BEFORE anything moved: a commit for a clone, an
   * installed version for a package. The recovery block is only as useful as
   * this value, which is why it is captured in its own stage rather than
   * derived afterwards from a tree that has already changed.
   */
  previousRef: string | null;
  newRef: string | null;
  backupPath: string | null;
  success: boolean;
  recovery: string[];
  installedChanges: string[];
}

export function stage(name: string, state: StageState, detail?: string): UpdateStage {
  return detail === undefined ? { name, state } : { name, state, detail };
}

// --- the strategy seam -------------------------------------------------------

/** A step that could not be taken, with the stage detail and the route back. */
export interface Refusal {
  ok: false;
  detail: string;
  recovery: string[];
}

export type CaptureOutcome = { ok: true; ref: string; detail: string } | Refusal;
export type FetchOutcome = { ok: true; detail: string } | Refusal;
export type GateOutcome = { ok: true } | Refusal;

export type PlanOutcome =
  /** Nothing to do; the update ends here without archiving anything. */
  | { kind: "current"; detail: string }
  /** Something to apply: `target` is what apply moves to, `dryRun` what a dry run says it would do. */
  | { kind: "ahead"; target: string; detail: string; dryRun: string }
  | { kind: "blocked"; detail: string; recovery: string[] };

export type ApplyOutcome =
  | { ok: true; newRef: string | null; detail: string; changes: string[] }
  | Refusal;

/**
 * What differs between a clone and a package, and nothing else.
 *
 * The body owns the order, the gate, the dry run, the backup and its
 * verification, the fresh-process migrate and validate, and the recovery
 * block's shape. A strategy owns the meaning of a ref (a commit, a version),
 * how to read it, how to learn whether the channel is ahead, how to move, and
 * the words that name its own apply stage and its way back.
 */
export interface ApplyStrategy {
  readonly kind: "clone" | "package";
  /** What the render calls the irreversible step: `fast-forward` or `apply`. */
  readonly applyStage: string;
  /**
   * The minimal gate the repair lane runs INSTEAD of the status gate: what
   * must be true of the install itself when the status cannot be trusted.
   */
  repairGate(): GateOutcome;
  /** The ref to go back to, read before anything moves. */
  capture(): CaptureOutcome;
  /** Absent when there is nothing to fetch: a registry is asked at plan time. */
  fetch?(): FetchOutcome;
  plan(previousRef: string): PlanOutcome;
  apply(previousRef: string, target: string): ApplyOutcome;
  /** The pasteable route back, with the captured ref in it. */
  recoveryCommand(previousRef: string): string;
  /** Where the code stands after apply, for the recovery block. */
  installedState(newRef: string | null): string;
}

/** Port of `render_runtime_update_result`, in the redesign's vocabulary. */
export function renderUpdateResult(result: UpdateResult): string {
  const marks: Record<StageState, string> = { pass: "✓", fail: "✗", skip: "-" };
  const lines: string[] = ["Mirror runtime update", ""];
  for (const entry of result.stages) {
    const mark = marks[entry.state] ?? "?";
    lines.push(
      entry.detail ? `[${mark}] ${entry.name}: ${entry.detail}` : `[${mark}] ${entry.name}`,
    );
  }
  lines.push("");
  if (result.previousRef && result.newRef && result.previousRef !== result.newRef) {
    lines.push(`Previous: ${result.previousRef}`);
    lines.push(`New: ${result.newRef}`);
  }
  if (result.backupPath) lines.push(`Backup: ${result.backupPath}`);
  if (result.installedChanges.length > 0) {
    lines.push("");
    lines.push("Installed changes:");
    for (const change of result.installedChanges) lines.push(`- ${change}`);
  }
  lines.push("");
  if (result.success) {
    lines.push("Update result: success");
  } else {
    lines.push("Update result: failed");
    if (result.recovery.length > 0) {
      lines.push("");
      lines.push("Recovery:");
      for (const entry of result.recovery) lines.push(`- ${entry}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

/**
 * One line per update, for `<mirror-home>/front-door.log`.
 *
 * The log already records every routing decision; an update that moved the
 * tree and migrated the database should not be the one event that leaves no
 * trace. Months later this line is the only evidence of what happened.
 */
export function updateLogDetail(install: string, channel: string, result: UpdateResult): string {
  const stages = result.stages.map((entry) => `${entry.name}=${entry.state}`).join(",");
  const from = result.previousRef ?? "unknown";
  const to = result.newRef ?? "unchanged";
  return `update install=${install} channel=${channel} ${from}->${to} ${stages} result=${
    result.success ? "success" : "failed"
  }`;
}
