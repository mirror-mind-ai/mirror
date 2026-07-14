// Filesystem path helpers for the front door.
//
// normalizeProjectPath is the parity crux of routing `journey set-path`: it must
// canonicalize a path the way Python's _normalize_project_path does
// (`Path(value).expanduser().resolve()`).

import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/** Expand a leading `~` to the home directory (matches the front door's DB-path handling). */
export function expandHome(path: string): string {
  return path.startsWith("~") ? join(homedir(), path.slice(2)) : path;
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
