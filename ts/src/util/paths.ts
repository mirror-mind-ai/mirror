// Filesystem path helpers for the front door.
//
// normalizeProjectPath is the parity crux of routing `journey set-path`: it must
// canonicalize a path the way Python's _normalize_project_path does
// (`Path(value).expanduser().resolve()`).

import { accessSync, constants, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join, resolve } from "node:path";

/**
 * Expand a leading `~` or `~/` to the home directory. A `~user` path passes
 * through unchanged (Python's expanduser resolves known users; for the front
 * door's purposes pass-through matches the unknown-user behavior and never
 * fabricates a wrong path — pre-CR007 this mangled `~user/x` into home+`ser/x`).
 */
export function expandHome(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

/** Can this process execute the file at `path`? */
export function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Where `command` resolves on `env.PATH`, or null: what a shell's `command -v`
 * answers, for the PATH this process was given. The one rule for "is `mirror`
 * reachable", "which runtimes are installed", and the hook wrappers' Node.
 */
export function commandOnPath(
  command: string,
  env: NodeJS.ProcessEnv,
  canExecute: (path: string) => boolean = isExecutable,
): string | null {
  for (const dir of (env.PATH ?? "").split(delimiter).filter(Boolean)) {
    const candidate = join(dir, command);
    if (canExecute(candidate)) return candidate;
  }
  return null;
}

/**
 * Canonicalize a project path like Python's `Path(value).expanduser().resolve()`:
 * expand `~`, make it absolute, and resolve symlinks. Node's `realpathSync` throws
 * on a missing path, so fall back to the absolute (non-symlink) path — Python
 * resolves non-strict, but `set-path` targets a real directory in the normal case.
 */
export function normalizeProjectPath(value: string): string {
  const absolute = resolve(expandHome(value));
  try {
    return realpathSync(absolute);
  } catch {
    return absolute;
  }
}
