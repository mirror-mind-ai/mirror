// Filesystem path helpers for the front door.
//
// normalizeProjectPath is the parity crux of routing `journey set-path`: it must
// canonicalize a path the way Python's _normalize_project_path does
// (`Path(value).expanduser().resolve()`).

import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

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
