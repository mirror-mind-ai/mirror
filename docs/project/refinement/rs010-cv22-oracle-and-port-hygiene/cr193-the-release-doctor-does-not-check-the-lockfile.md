[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR193 — The release doctor checks the package version and not the lockfile's, so a release commit that forgets `package-lock.json` passes it

## Problem

`npm run release:doctor -- --target vX.Y.Z` (`ts/scripts/releaseDoctor.ts`) is the gate
`release:promote` runs before it tags. It checks the tree is clean, `package.json`'s
version is the target, the release note exists with its heading, the index links it, and
the tag and `stable` are where they should be. It does not read `package-lock.json`.

A release commit bumps `package.json` by hand. Nothing in the route regenerates the lock,
so its root stayed at `mirror-core 0.0.0` from the day the repository became the package
(CV22.DS10.US3 plateau 1) through v0.39.1: nine releases, each of which the doctor
passed. On every clone, the first `npm install` rewrote the lock's root, the tree went
dirty, and `runtime diagnose` reported `git_dirty: M package-lock.json` to a person who
had changed nothing. PR #48 (Rodrigo Immaginario, opened 2026-10-19, merged 2026-11-02 as
`fc6a648a`) regenerated the lock and added `ts/test/scripts/packageLock.test.ts`, which
fails CI when the two disagree. That catches the drift after the push. The doctor is
where it should be caught: before the commit is tagged, with the fix named.

## Expected Behavior

- The doctor has a `lockfile` check: `package-lock.json`'s root `name` and `version`, at
  the top level and in `packages[""]`, equal `package.json`'s. A mismatch is a failure
  whose detail names the fix, the same command the test names:
  `npm install --package-lock-only --ignore-scripts`, then commit `package-lock.json`.
- A missing or unreadable lock is a failure too, not a skip.
- `releaseDoctor.test.ts` (or wherever the doctor's checks are pinned) covers the pass,
  the mismatch, and the missing lock.
- The release-notes or versioning process page names the lock among what a release
  commit changes, beside `package.json` and the plugin manifests.

## Impact

Low once PR #48's test exists: CI fails the release commit, and the fix is one command.
What the doctor adds is the order of events: a release that fails the doctor is not
tagged and not pushed; a release that fails CI is already on `main` with its tag on the
way, and the fix is a second commit after the one the tag names.

## Plan Or Decision

Captured, unassigned, 2026-11-02, at the Navigator's direction, as the follow-up PR #48's
merge named.

Not planned. One check in the doctor, its test, and one sentence of process doc.

## Evidence

- `ts/scripts/releaseDoctor.ts`, the checks from `repository` to `stable ref`: none reads
  `package-lock.json`.
- `main` before `fc6a648a`: `package-lock.json` root `mirror-core 0.0.0`; v0.36.0 through
  v0.39.1 bumped `package.json` and not the lock (PR #48's four rebase comments and the
  release commits `ca7295a4`, `27018088`).
- `npm install --package-lock-only --ignore-scripts` on `main` at `65263e87`, 2026-11-02:
  the diff is the root's `name`, `version`, `license`, `bin`, nothing else.
- `ts/test/scripts/packageLock.test.ts`, merged with PR #48, green at `fc6a648a`.

## Outcome

Pending: captured, not planned.
