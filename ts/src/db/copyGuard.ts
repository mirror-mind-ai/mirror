// Copy-only write guard for the database seam.
//
// A write-parity proof — and any DS4 write applied for validation — mutates its
// target. It must therefore run only against a *copy* of the database under a
// `tmp/` directory, never the authors' live `memory.db`. This guard is a db-layer
// safety primitive so the seam can refuse a dangerous open before the driver
// touches the file; the parity harness reuses it rather than owning it.

import { basename } from "node:path";

/** Raised when a write path is a live database or otherwise not a safe copy. */
export class CopyOnlyGuardError extends Error {}

/**
 * Refuse to operate on anything but a DB copy. Fails closed: a `memory.db`
 * basename, or any path without a `tmp` segment, aborts before any write.
 */
export function assertCopyTarget(path: string): void {
  if (basename(path) === "memory.db") {
    throw new CopyOnlyGuardError("refusing to run a write against a live memory.db");
  }
  const segments = path.split(/[/\\]/);
  if (!segments.includes("tmp")) {
    throw new CopyOnlyGuardError("write target must be a copy under a tmp/ directory");
  }
}
