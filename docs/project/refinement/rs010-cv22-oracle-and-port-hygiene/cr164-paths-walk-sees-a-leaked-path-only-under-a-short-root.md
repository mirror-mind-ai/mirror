[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR164 — `pathsWalk.test.ts` can see a leaked absolute path only under a short root, so `builderWorld` must stay in `/tmp`

## Problem

CR082's walk proves that no marked surface prints an absolute path inside the
project. `assertNoAbsolutePath` (`ts/test/builder/pathsWalk.test.ts`) does it by
looking for the world's root, `ROOT_MARK = "/tmp/builder-world-"`, on each card row.
That works only while the root is short enough to sit whole on one row: a card row is
`CARD_WIDTH` = 54 columns, and a longer leaked path is cut across rows, so no single
row holds the root and the check passes whatever was printed. The file knows it: its
constant says the root "fits on one card row with room to spare", and one test asserts
"the world sits under the short root".

That assertion is how CR163 found it. Moving `builderWorld`'s worlds under
`os.tmpdir()` failed it alone: on macOS a world's root there is 81 characters
(`/private/var/folders/…/T/builder-world-AbC123/tmp`), where `/tmp/builder-world-…` is
25. Every other check in the file still passed, which is the danger: they had stopped
being able to fail. So `builderWorld` keeps a literal `/tmp` root, its own registry,
and `removeBuilderWorlds`, the one exception to CR163's rule, and its worlds are out of
sight of CR163's run-level check.

## Expected Behavior

The walk detects a leaked absolute path whatever the root's length, for example by
joining a row with the full-width rows it continues before looking for the root, or by
matching the world's unique final segment in that joined text. Then `builderWorld`
makes its worlds through `tempDir` like every other home, and CR163's guard loses its
one exception.

## Impact

Low. The check works today, because the root is short, and `builderWorld`'s registry
removes its worlds. The cost is one exception in CR163's repository guard and six test
files whose homes the run-level check cannot see.

## Plan Or Decision

Captured, unassigned, 2026-10-24, under CR163's approved amendment A13 (a file that
depends on the `/tmp` path itself is captured rather than reshaped), in RS010 beside
CR163. Not planned. Current Focus unchanged.

## Evidence

- CR163, step 4, 2026-10-24: with `builderWorld` on `tempDir`, 1,216 of the six
  folders' 1,217 tests passed; the one failure was `a double claim met by Plan names
  both packages project-relative on its Error line`, at its precondition `the world
  sits under the short root` (`dirname(w.project).startsWith(ROOT_MARK)`).
- `ts/src/builder/card.ts`: `CARD_WIDTH = 54`. `assertNoAbsolutePath` exempts a row
  that continues a full 54-column chunk from its `/` check, because a long
  project-relative path can be cut right before a slash.
- macOS's system temp folder, by its real path, is 56 characters
  (`/private/var/folders/5k/…/T`); a `tempDir` world root under it is 81.
- `builderWorld` serves six test files: `flowUnitCarry`, `cadenceSurfaces`,
  `escapedPipe`, `pathsWalk`, `statusWalk`, `nextActionsWalk`.

## Outcome

Open.
