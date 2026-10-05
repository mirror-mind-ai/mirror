// What identifies a Mirror Mind tree, and where its version comes from.
//
// CV22.DS10.TS5 plateau 1, decision D1. Until this story both answers were
// read out of `pyproject.toml`:
//
//   * `packageVersion` walked upward for its `version =` line -- THE version,
//     read by the updater, the release doctor, the welcome card,
//     `runtime version|status`, the MCP server's `initialize`, and the Claude
//     plugin builder (US2 decision D2: one body, so npm changes one place);
//   * `isMirrorMindCheckout` identified a checkout as the first directory
//     holding both `pyproject.toml` and `src/memory/`.
//
// The second one is why this module exists rather than a one-line edit.
// Deleting `src/memory/` would have silently disabled the production
// clone-role guard -- the check that stops Builder from mutating a production
// clone -- because the guard would simply stop recognizing the tree. No test
// would have failed. The inventory found it by reading; `cloneRoleGuard.test.ts`
// now pins it.
//
// So identity moves to the TypeScript package, and both answers come from one
// walk. CV22.DS10.US3 (decisions D1, D2) renamed the package to `mirror-mind`
// and moved the manifest to the repository root, so a checkout and an
// installed package have the same paths and one layout serves both.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * The npm package name that identifies this codebase, and the name
 * `npm install -g` takes (CV22.DS10.US3, D1).
 *
 * It is checked rather than assumed so a stray `package.json` -- `.pi/`,
 * `frame/`, a user's own project -- is never mistaken for Mirror Mind.
 */
export const PACKAGE_NAME = "mirror-mind";

/**
 * Where the manifest and the front door sit relative to a tree root.
 *
 * One layout, because the repository IS the package (US3, D2): the manifest at
 * the root and the front door at `ts/src/frontDoor/cli.ts`, in a checkout and
 * under `npm root -g` alike. Until US3 a second candidate described a
 * flattened install that was never published.
 */
const MANIFEST = "package.json";
const FRONT_DOOR = join("ts", "src", "frontDoor", "cli.ts");

export interface PackageIdentity {
  /** The tree root: the directory the manifest was found relative to. */
  readonly root: string;
  /** The manifest's `name`, whatever it is. */
  readonly name: string;
  /** The manifest's `version`, or null when it has none. */
  readonly version: string | null;
  /** True when `name` is this codebase's. */
  readonly isMirrorMind: boolean;
}

function readIdentity(root: string): PackageIdentity | null {
  const manifestPath = join(root, MANIFEST);
  // BOTH markers, as Python required both `pyproject.toml` and `src/memory/`:
  // a manifest alone is a file anyone can have, and the front door is what
  // makes the tree this program.
  if (!existsSync(manifestPath) || !existsSync(join(root, FRONT_DOOR))) return null;
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      name?: unknown;
      version?: unknown;
    };
    const name = typeof parsed.name === "string" ? parsed.name : "";
    return {
      root,
      name,
      version: typeof parsed.version === "string" ? parsed.version : null,
      isMirrorMind: name === PACKAGE_NAME,
    };
  } catch {
    // An unreadable or malformed manifest answers "not Mirror Mind" rather
    // than continuing upward -- Python's `return False` inside the `except`,
    // not a `continue`. A broken manifest is a broken tree, not an absent one.
    return { root, name: "", version: null, isMirrorMind: false };
  }
}

/**
 * Walk upward for the nearest tree that carries a manifest AND a front door.
 *
 * **The walk STOPS at the first such directory, whatever it answers.** It does
 * not keep climbing toward a tree that would say yes. That is Python's
 * behavior for the pyproject/`src/memory` pair, and it is what makes a nested
 * project decide for itself instead of inheriting its parent's identity.
 */
export function findPackageIdentity(start: string): PackageIdentity | null {
  let current = resolve(start);
  for (;;) {
    const identity = readIdentity(current);
    if (identity) return identity;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}
