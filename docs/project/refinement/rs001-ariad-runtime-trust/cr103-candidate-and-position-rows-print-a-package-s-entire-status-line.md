[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR103 — Candidate and position rows print a roadmap package's entire status line

## Problem

Builder surfaces interpolate a roadmap package's `**Status:**` value verbatim, and
several packages in this project use that line as a running changelog:

- `CV9.E2`'s status line is 5,458 characters on `HEAD` (5,228 at `dfd44051`). In
  `PROJECT_POSITION`'s candidate list it rendered as about 90 card lines during
  CR002's Navigator validation. That list is most of the first screen a fresh
  journey reads before choosing its first pull.
- `CV22`'s status line is 967 characters. `■ BUILDER RESUME` prints it whole in
  the `roadmap position` row, about 20 card lines, on every
  `/mm-build mirror-ts-core`.

Two formatters print the status raw. `formatCandidate`
(`ts/src/builder/pullCandidates.ts`) feeds the `PROJECT_POSITION` and
`PULL_CANDIDATES` lists and the `recommended pull` row. `formatPackage`
(`ts/src/builder/scopePhrases.ts`) feeds the resume row. Both behaviors predate
CR002, which kept the existing formats: `formatPackage` reproduces Python's
`_format_roadmap_position`.

## Expected Behavior

A row states a package's status in a form that fits the row, such as its status
marker or its first clause, and never prints the whole authored line. The full
status stays in the package, whose path the row already names.

## Impact

The codes, titles, and levels the Navigator needs to choose a pull are buried
under changelog prose. The agent reads the same surfaces, so each activation
spends context on thousands of characters of it.

## Plan Or Decision

Pending. Captured while working the Ariad trust floor, which captures what it
finds instead of fixing it
([decision](../../decisions.md#the-cv22-release-is-gated-on-an-ariad-trust-floor-worked-before-us3));
this CR is not on the floor. Decide first where the fix belongs: in rendering (a
compact status form), in authoring (status lines stop carrying history), or in
both.

## Evidence

- CR002's Navigator validation, 2026-09-26, step 2: the `CV9.E2` row of
  `PROJECT_POSITION` on the July tree.
- `git show HEAD:docs/project/roadmap/cv9-mirror-1-0/cv9-e2-stabilization/index.md | grep -m1 '^\*\*Status:\*\*' | wc -c`
  prints `5458`; the same for
  `docs/project/roadmap/cv22-typescript-core-port/index.md` prints `967`.
- The `■ BUILDER RESUME` rendered when CR002's session activated Builder Mode on
  2026-09-26 carries CV22's full status in its `roadmap position` row.

## Outcome

Pending.
