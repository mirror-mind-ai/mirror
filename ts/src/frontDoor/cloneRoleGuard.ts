// CV22.DS7.US8 plateau 7 — the production-clone guard `build load` runs first.
//
// Port of `_is_mirror_mind_checkout` and `_check_clone_role_guard` in
// `src/memory/cli/build.py`. It lives in the route layer, not in `builder/`,
// because its inputs are the MACHINE's — a git root, a marker file, a
// `pyproject.toml` — and `builder/` is graded as a pure port over a database.
// `runBuildLoad` therefore takes the outcome as an injected seam, which is also
// what lets the corpus grade the ordering (a refusal prints no banner) without
// depending on the developer's own checkout.
//
// Two behaviors, and the second is easy to miss: `--ignore-production-role` does
// not skip the guard, it DOWNGRADES it — an orange warning on stderr, and the
// session start continues. A port that treated the flag as "do not look" would
// lose the warning, which is the only trace that a Navigator worked in a
// production clone on purpose.

import { existsSync, statSync } from "node:fs";
import { inspectCloneRole } from "#runtime/git.ts";
import { findPackageIdentity } from "#runtime/packageIdentity.ts";

/** What the guard decided, or null when it has nothing to say. */
export interface CloneRoleGuardOutcome {
  /** Bytes for stderr, `print`'s trailing newline included. */
  readonly stderr: string;
  /**
   * The exit code, or null to CONTINUE after printing.
   *
   * Python exits **2** here, not 1: the guard is a usage-level refusal, in the
   * same class as argparse's. Recorded as a value rather than assumed by the
   * caller, because `runBuildLoad`'s other refusal (an unknown journey) exits 1
   * and the two are one `if` apart.
   */
  readonly exitCode: number | null;
}

export interface CloneRoleGuardOptions {
  readonly ignoreProductionRole?: boolean;
  /** Where the walk starts when the journey has no project path: Python uses `cwd`. */
  readonly currentDirectory?: string;
}

/**
 * Was `_is_mirror_mind_checkout`: walk upward to the first directory holding
 * both `pyproject.toml` and `src/memory/`, and ask whether that pyproject
 * declares Mirror Mind.
 *
 * **CV22.DS10.TS5 re-points the markers** (decision D1) to the TypeScript
 * package, because `src/memory/` is deleted at plateau 3 — and a guard keyed
 * to a deleted directory does not fail, it silently answers "not a checkout"
 * and stops guarding. The production clone-role refusal would have
 * disappeared with no test going red. See `#runtime/packageIdentity.ts`.
 *
 * The two properties Python had are preserved exactly, and are the reason this
 * is a walk rather than a lookup:
 *
 *   * the walk STOPS at the first directory carrying the structural markers,
 *     whatever it then answers — a nested project decides for itself instead
 *     of inheriting its parent's identity;
 *   * an unreadable or malformed manifest answers `false` rather than
 *     continuing upward — Python's `return False` inside the `except`.
 */
export function isMirrorMindCheckout(start: string): boolean {
  return findPackageIdentity(start)?.isMirrorMind === true;
}

/**
 * Python `_check_clone_role_guard`, as a value.
 *
 * `null` means the guard has nothing to say: the path is not a Mirror Mind
 * checkout, or its clone is not marked `production`.
 */
export function inspectBuilderCloneRole(
  projectPath: string | null,
  options: CloneRoleGuardOptions = {},
): CloneRoleGuardOutcome | null {
  const start = projectPath ?? options.currentDirectory ?? process.cwd();
  if (!isMirrorMindCheckout(start)) return null;
  const role = inspectCloneRole(start);
  if (role.value !== "production") return null;
  if (options.ignoreProductionRole) {
    return {
      stderr:
        "\u001b[38;5;208m⚠️  Production clone override: --ignore-production-role passed.\u001b[0m\n",
      exitCode: null,
    };
  }
  // Python renders the absent marker as this literal, so the message names the
  // reason the default applied instead of printing `None`.
  const source = role.source ?? "<default: missing marker>";
  return {
    stderr:
      "Builder Mode refused: the journey project clone is marked 'production'.\n" +
      `  Project path: ${projectPath || "<current directory>"}\n` +
      `  Clone role source: ${source}\n` +
      "  Development should happen in a clone marked 'dev'.\n" +
      "  To proceed here anyway, pass --ignore-production-role.\n",
    exitCode: 2,
  };
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}
