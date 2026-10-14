[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR133 — `runtime release-notes` reads the git repository above the package, so a Homebrew install finds no notes

## Problem

`mirror runtime release-notes latest` and `mirror runtime release-notes vX.Y.Z` print
`Release notes: not found` on a package installed with Homebrew's Node on Apple Silicon,
though the notes ship in the package (CV22.DS10.US3 D8).

The route hands `runningTreeRoot()` to `readReleaseNote` (`ts/src/frontDoor/runtimeRoute.ts`):
the tree the code came from, "never the cwd, never git" (`ts/src/runtime/treeRoot.ts`).
`readReleaseNotes` then passes that root through `repositoryFor`
(`ts/src/runtime/releaseNotes.ts`), which asks `git rev-parse --show-toplevel` and reads
`<toplevel>/docs/releases`. In a checkout the top level is the tree root, so the climb is
invisible. Under `npm root -g` it leaves the package as soon as an ancestor directory is a
git work tree. Homebrew on Apple Silicon is one: `/opt/homebrew` is the Homebrew
repository itself. The reader looks in `/opt/homebrew/docs/releases`, which does not
exist, and finds nothing.

The climb came with the port of the Python reader (DS7.TS3 plateau 2, `e9f0bea9`), whose
start was the cwd. US3 plateau 1 (`422145c2`) moved the route's anchor to the tree root and
left the climb inside the reader.

## Expected Behavior

- `release-notes latest` and `release-notes vX.Y.Z` read `docs/releases` under the tree
  root they are given, with no git call, on every install kind: a checkout, `npm link`,
  and `npm root -g` wherever its prefix sits.
- A test pins it: a package tree nested inside an unrelated git work tree, which has no
  `docs/releases` of its own, still finds its notes. Today's tests read from a clone's
  root, where the climb and the tree root agree.
- `release-notes pending` reads git refs from the cwd and is not changed here.

## Impact

Medium for package installs: on an affected machine, `release-notes latest` and
`vX.Y.Z` answer "not found" for every version, so the `mm-release-notes` skill cannot
show what an update brought. It reaches every global prefix inside a git work tree,
including Node from Homebrew on Apple Silicon, a common Mac setup. The update itself is
unaffected, and nothing is at risk: the notes are in the package and readable by hand.

## Plan Or Decision

Captured, unassigned, after the `v0.33.0` update of a Homebrew install (2026-10-14).
Current Focus unchanged. Likely small: `readReleaseNotes` reads `docs/releases` under the
root it is given, plus the test.

## Evidence

```text
$ mirror runtime release-notes v0.33.0
Mirror runtime release notes

Release notes: not found

$ ls /opt/homebrew/lib/node_modules/mirror-mind/docs/releases/v0.33.0.md
/opt/homebrew/lib/node_modules/mirror-mind/docs/releases/v0.33.0.md

$ git -C /opt/homebrew/lib/node_modules/mirror-mind rev-parse --show-toplevel
/opt/homebrew

$ ls /opt/homebrew/docs/releases
ls: /opt/homebrew/docs/releases: No such file or directory
```

`release-notes latest` gives the same answer. Both are the same from any cwd, including a
Mirror Mind clone, because the route reads the running tree, not the cwd. Met right after
`mirror runtime update` took the install from `0.32.1` to `0.33.0`.

## Outcome

Pending.
