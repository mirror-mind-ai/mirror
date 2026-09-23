// The project's version, read from source.
//
// Extracted from `runtime/git.ts` (CV22.DS9.TS2): the MCP server reports this
// string in `initialize`, and importing the git module -- which spawns
// `git`, carries network timeouts, and owns the read-only-repository boundary --
// to learn a version is the wrong dependency direction. `git.ts` re-exports it,
// so the runtime surface's call sites are unchanged.

import { findPackageIdentity } from "./packageIdentity.ts";

/**
 * THE product version. One function, read by the updater, the release doctor,
 * the welcome card, and the MCP server, so that npm distribution changes one
 * body and nothing else (CV22.DS10.US2, decision D2).
 *
 * Until CV22.DS10.TS5 this walked upward for `pyproject.toml`'s first
 * `version =` line, a port of `_version_from_pyproject`.
 *
 * **TS5 moves the authority to the TypeScript package** (decision D1). The
 * comment that used to live here said US3 would do it, while the Zero Python
 * gate assigned `pyproject.toml`'s deletion to TS5 -- both could not hold, and
 * a version that reads a file this story deletes would answer `null` and
 * render as `unknown` in the updater, the release doctor, the welcome card,
 * and the MCP handshake.
 *
 * `ts/package.json` therefore carries the real version from now on. US3 still
 * changes exactly one place, which was US2's intent: `PACKAGE_NAME` and the
 * `private` flag.
 */
export function packageVersion(start: string): string | null {
  const identity = findPackageIdentity(start);
  // A tree that is not ours has no version to report -- the same `null` the
  // pyproject walk returned when it reached the filesystem root.
  if (!identity?.isMirrorMind) return null;
  return identity.version;
}
