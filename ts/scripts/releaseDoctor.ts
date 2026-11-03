// `release-doctor` — the read-only preflight for a release (CV22.DS10.US2, D1).
//
// This left the product command surface deliberately. `runtime release-doctor`
// was offered to every installed user, and it needs a git checkout, a clean
// tree, and tags -- none of which an installed user has. It is maintainer
// tooling, so it lives in `ts/scripts/` and is reached through
// `npm run release:doctor`, while the front door answers the old name with its
// cutoff.
//
// Read-only means read-only: this never tags, merges, pushes, fetches, or
// edits a file, and the render says so.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runGit } from "#runtime/git.ts";
import { packageVersion } from "#runtime/version.ts";

export type CheckState = "pass" | "warn" | "fail";

export interface ReleaseCheck {
  name: string;
  state: CheckState;
  detail?: string;
}

export interface ReleaseDoctorReport {
  target: string;
  repository: string | null;
  checks: ReleaseCheck[];
}

export function hasFailures(report: ReleaseDoctorReport): boolean {
  return report.checks.some((check) => check.state === "fail");
}

function check(name: string, state: CheckState, detail?: string): ReleaseCheck {
  return detail === undefined ? { name, state } : { name, state, detail };
}

/** `0.31.14` and `v0.31.14` both mean the same release. */
export function normalizeTarget(target: string): string {
  const bare = target.startsWith("v") ? target.slice(1) : target;
  return `v${bare}`;
}

function fullCommit(repository: string, ref: string): string | null {
  const result = runGit(["rev-parse", "--verify", `${ref}^{commit}`], repository);
  const value = result.stdout.trim();
  return result.code === 0 && value ? value : null;
}

function refContains(repository: string, ancestor: string, descendant: string): boolean | null {
  const result = runGit(["merge-base", "--is-ancestor", ancestor, descendant], repository);
  if (result.code === 0) return true;
  if (result.code === 1) return false;
  return null;
}

/** The one command that levels the lock, as `packageLock.test.ts` names it. */
const LOCK_FIX =
  "run `npm install --package-lock-only --ignore-scripts` and commit package-lock.json";

/**
 * CR193: a release commit bumps `package.json` by hand, and nothing in the
 * route regenerated the lock. Its root said `mirror-core 0.0.0` through nine
 * releases, every `npm install` on a clone dirtied the tree, and the doctor
 * passed each one. `ts/test/scripts/packageLock.test.ts` (PR #48) fails CI on
 * the mismatch; this is the same four comparisons, before the tag exists.
 */
function lockfileCheck(repository: string): ReleaseCheck {
  const read = (file: string): Record<string, unknown> | null => {
    const path = join(repository, file);
    if (!existsSync(path)) return null;
    try {
      const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };
  const pkg = read("package.json");
  if (pkg === null) return check("lockfile", "fail", `package.json unreadable; ${LOCK_FIX}`);
  if (!existsSync(join(repository, "package-lock.json"))) {
    return check("lockfile", "fail", `package-lock.json missing; ${LOCK_FIX}`);
  }
  const lock = read("package-lock.json");
  if (lock === null) return check("lockfile", "fail", `package-lock.json unreadable; ${LOCK_FIX}`);
  const nested = ((lock.packages as Record<string, unknown> | undefined)?.[""] ?? {}) as Record<
    string,
    unknown
  >;
  const expected = `${String(pkg.name)} ${String(pkg.version)}`;
  const drift: string[] = [];
  if (lock.name !== pkg.name || lock.version !== pkg.version) {
    drift.push(`root says ${String(lock.name)} ${String(lock.version)}`);
  }
  if (nested.name !== pkg.name || nested.version !== pkg.version) {
    drift.push(`packages[""] says ${String(nested.name)} ${String(nested.version)}`);
  }
  if (drift.length === 0) return check("lockfile", "pass", `package-lock.json names ${expected}`);
  return check(
    "lockfile",
    "fail",
    `package.json is ${expected}, package-lock.json ${drift.join(", ")}; ${LOCK_FIX}`,
  );
}

function repositoryRoot(start: string): string | null {
  const result = runGit(["rev-parse", "--show-toplevel"], start);
  const value = result.stdout.trim();
  return result.code === 0 && value ? value : null;
}

export function buildReleaseDoctorReport(options: {
  target: string;
  start?: string;
  stableRef?: string;
}): ReleaseDoctorReport {
  const display = normalizeTarget(options.target);
  const start = options.start ?? process.cwd();
  const stableRef = options.stableRef ?? "origin/stable";
  const repository = repositoryRoot(start);
  if (repository === null) {
    return {
      target: display,
      repository: null,
      checks: [check("repository", "fail", "not a git repository")],
    };
  }

  const checks: ReleaseCheck[] = [check("repository", "pass", repository)];

  const status = runGit(["status", "--porcelain"], repository);
  if (status.code !== 0) {
    checks.push(check("git status", "fail", status.stderr.trim() || "git status failed"));
  } else if (status.stdout.trim() !== "") {
    checks.push(check("git tree clean", "fail", "working tree is dirty"));
  } else {
    checks.push(check("git tree clean", "pass"));
  }

  const expected = display.slice(1);
  const found = packageVersion(repository);
  checks.push(
    found === expected
      ? check("package version", "pass", found)
      : check("package version", "fail", `expected ${expected}, found ${found ?? "unknown"}`),
  );

  checks.push(lockfileCheck(repository));

  const notePath = join(repository, "docs", "releases", `${display}.md`);
  if (existsSync(notePath)) {
    checks.push(check("release note exists", "pass", notePath));
    const text = readFileSync(notePath, "utf8");
    const heading = new RegExp(`^#\\s.*${display.replace(/\./g, "\\.")}`, "m").test(text);
    checks.push(
      heading
        ? check("release note heading", "pass", display)
        : check("release note heading", "fail", `missing heading for ${display}`),
    );
  } else {
    checks.push(check("release note exists", "fail", notePath));
    checks.push(check("release note heading", "fail", "release note missing"));
  }

  const indexPath = join(repository, "docs", "releases", "index.md");
  const linked = existsSync(indexPath) && readFileSync(indexPath, "utf8").includes(`${display}.md`);
  checks.push(
    linked
      ? check("release index", "pass", `links ${display}`)
      : check("release index", "fail", `missing ${display}.md`),
  );

  const head = fullCommit(repository, "HEAD");
  const tagCommit = fullCommit(repository, display);
  if (tagCommit === null) {
    checks.push(check("release tag", "warn", `${display} not created yet`));
  } else if (head !== null && tagCommit === head) {
    checks.push(check("release tag", "pass", `${display} points to HEAD`));
  } else {
    checks.push(check("release tag", "fail", `${display} points to ${tagCommit.slice(0, 7)}`));
  }

  const stableCommit = fullCommit(repository, stableRef);
  if (stableCommit === null) {
    checks.push(check("stable ref", "warn", `${stableRef} not available locally`));
  } else if (head === null) {
    checks.push(check("stable ref", "fail", "HEAD unavailable"));
  } else if (stableCommit === head) {
    checks.push(check("stable ref", "pass", `${stableRef} is at HEAD`));
  } else {
    const stableContainsHead = refContains(repository, head, stableRef);
    const headContainsStable = refContains(repository, stableRef, "HEAD");
    if (stableContainsHead === true) {
      checks.push(check("stable ref", "pass", `${stableRef} contains HEAD`));
    } else if (headContainsStable === true) {
      checks.push(check("stable ref", "warn", `${stableRef} is behind HEAD`));
    } else if (stableContainsHead === false && headContainsStable === false) {
      checks.push(check("stable ref", "fail", `${stableRef} diverged from HEAD`));
    } else {
      checks.push(check("stable ref", "fail", `cannot compare ${stableRef}`));
    }
  }

  return { target: display, repository, checks };
}

export function renderReleaseDoctor(report: ReleaseDoctorReport): string {
  const marks: Record<CheckState, string> = { pass: "✓", warn: "!", fail: "✗" };
  const lines = ["Mirror release doctor", ""];
  lines.push(`Target: ${report.target}`);
  lines.push(`Repository: ${report.repository ?? "unknown"}`);
  lines.push("");
  for (const entry of report.checks) {
    const mark = marks[entry.state] ?? "?";
    lines.push(
      entry.detail ? `[${mark}] ${entry.name}: ${entry.detail}` : `[${mark}] ${entry.name}`,
    );
  }
  lines.push("");
  const warned = report.checks.some((entry) => entry.state === "warn");
  lines.push(
    `Release doctor result: ${
      hasFailures(report) ? "failed" : warned ? "ready with warnings" : "ready"
    }`,
  );
  lines.push(
    "Note: release doctor is read-only; it does not tag, merge, push, fetch, or edit files.",
  );
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
      "usage: npm run release:doctor -- --target vX.Y.Z [--stable origin/stable]\n",
    );
    return 2;
  }
  const report = buildReleaseDoctorReport({
    target,
    stableRef: optionValue(argv, "--stable") ?? "origin/stable",
  });
  process.stdout.write(renderReleaseDoctor(report));
  return hasFailures(report) ? 1 : 0;
}

if (import.meta.filename === process.argv[1]) {
  process.exit(main(process.argv.slice(2)));
}
