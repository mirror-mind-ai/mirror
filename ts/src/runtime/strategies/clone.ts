// The `clone` apply strategy: a git checkout following `origin/<channel>`.
// (CV22.DS10.US2)
//
// This is how every Mirror installed today receives code, and it stays the
// strategy for a checkout after npm distribution exists: the safety chain is
// the product's promise, and the transport underneath it is two git commands.
//
// Every git invocation goes through an injectable runner so the pipeline's
// decisions can be driven in tests without a remote, and so this module can be
// read as "what we ask git for" rather than "how we spawn it".

import { runGit } from "#runtime/git.ts";
import type { ApplyStrategy } from "#runtime/updatePipeline.ts";

export type GitRunner = (
  args: readonly string[],
  cwd: string,
) => { code: number; stdout: string; stderr: string };

export const defaultGitRunner: GitRunner = (args, cwd) => runGit([...args], cwd);

/** `origin/main` -> `["origin", "main"]`; anything else is refused. */
export function splitUpstream(upstream: string): [string, string] | null {
  const index = upstream.indexOf("/");
  if (index <= 0 || index === upstream.length - 1) return null;
  const remote = upstream.slice(0, index);
  const branch = upstream.slice(index + 1);
  if (remote.startsWith("-") || branch.startsWith("-")) return null;
  return [remote, branch];
}

/** The commit this install is on, read BEFORE anything moves. */
export function captureCommit(repository: string, git: GitRunner): string | null {
  const result = git(["rev-parse", "--short", "HEAD"], repository);
  const value = result.stdout.trim();
  return result.code === 0 && value ? value : null;
}

export function fetchUpstream(
  repository: string,
  upstream: string,
  git: GitRunner,
): { ok: boolean; detail: string } {
  const split = splitUpstream(upstream);
  if (split === null) return { ok: false, detail: "unexpected upstream name" };
  const [remote, branch] = split;
  const result = git(["fetch", remote, branch], repository);
  return result.code === 0
    ? { ok: true, detail: `${remote} ${branch}` }
    : { ok: false, detail: result.stderr.trim() || "fetch failed" };
}

/**
 * Fast-forward only, never a merge. A clone that cannot fast-forward has local
 * work or has diverged, and resolving that is a decision the updater must not
 * take on someone's behalf.
 */
export function fastForward(
  repository: string,
  upstream: string,
  git: GitRunner,
): { ok: boolean; detail: string } {
  const result = git(["merge", "--ff-only", upstream], repository);
  return result.code === 0
    ? { ok: true, detail: "" }
    : { ok: false, detail: result.stderr.trim() || "fast-forward refused" };
}

/** One-line subjects installed by this update, for the render. */
export function installedChanges(
  repository: string,
  previous: string | null,
  next: string | null,
  git: GitRunner,
): string[] {
  if (!previous || !next || previous === next) return [];
  const result = git(["log", "--oneline", "--no-decorate", `${previous}..${next}`], repository);
  if (result.code !== 0) return [];
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20);
}

/** The pasteable route back, with the captured value in it. */
export function cloneRecoveryCommand(previous: string | null): string {
  return previous === null ? "git reset --hard <previous commit>" : `git reset --hard ${previous}`;
}

function countCommits(repository: string, range: string, git: GitRunner): number | null {
  const result = git(["rev-list", "--count", range], repository);
  if (result.code !== 0) return null;
  const value = Number.parseInt(result.stdout.trim(), 10);
  return Number.isNaN(value) ? null : value;
}

/**
 * The clone's answers to the pipeline's questions. A ref is a short commit;
 * the channel is `origin/<channel>`; moving is a fast-forward and nothing
 * else; the way back is a hard reset to the captured commit.
 */
export function cloneStrategy(repository: string, upstream: string, git: GitRunner): ApplyStrategy {
  return {
    kind: "clone",
    applyStage: "fast-forward",

    // The ordinary gate reads the status report; a tree too broken for that
    // still has one thing the repair lane can check without it.
    repairGate: () => {
      const dirty = git(["status", "--porcelain"], repository);
      if (dirty.code !== 0 || dirty.stdout.trim() !== "") {
        return {
          ok: false,
          detail: "git tree is dirty",
          recovery: ["Commit or stash local changes, then retry runtime update --repair-updater."],
        };
      }
      return { ok: true };
    },

    capture: () => {
      const ref = captureCommit(repository, git);
      return ref === null
        ? {
            ok: false,
            detail: "could not read the current commit",
            recovery: ["Mirror must be a readable git checkout to update in place."],
          }
        : { ok: true, ref, detail: ref };
    },

    fetch: () => {
      const fetched = fetchUpstream(repository, upstream, git);
      return fetched.ok
        ? { ok: true, detail: fetched.detail }
        : {
            ok: false,
            detail: fetched.detail,
            recovery: [
              "Check network connectivity and remote access.",
              "Retry runtime update, or use --no-fetch to plan from local refs only.",
            ],
          };
    },

    plan: (previousRef) => {
      const ahead = countCommits(repository, `${upstream}..HEAD`, git);
      const behind = countCommits(repository, `HEAD..${upstream}`, git);
      if (ahead === null || behind === null) {
        return {
          kind: "blocked",
          detail: `cannot compare against ${upstream}`,
          recovery: [`Resolve upstream tracking for ${upstream}, then retry runtime update.`],
        };
      }
      if (ahead === 0 && behind === 0) return { kind: "current", detail: "already up to date" };
      if (ahead > 0) {
        return {
          kind: "blocked",
          detail: behind > 0 ? "branch diverged" : "local commits present",
          recovery: [
            behind > 0
              ? "Branch diverged; reconcile local and upstream commits manually."
              : "Local branch is ahead of upstream; push or reset before updating.",
            "The working tree and the database are unchanged.",
            `Current commit: ${previousRef}`,
          ],
        };
      }
      return {
        kind: "ahead",
        target: upstream,
        detail: `pull ${behind} remote commit(s)`,
        dryRun: `would pull ${behind} commit(s) from ${upstream}`,
      };
    },

    apply: (previousRef, target) => {
      const applied = fastForward(repository, target, git);
      if (!applied.ok) {
        return {
          ok: false,
          detail: applied.detail,
          recovery: ["Working tree is unchanged because fast-forward refused."],
        };
      }
      const newRef = captureCommit(repository, git);
      return {
        ok: true,
        newRef,
        detail: `${previousRef} -> ${newRef ?? "unknown"}`,
        changes: installedChanges(repository, previousRef, newRef, git),
      };
    },

    recoveryCommand: cloneRecoveryCommand,
    installedState: (newRef) => `Code is on ${newRef ?? "the new commit"}`,
  };
}
