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
// walk. US3 changes `PACKAGE_NAME` and the `private` flag when it renames and
// publishes; nothing else moves.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * The npm package name that identifies this codebase.
 *
 * **US3 changes this one constant** when it renames the package. It is checked
 * rather than assumed so a stray `package.json` -- `.pi/`, `frame/`, a user's
 * own project -- is never mistaken for Mirror Mind.
 */
export const PACKAGE_NAME = "mirror-core";

/**
 * Where the manifest sits relative to a tree root, in walk order.
 *
 * `ts/package.json` is the development clone; `package.json` is an installed
 * package, where `ts/` has been flattened away. Checking both means this
 * module does not need to know which one it is looking at, and US3 does not
 * need to revisit it.
 */
const MANIFEST_CANDIDATES: readonly { manifest: string; frontDoor: string }[] = [
  { manifest: join("ts", "package.json"), frontDoor: join("ts", "src", "frontDoor", "cli.ts") },
  { manifest: "package.json", frontDoor: join("src", "frontDoor", "cli.ts") },
];

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
  for (const candidate of MANIFEST_CANDIDATES) {
    const manifestPath = join(root, candidate.manifest);
    // BOTH markers, as Python required both `pyproject.toml` and `src/memory/`:
    // a manifest alone is a file anyone can have, and the front door is what
    // makes the tree this program.
    if (!existsSync(manifestPath) || !existsSync(join(root, candidate.frontDoor))) continue;
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
  return null;
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
