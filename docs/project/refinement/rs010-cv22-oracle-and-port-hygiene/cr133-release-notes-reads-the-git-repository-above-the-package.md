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

Selected 2026-10-15. The plan below was reviewed by a four-lens panel the same day
([record below](#panel-review-2026-10-15)), and its findings are folded in.
**Approved 2026-10-15 by the Navigator.** Driver `@viniciusteles` and Delivery `main` were
assigned in the same turn. Implemented 2026-10-15 and **validated by the Navigator
2026-10-15** ([record](#navigator-validation-2026-10-15)).

### Objective

`release-notes latest` and `release-notes vX.Y.Z` answer from the tree that holds the
running front door, on every install kind, with no git call. The route already passes
that tree (US3 plateau 1); the reader stops climbing out of it.

### Design

**The working-tree reader reads where it is pointed.** `readReleaseNotes(start)` lists
`<resolve(start)>/docs/releases` and nothing else. `repositoryFor` is no longer on its
path. This is the shape the welcome card already has for the same notes
(`ts/src/welcome/card.ts`, `<treeRoot>/docs/releases/<version>.md`, CV22.DS10.US3): one
file read under the running tree.

**The ref readers keep `repositoryFor`.** `readReleaseNotesFromRef`,
`readReleaseNoteFromRef`, and `buildPendingReleaseNotes` run `ls-tree`, `show`, and
`fetch`, which need a repository to run in, and today that repository is found by
climbing from the cwd. Which repository `pending` should ask is
[CR134](cr134-release-notes-pending-reads-the-cwd-s-git-repository.md)'s decision;
this change does not touch it.

**The test pins the reader.** A temporary directory with `git init` and no
`docs/releases` of its own holds, in a subdirectory, a package tree with
`docs/releases/v0.1.0.md`. `readReleaseNotes(<package tree>)` finds the note and
`readReleaseNote("latest", <package tree>)` returns it. No commit is needed:
`rev-parse --show-toplevel` answers in an empty repository (measured at selection).
Before the change the reader asks git, is sent to `<repository>/docs/releases`, which
does not exist, and gets `[]`: red first. The same test is the proof that no git call
remains, since any reader that climbed would miss the note; the plan promises nothing
about git that this test cannot see.

**The smoke pins the install kind.** `scripts/smoke_npm_package.sh` installs the packed
tarball into `$WORK/prefix`, under `/tmp` or `$RUNNER_TEMP`, neither inside a git work
tree, so today it cannot meet this bug. One `git init -q "$WORK"` before the install
puts the scratch prefix in the Homebrew geometry, and one check, `mirror runtime
release-notes latest` containing `Release: v<version>`, keeps it there. `git` is already
on the smoke's PATH.

**One spawn fewer.** The reader today runs `git` with the config of whatever repository
sits above the install, on the failing machine Homebrew's own. `rev-parse` runs no hooks,
so this was never an exploit, but a reader that consults no ancestor's `.git/config` is
strictly less surface, and that is a second reason not to put git back here.

**One core.** The Python oracle this module was ported from is gone, so there is no
second side to reconcile and no golden to advance. The existing golden tests read from
the fixture clone's root, where the climb and the tree root agree, so their expectations
are unchanged; a changed golden here would mean the change went wider than planned.

### Files

- `ts/src/runtime/releaseNotes.ts`: `readReleaseNotes` uses `resolve(start)` directly.
  The header comment stops saying the working tree answers "what does this checkout
  contain": it answers what the tree it is given contains, and only the ref source
  shells out to git.
- `ts/test/runtime/releaseNotes.test.ts`: the nested-package test above, using the
  file's existing `git` helper and `GIT_ENV`.
- `scripts/smoke_npm_package.sh`: `git init -q "$WORK"` before the install, and the
  `release-notes latest` check in the package's section.

Not edited: `ts/src/runtime/treeRoot.ts`, whose header already describes the climb in
the past tense; it becomes true.

### Acceptance

- `mirror runtime release-notes v0.33.0` and `release-notes latest` print the shipped
  note on a package installed under a prefix that is inside a git work tree.
- A checkout and an `npm link` install answer as they do today. Neither is pinned anew:
  Node resolves the link, so `runningTreeRoot()` is the clone either way, and the
  existing golden tests cover the clone.
- The new test fails on the current `readReleaseNotes` and passes after the change.
- The package smoke's prefix sits inside a git work tree and its `release-notes latest`
  check passes.
- The release-notes golden file is byte-identical before and after.
- `release-notes pending` is unchanged in behavior and in output.

### Validation Route

Driver's checks, recorded under Evidence:

- `npm test`, `npm run typecheck`, `npm run lint`, green.
- The new test run against the pre-change reader, shown red.
- `bash scripts/smoke_npm_package.sh`, green, with its new check shown red against the
  pre-change reader.
- `git diff --stat ts/test/goldens/release-notes.golden.json` empty.

Navigator's route, in two parts so the real install is never replaced by an unreleased
build:

1. Now, the geometry: `bash scripts/smoke_npm_package.sh` on this machine. Pass: the
   check `git names the prefix as the package's repository, as under Homebrew` and
   the two `release-notes latest` checks are `✓`, and the result reads `failed: 0`.
   Fail: either release-notes check is `✗`, its output `Release notes: not found`.
   (Corrected at implementation: the prefix itself is the repository, not `$WORK`;
   see [the departures](#implementation-and-the-drivers-checks-2026-10-15).)
2. Now, the unchanged half: `mirror runtime release-notes pending --no-fetch`, from a
   Mirror Mind clone, answers as before the change: `Current version:`, `Source:
   origin/stable`, and a `Pending releases:` line.
3. After the release that carries this change: `mirror runtime update` on the Homebrew
   install, `mirror runtime version` to confirm it, then `mirror runtime release-notes
   latest` and `mirror runtime release-notes v0.33.0` print `Release: ...` with a
   `Path:` under `/opt/homebrew/lib/node_modules/mirror-mind/`. This step closes the
   Outcome, not the validation.

### Non-Goals

- Where `release-notes pending` finds its repository: CR134.
- What the welcome card reads: done under CR135 and US3.
- Removing `repositoryFor` or the `runGit` import from the module: both remain in use
  by the ref readers until CR134 decides otherwise.
- The `Path:` line's shape in the rendered note, which prints the absolute path of
  the file found. It is unchanged.

### Panel review (2026-10-15)

The Navigator asked which lenses fit and had them review. The engineer,
quality-assurance, devops-engineer, and security-engineer lenses reviewed the Driver's
draft, each testing its claims against the code, a scratch repository, and the smoke.
Only dissent was recorded.

Synthesis: the plan's shape holds; no blocker. Its gap was that the install kind that
failed was pinned only by a unit test that simulates it, while the one script that
performs a package install sits where the bug cannot occur. The plan succeeds if a
package under a git work tree prints its notes, the smoke would go red if the climb came
back, and the Navigator's real install is touched only by a release.

| Lens | Dissent | Resolution |
|---|---|---|
| engineer | The header rewording was promised without saying what it must stop saying. `treeRoot.ts` was listed under Files as "no edit expected"; a file not edited is not an affected file | Files names the sentence that goes. `treeRoot.ts` moved to a "not edited" note |
| quality-assurance | The test's enclosing repository "with a commit" states a premise that is false: `rev-parse --show-toplevel` answers after a bare `git init` (measured). Acceptance promised "no git call", which nothing in the plan can observe, `runGit` not being injectable. The route's "local `npm install -g` of the built package" would replace the Homebrew install with an unreleased build, with no way back named | The commit is dropped. The test is named as the proof: a reader that climbed would miss the note. The route is split: geometry now through the smoke, the real install after the release |
| devops-engineer | The package smoke installs into a prefix under `/tmp` or `$RUNNER_TEMP`, outside any git work tree, so CI stays green on today's code and on a regression. `git init -q "$WORK"` plus one `release-notes latest` check makes the smoke the durable pin; `git` is already on its PATH | Both added to Files, Acceptance, and the Driver's checks. The smoke is also the Navigator's step 1 |
| security-engineer | No dissent. The reader spawned `git` with the config of an untrusted ancestor repository; `rev-parse` runs no hooks, so not an exploit, but the removal is a strict reduction in surface and should be recorded so git is not put back here later | One paragraph in Design |

Not asked:

- the database-architect, ai-engineer, and prompt-engineer: the slice has no data,
  model, or prompt;
- the product and experience designers: the rendered note does not change.

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

### At selection (2026-10-15)

- The test's premise, measured in a scratch directory: after a bare `git init`, with
  no commit, `git rev-parse --show-toplevel` from a nested package tree names the
  enclosing directory, and `readReleaseNotes(<package tree>)` returned `[]`.
- `/tmp`, where the package smoke installs by default, is inside no git work tree
  (`fatal: not a git repository`), so the smoke could not meet this bug.

### Implementation and the Driver's checks (2026-10-15)

What is now true, at `471ddb5b`:

- `readReleaseNotes(root)` reads `<resolve(root)>/docs/releases`, with no git call;
  `readReleaseNote` takes the same root. The module header says the tree source reads
  files under the root it is given, and only the ref source shells out to git.
- `repositoryFor` and the three ref readers are unchanged.
- `releaseNotes.test.ts` holds the nested-package test: a `git init`ed prefix with no
  notes, holding `lib/node_modules/mirror-mind/docs/releases/v0.1.0.md`. It asserts
  the Homebrew shape first (git names the prefix), then that `readReleaseNotes`,
  `readReleaseNote("latest")`, and `readReleaseNote("v0.1.0")` find the package's note.
- `smoke_npm_package.sh` initializes its scratch prefix as a repository before the
  install, checks that git names the prefix from the installed package, and, after
  `runtime status`, checks that `release-notes latest` prints a `Release: v` line and
  a `Path:` under the installed package's `docs/releases`.

Two departures from the plan's wording, both narrower than it:

1. **`git init` runs on `$WORK/prefix`, not `$WORK`.** On Homebrew the prefix *is* the
   repository (`/opt/homebrew`), so this is the exact shape. It also leaves the smoke's
   cwd, `$WORK/home`, outside any repository, so no other check's premise moved: the
   other 69 checks passed on the red run as before.
2. **The smoke asserts a `Path:` under the package, not `Release: v<version>`.** A
   commit on `main` may carry a version whose note is not written yet, which
   `release:doctor` checks at release time. The smoke pins where the reader reads,
   which is this CR's subject.

The Navigator's validation route, step 1, was corrected to match the first, before it
was run.

Red first, on the unchanged reader (the test and the smoke change applied, the source
not):

- `releaseNotes.test.ts`: the new test failed with `actual: []`, `expected:
  ['v0.1.0']`, after its Homebrew-shape assertion passed. The other five passed.
- The package smoke: 69 passed, 2 failed, in 7 s. The geometry check passed; both
  release-notes checks failed, the command printing `Release notes: not found`.

Green, at `471ddb5b`:

- `releaseNotes.test.ts`: 6 of 6.
- The package smoke: 71 passed, 0 failed, in 6 s.
- `npm test`: 3,183 tests, 3,180 pass, 0 fail, 3 skipped, the machine-dependent ones.
- `git diff` of `ts/test/goldens/release-notes.golden.json`: empty.
- Typecheck, lint (650 files), the retired-surface tripwire, the pack guard (476
  files), the doc-link check, skill command parity, `git diff --check`, and `bash -n`
  on the smoke are all clean.
- From this clone, through the linked `mirror` (`~/.local/mirror-dev/bin/mirror`, a
  link to this checkout's `bin/mirror.js`): `release-notes latest` prints `Release:
  v0.33.0 — One Plugin, Three Runtimes` with a `Path:` under the checkout, and
  `release-notes pending --no-fetch` prints `Current version: v0.33.0`, `Source:
  origin/stable`, `Pending releases: none`.

Limitations: run on macOS only; CI runs the package smoke on Linux. The Homebrew
install was not touched, by design: it is the route's step 3, after a release.

### Navigator validation (2026-10-15)

The Navigator ran the [validation route](#validation-route), steps 1 and 2, as corrected
at implementation, in their own shell at 17:17 and 17:18, from the checkout, on `main`
three commits ahead of `origin/main`.

- **Step 1.** The package smoke packed `mirror-mind-0.33.0.tgz` and ended `passed: 71
  failed: 0`. `git names the prefix as the package's repository, as under Homebrew`,
  `release-notes latest finds a note`, and `release-notes latest reads the package's
  own notes` were each `✓`.
- **Step 2.** `mirror runtime release-notes pending --no-fetch`, from the checkout,
  printed `Current version: v0.33.0`, `Source: origin/stable`, and `Pending releases:
  none`.

**Validation recorded 2026-10-15.** The Navigator returned the full run with every pass
condition met, in reply to the stated next step: on a pass, with the Navigator's
acceptance, CR133 moves to `validated`. Step 3 waits for a release and belongs to the
[Outcome](#outcome).

## Review

Drafted for closure 2026-10-15. The terminal decision is the Navigator's.

**Proportionality.** One line of behavior: the working-tree reader joins
`docs/releases` to the root it is given, not to the repository git names above it.
Around it, 29 lines of test, 11 of smoke, and the module's comments rewritten to say
which source asks git. That is small for a defect that hid every release note from a
common install. The smoke is the larger half of the value: before it, no check ran a
package where this could happen.

**Scope discipline.** The change touched the plan's three files and no other;
`treeRoot.ts` was left as planned. It made two departures from the plan's wording, both
narrower ([recorded](#implementation-and-the-drivers-checks-2026-10-15)), and one
correction of the validation route before the Navigator ran it. Nothing was captured.

**Debt: none carried.** For the Navigator to accept at closure:

1. `release-notes pending` still finds its repository by climbing from the cwd. That
   is [CR134](cr134-release-notes-pending-reads-the-cwd-s-git-repository.md), open and
   `captured`; this CR excluded it by plan.
2. The smoke's new checks have run on macOS only. CI runs the package smoke on ubuntu
   at the next push to `main`.
3. The Homebrew install itself is unobserved until a release carries the change: the
   route's step 3, for the Outcome to record.

## Outcome

Pending.
