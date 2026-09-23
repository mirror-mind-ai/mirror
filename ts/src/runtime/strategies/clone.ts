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
