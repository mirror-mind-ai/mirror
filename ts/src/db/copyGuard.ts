// Copy-only write guard for the database seam.
//
// A write-parity proof — and any DS4 write applied for validation — mutates its
// target. It must therefore run only against a *copy* of the database under a
// `tmp/` directory, never the authors' live `memory.db`. This guard is a db-layer
// safety primitive so the seam can refuse a dangerous open before the driver
// touches the file; the parity harness reuses it rather than owning it.
//
// The rules run against the RESOLVED filesystem object, not the handed string
// (CR030): a symlink named `copy.db` pointing at a live database, or a
// `tmp/../` traversal, must not pass checks that only read the path text.

import { lstatSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

/** Raised when a write path is a live database or otherwise not a safe copy. */
export class CopyOnlyGuardError extends Error {}

/**
 * Resolve the object the write would actually touch. An existing target must
 * be a regular file (symlinks are refused outright — fail closed on
 * indirection) and is fully realpath-resolved. A not-yet-existing target
 * resolves through its parent directory; when even the parent is missing the
 * lexical absolute path is used — dot-dot segments still normalize away, and
 * SQLite cannot create a file under a missing parent anyway.
 */
function resolveWriteTarget(path: string): string {
  let isSymlink = false;
  let exists = true;
  try {
    isSymlink = lstatSync(path).isSymbolicLink();
  } catch {
    exists = false;
  }
  if (isSymlink) {
    throw new CopyOnlyGuardError(`write target is a symlink; refusing indirection: ${path}`);
  }
  if (exists) return realpathSync(path);
  try {
    return join(realpathSync(dirname(path)), basename(path));
  } catch {
    return resolve(path);
  }
}

/**
 * Refuse to operate on anything but a DB copy. Fails closed: a `memory.db`
 * basename, or any resolved path without a `tmp` segment, aborts before any
 * write.
 */
export function assertCopyTarget(path: string): void {
  const resolved = resolveWriteTarget(path);
  if (basename(resolved) === "memory.db") {
    throw new CopyOnlyGuardError("refusing to run a write against a live memory.db");
  }
  const segments = resolved.split(/[/\\]/);
  if (!segments.includes("tmp")) {
    throw new CopyOnlyGuardError("write target must be a copy under a tmp/ directory");
  }
}
