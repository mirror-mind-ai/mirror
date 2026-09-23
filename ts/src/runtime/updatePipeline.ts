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
// either strategy.

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
