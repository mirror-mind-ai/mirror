// `release-promote` — doctor, tag, move stable, push (CV22.DS10.US2, D1).
//
// Maintainer tooling, not a product command: it needs a checkout, tags, and
// push rights. `npm run release:promote`.
//
// The steps are an ORDERED ARRAY on purpose. US3 appends `npm publish` and
// `npm dist-tag add` to this list; it should not have to restructure a
// control-flow tangle to do it, and the shape is what makes "publication is a
// separate Navigator gate" enforceable -- the steps that touch a remote are
// all behind `--push`, and every one of them is skipped by `--dry-run`.
//
// It never moves an existing tag. A tag that points somewhere other than HEAD
// is a fact about release history, and rewriting it silently is how a release
// becomes unreproducible.

import { runGit } from "#runtime/git.ts";
import {
  buildReleaseDoctorReport,
  hasFailures,
  normalizeTarget,
  type ReleaseCheck,
} from "./releaseDoctor.ts";

export type StepState = "pass" | "fail" | "skip";

export interface PromotionStep {
  name: string;
  state: StepState;
  detail?: string;
}

export interface PromotionResult {
  target: string;
  steps: PromotionStep[];
  success: boolean;
  dryRun: boolean;
  recovery: string[];
}

function step(name: string, state: StepState, detail?: string): PromotionStep {
  return detail === undefined ? { name, state } : { name, state, detail };
}

function fullCommit(repository: string, ref: string): string | null {
  const result = runGit(["rev-parse", "--verify", `${ref}^{commit}`], repository);
  const value = result.stdout.trim();
  return result.code === 0 && value ? value : null;
}

export interface PromoteOptions {
  target: string;
  start?: string;
  stableBranch?: string;
  remote?: string;
  dryRun?: boolean;
  push?: boolean;
}

export function runReleasePromotion(options: PromoteOptions): PromotionResult {
  const target = normalizeTarget(options.target);
  const stableBranch = options.stableBranch ?? "stable";
  const remote = options.remote ?? "origin";
  const dryRun = options.dryRun === true;
  const steps: PromotionStep[] = [];
  const recovery: string[] = [];
  const done = (success: boolean): PromotionResult => ({
    target,
    steps,
    success,
    dryRun,
    recovery,
  });

  const doctor = buildReleaseDoctorReport({
    target,
    start: options.start,
    stableRef: `${remote}/${stableBranch}`,
  });
  if (hasFailures(doctor)) {
    const failures = doctor.checks.filter((c: ReleaseCheck) => c.state === "fail").length;
    steps.push(step("release doctor", "fail", `${failures} failure(s)`));
    recovery.push(`Run: npm run release:doctor -- --target ${target}`);
    recovery.push("Resolve failed checks before release promotion.");
    return done(false);
  }
  const warnings = doctor.checks.filter((c: ReleaseCheck) => c.state === "warn").length;
  steps.push(step("release doctor", "pass", warnings ? `${warnings} warning(s)` : "ready"));

  const repository = doctor.repository;
  if (repository === null) {
    steps.push(step("repository", "fail", "repository unavailable"));
    return done(false);
  }
  const head = fullCommit(repository, "HEAD");
  if (head === null) {
    steps.push(step("HEAD", "fail", "HEAD unavailable"));
    return done(false);
  }

  // --- tag ----------------------------------------------------------------
  const tagCommit = fullCommit(repository, target);
  if (tagCommit === null) {
    if (dryRun) {
      steps.push(step("tag", "skip", `would create ${target} at HEAD`));
    } else {
      const created = runGit(["tag", target], repository);
      if (created.code !== 0) {
        steps.push(step("tag", "fail", created.stderr.trim() || "tag failed"));
        return done(false);
      }
      steps.push(step("tag", "pass", `created ${target} at HEAD`));
    }
  } else if (tagCommit === head) {
    steps.push(step("tag", "pass", `${target} already at HEAD`));
  } else {
    steps.push(step("tag", "fail", `${target} points to ${tagCommit.slice(0, 7)}`));
    recovery.push("Do not move release tags automatically; inspect tag history manually.");
    return done(false);
  }

  // --- stable branch ------------------------------------------------------
  const stableCommit = fullCommit(repository, stableBranch);
  if (stableCommit === null) {
    if (dryRun) {
      steps.push(step("stable branch", "skip", `would create ${stableBranch} at HEAD`));
    } else {
      const moved = runGit(["branch", "-f", stableBranch, "HEAD"], repository);
      if (moved.code !== 0) {
        steps.push(step("stable branch", "fail", moved.stderr.trim() || "branch move failed"));
        return done(false);
      }
      steps.push(step("stable branch", "pass", `created ${stableBranch} at HEAD`));
    }
  } else if (stableCommit === head) {
    steps.push(step("stable branch", "pass", `${stableBranch} already at HEAD`));
  } else {
    const ancestor = runGit(["merge-base", "--is-ancestor", stableBranch, "HEAD"], repository);
    if (ancestor.code !== 0) {
      steps.push(step("stable branch", "fail", `${stableBranch} is not an ancestor of HEAD`));
      recovery.push("Reconcile stable branch history manually before promotion.");
      return done(false);
    }
    if (dryRun) {
      steps.push(step("stable branch", "skip", `would fast-forward ${stableBranch} to HEAD`));
    } else {
      const moved = runGit(["branch", "-f", stableBranch, "HEAD"], repository);
      if (moved.code !== 0) {
        steps.push(step("stable branch", "fail", moved.stderr.trim() || "branch move failed"));
        return done(false);
      }
      steps.push(step("stable branch", "pass", `fast-forwarded ${stableBranch} to HEAD`));
    }
  }

  // --- push (the only steps that reach a remote) --------------------------
  if (!options.push) {
    steps.push(step("push", "skip", "use --push to publish tag and stable"));
    return done(true);
  }
  if (dryRun) {
    steps.push(step("push tag", "skip", `would push ${target}`));
    steps.push(step("push stable", "skip", `would push ${stableBranch}`));
    return done(true);
  }
  for (const [name, ref] of [
    ["push tag", target],
    ["push stable", stableBranch],
  ] as const) {
    const pushed = runGit(["push", remote, ref], repository);
    if (pushed.code !== 0) {
      steps.push(step(name, "fail", pushed.stderr.trim() || "push failed"));
      return done(false);
    }
    steps.push(step(name, "pass", ref));
  }
  return done(true);
}

export function renderPromotion(result: PromotionResult): string {
  const marks: Record<StepState, string> = { pass: "✓", fail: "✗", skip: "-" };
  const lines = ["Mirror release promotion", ""];
  lines.push(`Target: ${result.target}`);
  lines.push(`Mode: ${result.dryRun ? "dry-run" : "execute"}`);
  lines.push("");
  for (const entry of result.steps) {
    const mark = marks[entry.state] ?? "?";
    lines.push(
      entry.detail ? `[${mark}] ${entry.name}: ${entry.detail}` : `[${mark}] ${entry.name}`,
    );
  }
  lines.push("");
  lines.push(`Release promotion result: ${result.success ? "success" : "failed"}`);
  if (result.recovery.length > 0) {
    lines.push("");
    lines.push("Recovery:");
    for (const entry of result.recovery) lines.push(`- ${entry}`);
  }
  return `${lines.join("\n")}\n`;
}

function optionValue(argv: readonly string[], name: string): string | null {
  const index = argv.indexOf(name);
  if (index === -1) return null;
  return argv[index + 1] ?? null;
}

export function main(argv: readonly string[]): number {
  const target = optionValue(argv, "--target");
  if (target === null) {
    process.stderr.write(
      "usage: npm run release:promote -- --target vX.Y.Z [--stable stable] [--remote origin] [--dry-run] [--push]\n",
    );
    return 2;
  }
  const result = runReleasePromotion({
    target,
    stableBranch: optionValue(argv, "--stable") ?? "stable",
    remote: optionValue(argv, "--remote") ?? "origin",
    dryRun: argv.includes("--dry-run"),
    push: argv.includes("--push"),
  });
  process.stdout.write(renderPromotion(result));
  return result.success ? 0 : 1;
}

if (import.meta.filename === process.argv[1]) {
  process.exit(main(process.argv.slice(2)));
}
