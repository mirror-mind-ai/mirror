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

Selected as Current Focus and planned 2026-11-02; approved by the Navigator the same day.
Driver `@viniciusteles`, Delivery `main`.

### Scope

1. `ts/scripts/releaseDoctor.ts`: after `package version`, a `lockfile` check. It reads
   `package-lock.json` and compares its top-level `name` and `version`, and
   `packages[""]`'s, with `package.json`'s: the four comparisons
   `ts/test/scripts/packageLock.test.ts` makes, so the doctor and the test agree on what
   "level" means. A mismatch is `fail`, with the drift and the fix in the detail:
   `` run `npm install --package-lock-only --ignore-scripts` and commit package-lock.json ``.
   A missing or unparsable lock is `fail` with the same fix. Read-only, as the doctor is.
2. `ts/test/runtime/release.test.ts`: the fixture gains a level lock, so "a release-ready
   repository passes every check" holds; "each defect the doctor exists to catch" gains
   the lock at the old version and the lock missing; promotion with a bad lock creates
   no tag, through the existing "refuses when the doctor fails" path.
3. `docs/process/versioning.md`: one paragraph naming what a release commit changes --
   `package.json`, the two plugin manifests, `package-lock.json` regenerated, the note,
   the index, the worklog -- and that the doctor fails on a lock left behind.

### Acceptance

- `npm run release:doctor -- --target v0.39.1` on `main` passes the `lockfile` check.
- With the lock's root edited back to `mirror-core 0.0.0`, it fails naming the command.
- Promotion with that lock creates no tag.

### Exclusions

- Regenerating the lock for the maintainer: the doctor edits no file, by rule.
- Dependency drift inside the lock: `npm ci` is the check for that.

### Decisions Taken At Approval

Reviewed through the lenses on 2026-11-02 with no amendments: engineer, the four
comparisons shared with the test; quality assurance, promotion covered through the
existing doctor-failure path; DevOps and security, nothing new reaches a remote or a file.

## Evidence

- `ts/scripts/releaseDoctor.ts`, the checks from `repository` to `stable ref`: none reads
  `package-lock.json`.
- `main` before `fc6a648a`: `package-lock.json` root `mirror-core 0.0.0`; v0.36.0 through
  v0.39.1 bumped `package.json` and not the lock (PR #48's four rebase comments and the
  release commits `ca7295a4`, `27018088`).
- `npm install --package-lock-only --ignore-scripts` on `main` at `65263e87`, 2026-11-02:
  the diff is the root's `name`, `version`, `license`, `bin`, nothing else.
- `ts/test/scripts/packageLock.test.ts`, merged with PR #48, green at `fc6a648a`.

### Implementation and validation, 2026-11-02

- Commits on `main`: `8c0fd9f5` (doctor and tests), `c23f5245` (versioning page).
- `release.test.ts`: the fixture carries a level lock; four new tests cover the root left
  behind, the nested root alone behind, a missing and an unreadable lock, and promotion
  creating no tag. 21 tests in the file, 395 across `ts/test/runtime` and
  `ts/test/scripts`, all passing; `tsc --noEmit` and `biome check` clean.
- Acceptance on `main` at `caf5fce5`'s tree: `npm run release:doctor -- --target v0.39.1`
  prints `[✓] lockfile: package-lock.json names mirror-mind 0.39.1`; with the lock's root
  edited back to `mirror-core 0.0.0` it prints `[✗] lockfile: package.json is mirror-mind
  0.39.1, package-lock.json root says mirror-core 0.0.0; run \`npm install
  --package-lock-only --ignore-scripts\` and commit package-lock.json`.
- Validation accepted by the Navigator, 2026-11-02, on that evidence.

### Debt review

- The doctor and `packageLock.test.ts` make the same four comparisons in two places; the
  fix string is spelled in both. Two readers, one rule, neither importing the other: the
  doctor is maintainer tooling under `ts/scripts/`, the test a CI guard. Accepted.
- No other findings.

## Outcome

Done, 2026-11-02. A release commit that leaves `package-lock.json` behind fails the doctor
before anything is tagged, with the command that fixes it. On `main` at `c23f5245`.
