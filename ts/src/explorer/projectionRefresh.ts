// CV22.DS7.US7 plateau 5 — the Journey projection refresh seam.
//
// Every Explorer Story write asks Python to refresh the Journey projection,
// and this module is the whole of that request. TypeScript does NOT publish.
//
// Why the seam exists at all (2026-09-09 decision, and the DS10 deletion gate
// that follows from it): projection publication is linearizable per Journey
// through one cross-process lock, and that lock is `filelock.FileLock` ->
// `fcntl.flock`. Node has no `flock` in core, and the mkdir-based JavaScript
// lock libraries do not exclude against it at all. A TypeScript publisher would
// therefore not be a port — it would be a second, unsynchronized writer on the
// same `.mirror/projections` tree for as long as both cores exist, in a
// directory the user's project carries under version control. After Python is
// deleted there is one writer and the problem is gone, which makes this the one
// subsystem where porting early is strictly worse than porting late.
//
// It delegates to `journey-projection refresh`, NOT `rebuild-operational`.
// Rebuild always compiles and publishes; the coordinator publishes only when
// the compiled digest changed, so rebuild would emit a snapshot and a receipt
// on every Explorer write where Python emits none.
//
// Best-effort by contract, matching `Store.request_projection_refresh`: the
// story write has already committed and is authoritative. A refresh that cannot
// run must not fail the write, must not reach stdout, and must not throw.

import { spawnSync } from "node:child_process";

/** What an Explorer write calls after the store has committed. */
export interface ProjectionRefreshSeam {
  request(journey: string): void;
}

export interface ProjectionRefreshOptions {
  /**
   * The mirror home to delegate against.
   *
   * Required, because the delegated process resolves its OWN database and
   * cannot inherit this one. Most invocations do not pass `--mirror-home` —
   * runtimes set `MIRROR_HOME` in the environment instead — so the caller must
   * resolve both, and a request with neither is skipped rather than guessed.
   * Getting this wrong is invisible: the seam is best-effort, so a home it
   * cannot resolve would silently stop refreshing forever.
   */
  readonly mirrorHome?: string | null;
  /** Milliseconds before the delegated process is abandoned. */
  readonly timeoutMs?: number;
  /** Diagnostic sink. Never stdout: the story surfaces own that stream. */
  readonly onDiagnostic?: (message: string) => void;
}

// A projection compile walks the project's roadmap, refinement, and exploration
// documents, so it is not instant -- but it is also not allowed to hold up a
// ritual. Bounded well below the front door's Python fallback timeout, because
// unlike a fallback this is a side effect nobody is waiting on.
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * The seam used in production: spawn Python, ignore every outcome except for a
 * diagnostic line.
 */
export function createPythonProjectionRefresh(
  options: ProjectionRefreshOptions = {},
): ProjectionRefreshSeam {
  return {
    request(journey: string): void {
      const mirrorHome = options.mirrorHome ?? process.env.MIRROR_HOME ?? null;
      if (!mirrorHome) {
        options.onDiagnostic?.(
          "projection refresh skipped: no --mirror-home and no MIRROR_HOME to delegate against",
        );
        return;
      }
      const args = [
        "run",
        "python",
        "-m",
        "memory",
        "journey-projection",
        "refresh",
        "--mirror-home",
        mirrorHome,
        "--journey",
        journey,
        "--format",
        "json",
      ];

      try {
        const result = spawnSync("uv", args, {
          cwd: process.cwd(),
          env: process.env,
          // The payload is diagnostic only. Inheriting stdout would splice JSON
          // into a rendered Explorer surface, which is `transport=verbatim`.
          stdio: ["ignore", "pipe", "pipe"],
          encoding: "utf-8",
          timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        });
        if (result.error) {
          options.onDiagnostic?.(`projection refresh could not run: ${result.error.message}`);
          return;
        }
        if (result.status !== 0) {
          options.onDiagnostic?.(`projection refresh exited ${result.status}`);
          return;
        }
        options.onDiagnostic?.(`projection refresh: ${(result.stdout ?? "").trim()}`);
      } catch (error) {
        // Unreachable through spawnSync's normal contract, and swallowed anyway:
        // the boundary this module exists to hold is "the write already
        // committed", not "the refresh succeeded".
        options.onDiagnostic?.(
          `projection refresh raised: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  };
}

/** The seam for tests, smokes, and any context that must not spawn. */
export const noProjectionRefresh: ProjectionRefreshSeam = {
  request(): void {
    // Intentionally empty.
  },
};
