// The tree that holds the running program. CV22.DS10.US3 plateau 1.
//
// Three readers used to locate the tree three ways: `init` walked up from its
// own file for `templates/identity`; `runtime release-notes` asked
// `git rev-parse --show-toplevel` and fell back to the cwd; the welcome card
// read `<cwd>/docs/releases/<version>.md`. Only the first worked for an
// installed package, and the third answered for whatever directory the person
// happened to be in. Now there is one answer, from the same walk the version
// and the checkout guard already use (`packageIdentity.ts`), anchored at this
// file -- so it is the tree the code came from, in a checkout, through
// `npm link`, or under `npm root -g` alike. Never the cwd, never git.

import { findPackageIdentity } from "./packageIdentity.ts";

export class TreeRootNotFoundError extends Error {}

/**
 * The root of the tree this module was loaded from: the directory holding the
 * manifest and the front door. Throws when there is none, which means the
 * program is running from a copy that is not a Mirror Mind tree at all.
 */
export function runningTreeRoot(): string {
  const identity = findPackageIdentity(import.meta.dirname);
  if (identity === null) {
    throw new TreeRootNotFoundError(
      `no Mirror Mind tree holds ${import.meta.filename}: package.json and ts/src/frontDoor/cli.ts not found above it`,
    );
  }
  return identity.root;
}
