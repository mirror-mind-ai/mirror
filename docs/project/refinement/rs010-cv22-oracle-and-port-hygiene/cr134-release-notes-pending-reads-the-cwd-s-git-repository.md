[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR134 — `release-notes pending` reads the cwd's git repository, so it answers for whatever project the person is in

## Problem

`mirror runtime release-notes pending` lists the releases newer than the installed
version. The `mm-release-notes` skill uses it to answer "what's new in this update?",
which is the question the welcome card suggests when a new version is available.

The route builds it with `start: cwd` (`ts/src/frontDoor/runtimeRoute.ts`).
`buildPendingReleaseNotes` (`ts/src/runtime/releaseNotes.ts`) takes the git repository
that holds the cwd, runs `git fetch origin stable` in it, and reads
`origin/stable:docs/releases`. The branch beside it in the same route reads `latest` from
the running tree, "never from the cwd, which for a skill is the user's project". US3
plateau 1 (`422145c2`) moved that branch off the cwd and left `pending` on it.

So the answer depends on where the person happens to be, on every install kind:

- **Outside any git repository**, it says `Pending releases: none`, even when the channel
  holds a newer version.
- **Inside a Mirror Mind clone**, it reads that clone's `origin/stable`, which is right
  only by coincidence.
- **Inside any other git project**, it fetches `origin stable` from that project's remote,
  under the 120 s network timeout, and presents that project's `docs/releases` as
  Mirror's pending releases.

A package has no checkout at all, so there is no right answer for it today. The registry
knows which version the channel holds (`readDistTags` in
`ts/src/runtime/strategies/package.ts`, which `update --check` uses). The notes for that
version ship inside its tarball, though, not in the registry's metadata.

## Expected Behavior

- `pending` never reads the cwd's repository and never fetches into it.
- A clone reads the channel ref of its own checkout, the running tree, whatever the cwd.
- A package answers from a source it can reach without a checkout. This CR needs a
  decision on which: the channel's tarball from the registry, the published `stable`
  branch, or the pending version numbers without their notes.
- When no source answers, it says the check could not run, never `none`.
- Tests pin it from a cwd outside any repository and from a cwd in an unrelated
  repository that has its own `origin/stable` and `docs/releases`. Neither changes the
  answer.

## Impact

Medium: the update question gets a wrong answer in nearly every real session. A runtime
session runs in the person's project, not in a Mirror Mind clone. A package, the default
install since US3, has no checkout at all. The usual wrong answer is `none`. The rare one
is another project's notes presented as Mirror's. Each call also fetches from that
project's remote. The update itself is unaffected, and nothing is at risk.

## Plan Or Decision

Captured, unassigned, after the `v0.33.0` update of a Homebrew install (2026-10-14), beside
[CR133](cr133-release-notes-reads-the-git-repository-above-the-package.md). Current Focus
unchanged. The package source needs a decision before there is a plan.

Selected 2026-10-15. Selection found one thing the capture did not say: `--ref` can run
a command through `git fetch` ([evidence at selection](#at-selection-2026-10-15)). The
Navigator took all four decisions as recommended, and the plan was reviewed by a
four-lens panel the same day ([record below](#panel-review-2026-10-15)), its findings
folded in. **Approved 2026-10-15 by the Navigator.** Driver `@viniciusteles` and Delivery
`main` were assigned in the same turn. Implemented 2026-10-15
([evidence](#implementation-and-the-drivers-checks-2026-10-15)) and **validated by the
Navigator 2026-10-15** ([record](#navigator-validation-2026-10-15)), on a second run of
a corrected route.

### Objective

`release-notes pending` answers for the install that is running, from any directory:
a clone from its own checkout's channel ref, a package from the registry, the version
its channel resolves to. When no source answers, it says so; it never says `none` for
"could not tell", and it never reads, fetches into, or runs anything in the cwd's
repository.

### Design

**The install chooses the source.** The route detects the install as `runtime
channel` and the welcome card do (CR135), with nothing spawned, and the cwd plays no
part:

- a **clone** reads `docs/releases` from a ref in `install.repository`. The ref is
  `--ref` when given, else `origin/<channel>` for the clone's own channel, the ref
  `runtime update` follows. Today it is `origin/stable` whatever the channel; this
  checkout follows `main`, so here it will read `origin/main`;
- a **package** asks the registry the question `runtime update` asks at plan:
  `channelDirection` resolves its channel's dist-tag to a concrete version. When that
  version is ahead of the installed one (or of `--from`), `npm pack
  <name>@<version> --ignore-scripts` fetches that exact tarball into a private
  temporary directory, and the notes newer than the installed version are read from
  its `package/docs/releases/v*.md` entries, in memory, then the directory is removed.
  When the channel is current or behind, nothing is downloaded and the answer is
  `none`. npm runs in `install.root`, never the cwd (CR135);
- an **unknown** install answers `unknown`, with the detector's reason.

**The tarball is read, not unpacked, and not past a bound.** A small reader over
`node:zlib` inflates the gzip stream, walks the tar headers by size, and keeps only
entries named `package/docs/releases/vX.Y.Z.md`. Nothing is written but the tarball
itself, so no entry name can choose a path. The registry is a trust boundary (CR135: a
project's `.npmrc` can name it), so the tarball is attacker-shaped input: the reader
stops at 64 MB of inflated bytes and the answer is `unknown`. The real tarball inflates
to 3 MB. No dependency is added, and `tar` is not spawned: a spawned `tar` would take
archive-chosen member names as arguments, a second seam of the same kind, and its
option parsing is not under test here. The parser has one input and one cap.

**`unknown` is its own answer.** When no source answers, the bundle says
`Pending releases: unknown` and a `Reason:` line, the shape `runtime update --check`
gives `unresolved`. The reasons are a failed fetch (decision 2), a ref that does not
resolve, a dist-tag that does not resolve, a `npm pack` that fails, an unknown install,
and a package asked to read offline. A ref that resolves and holds no newer note is
`none`, as today.

**What each flag means per install.** `--from` keeps its meaning on both. On a clone,
`--ref` and `--no-fetch` keep theirs. On a package, `--no-fetch` answers `unknown`: a
package keeps no copy of its channel to read offline. `--ref` names a git ref, and a
package has none, so it is refused as a usage error with exit 2.

**The ref stays an operand** (decision 4). `fetch`, `ls-tree`, and `show` take
`--end-of-options` before the ref and the remote, and a ref that begins with `-` is
refused before git runs.

**`repositoryFor` goes.** Its last callers were the ref readers, and the repository
is now the install's, given. No git call remains to discover a repository; CR133's
security note applies here too.

**Tests do not depend on the checkout's refs.** CI's checkout is shallow, so a test
that reads the real checkout's `origin/stable` would answer `unknown` there. The pending
tests run the route in-process, with the install and the npm runner injected, as the
welcome route's tests do.

### Decisions

1. **The package's source.** (a) *Recommended:* the registry tarball of the exact
   version the channel resolves to. It is the same registry, resolution, and `.npmrc`
   trust rule as `runtime update`, so the notes are the ones the update would install.
   It costs one tarball, about 0.9 MB and 1 s, only when an update exists
   ([measured](#at-selection-2026-10-15)). (b) The published git branch: a second
   authority that can disagree with the dist-tag, as a half-promoted release does
   (CR132), and it needs git and the repository's URL on a package install. (c) The
   pending version numbers without their notes: the cheapest answer, but it does not
   answer the skill's question, "what's new in this update?".
2. **A clone whose fetch fails.** (a) *Recommended:* `unknown`, with the fetch's first
   error line. `--no-fetch` is the explicit way to read the last fetched ref. (b) Read
   the stale ref and add a note. Today the failure is swallowed, and an offline clone
   says `none` with confidence.
3. **Exit code for `unknown`.** (a) *Recommended:* 1, as `update --check` exits on
   `unresolved`; `none` and a list stay 0. (b) 0, as today. The skill shows the output
   either way.
4. **The `--ref` command execution.** (a) *Recommended:* fix it in this CR, since the
   plan rewrites this fetch and the test that falsely pins it. The test gets a
   relative marker, the case the split leaves whole. (b) Capture it as its own CR and
   keep this one to the cwd. It is local and self-inflicted: whoever can pass `--ref`
   can already run commands. But the test that says it cannot happen is wrong.

All four were taken as recommended, 2026-10-15.

### Files

- `ts/src/runtime/releaseNotes.ts`: the ref source takes the repository it is given;
  `repositoryFor` is removed; the fetch result is read (decision 2); the bundle gains
  `unknown` with a reason; the registry source; `--end-of-options` and the ref refusal
  (decision 4).
- `ts/src/util/tarEntries.ts` (new): the in-memory reader of named tar.gz entries.
- `ts/src/runtime/strategies/package.ts`: `packTarball`, beside `installGlobal`, so
  every npm call still lives in one place and runs in the install's root.
- `ts/src/frontDoor/runtimeRoute.ts`: `pending` chooses its source by install kind,
  with no `cwd`; the read route's io gains the `install` and `npm` seams the welcome
  route has; the exit code (decision 3); the usage refusal for `--ref` on a package.
- `ts/test/runtime/releaseNotes.test.ts`: the unknown-ref and option-shaped-ref cases
  follow the new answers; the relative-marker case (decision 4).
- `ts/test/goldens/release-notes.golden.json`: `unknown_ref.pending_render` advances
  from `none` to `unknown`. The advance is named in its commit, since the oracle that
  generated it is gone (CR086's rule).
- `ts/test/util/tarEntries.test.ts` (new): archives built by the system's own `tar`
  (bsdtar on macOS, GNU tar on the ubuntu runner), with a path over 100 characters
  before the note, a non-note entry, and a truncated archive.
- `ts/test/frontDoor/pendingReleaseNotes.test.ts` (new): the route, in-process, for a
  clone and a package. It runs from a cwd outside any repository and from a cwd in an
  unrelated repository with its own `origin/stable` holding `v9.9.9`, and neither
  changes the answer. The clone case fetches, against the fixture's bare remote, and
  asserts the unrelated repository has no `.git/FETCH_HEAD` afterwards while the
  install's clone does: not read, and not fetched into. The fake npm runner asserts
  the `cwd` of every call is `install.root`, the dist-tag read and the pack alike.
  Also the unknown install, `--no-fetch` and `--ref` on a package, the current and
  behind channels, which download nothing, and a tarball past the bound.
- `ts/test/frontDoor/runtimeTailCli.test.ts`: the positional test stops asserting
  exit 0 for `pending`, which now depends on the checkout's refs. It keeps asserting
  that the bundle was chosen.
- `scripts/smoke_npm_package.sh`: an `npm` stub beside the interpreter stubs, exiting
  66, so the answer does not depend on the runner's PATH; `release-notes pending` from
  the installed package answers `unknown` with exit 1 and a `Reason:` that names npm,
  never `none`.
- `REFERENCE.md`: the Release notes section says where each install reads from.

### Acceptance

- `pending` reads no repository and runs no git command in the cwd, on every install
  kind. The two-cwd tests give byte-identical output for a clone and for a package.
- A clone reads `origin/<its channel>` in its own repository, or `--ref`.
- A package whose channel is ahead lists the notes newer than the installed version,
  read from the channel version's tarball. A current or behind channel answers `none`
  without downloading. Every npm call runs in `install.root`.
- No source, or a failed fetch, answers `Pending releases: unknown` with a reason and
  exit 1. A ref that resolves with no newer note answers `none` with exit 0.
- `--ref '--upload-pack=touch <relative marker>/x'` creates nothing and runs nothing.
- The golden changes in exactly one entry, `unknown_ref.pending_render`.
- `latest` and `vX.Y.Z` are unchanged.

### Validation Route

Driver's checks: the new and changed tests red first where the behavior changes, then
`npm test`, typecheck, lint, the guards, and both smokes green.

Navigator's route, in your own shell. The clone steps name this checkout's front door,
`M=~/dev/workspace/mirror-dev/bin/mirror.js`, never a bare `mirror`: on this machine a
bare `mirror` in an interactive shell is the Homebrew package, the released code
(corrected after [the first run](#navigator-validation-2026-10-15)).

0. **Which install answers.** `"$M" runtime version` prints `Install: clone
   (<this checkout>)`. Fail: `Install: package`, which is not the code under test.
1. **The clone, from anywhere.** From `/tmp`, then from a scratch git project whose
   `origin` has a `stable` branch with `docs/releases/v9.9.9.md`, run `"$M" runtime
   release-notes pending --from 0.32.1 --no-fetch`. Pass: both print the same block,
   `Source: origin/main` (this checkout's channel), listing `v0.33.0`. Fail: the two
   blocks differ, `v9.9.9` appears, or the scratch project gains a `.git/FETCH_HEAD`
   after a run without `--no-fetch`.
2. **The package, against the live registry.** Pack this checkout and install it into
   a scratch prefix, with a scratch `XDG_CONFIG_HOME` so the channel is `stable`
   whatever this machine's config says (commands given at handoff). From `/tmp` run its
   `mirror runtime release-notes pending --from 0.32.1`. Pass: `Source:` names the npm
   channel and `0.33.0`, and `v0.33.0` is listed; without `--from`, `Pending releases:
   none`. Fail: `unknown`, or a note the registry's `0.33.0` does not hold.
3. **Unknown is said.** The scratch package with `--no-fetch`, and the clone (`"$M"`)
   with `--ref origin/nope --no-fetch`. Pass: `Pending releases: unknown`, a `Reason:`,
   and exit 1. Fail: `none`, or exit 0.
4. **The ref stays an operand** (decision 4). From a scratch directory, run `"$M"
   runtime release-notes pending --ref '--upload-pack=touch PWNED/x'`. Pass: the answer
   is `unknown` with the refusal as its reason, and no `PWNED` or `x` appears here or in
   the checkout. Fail: either file exists.

### Non-Goals

- `runtime status` and `runtime version` reading a clone's repository and channel from
  the cwd: [CR138](cr138-runtime-status-and-version-read-a-clone-s-repository-and-channel-from-the-cwd.md).
- `latest` and `vX.Y.Z`: CR133, done.
- The `mm-release-notes` skill's wording: it still says "the current stable release",
  which stays true on the default channel. Changing it moves every runtime's copy.
- Bounds on npm: `pending` keeps npm's own timeouts and retries, as `update --check`
  does. The welcome card's 5 s budget is for session start, which `pending` is not.
- Reading offline from npm's cache on a package. `npm pack` does add the tarball to
  that cache, about 1 MB per check that finds an update; that is npm's cache doing its
  job, not a leak.
- A `--channel` option on `pending`, which `update --check` and `version` have. A
  package on `main` answers `unknown` ("no dist-tag 'main'"), as `update --check`
  does; asking "and on stable?" means `runtime channel stable` first. Named so it is a
  choice, not an accident.

### Panel review (2026-10-15)

The Navigator asked which lenses fit and had them review. The engineer,
security-engineer, quality-assurance, and devops-engineer lenses reviewed the Driver's
draft, each testing its claims against the code, git, npm, and scratch directories.
Only dissent was recorded.

Synthesis: the plan's shape holds. One blocker, from the security lens: the tarball is
input from a trust boundary and the reader had no bound. The tar parser stays, for the
reason that lens gave. The rest is pins the tests were missing, one stub that makes the
smoke deterministic, and a validation route that does not depend on this machine's
config.

| Lens | Dissent | Resolution |
|---|---|---|
| engineer | Every supported platform ships `tar`, and `tar -tzf` plus `tar -xzOf <tgz> <member>` reads a member to stdout in ten lines, no parser. Say why a parser instead of a tool already trusted as git is. And `pending` has no `--channel` where `update --check` and `version` do; a package on `main` cannot ask about `stable` without rewriting its channel file | The parser stays: a spawned `tar` takes archive-chosen member names as arguments, a second seam at the same trust boundary, and its option parsing is not under test here (security lens). The reason is now in Design. `--channel` is a named non-goal |
| security-engineer | **Blocker.** The reader inflated the gzip stream with no bound. The registry is a trust boundary this project named in CR135, so a 1 MB tarball that inflates to gigabytes is a denial of service from one `.npmrc` line. `--end-of-options` on all three verbs confirmed by measurement: git refuses the option-shaped ref itself (`strange pathname … blocked`) | A 64 MB cap on inflated bytes, past which the answer is `unknown`; a test feeds a tarball past it. The `-`-prefix refusal stays beside `--end-of-options`, so the refusal and its message are ours. `--ignore-scripts` stays as belt and braces |
| quality-assurance | The two-cwd test proved the cwd's repository is not read, not that it is not fetched into. The fake npm never asserted its `cwd`. Step 2 read the channel from this machine's real config file, absent today, so `stable` by luck. Steps 1 and 3 named no fail condition | The clone case fetches against the fixture's bare remote and asserts `FETCH_HEAD` in the install's clone and not in the unrelated repository. The fake npm asserts `cwd === install.root` on every call. Step 2 runs with a scratch `XDG_CONFIG_HOME`. Every step names its fail |
| devops-engineer | The smoke assumed npm off its PATH, true on this Mac and by the ubuntu image's layout, but unasserted: a runner with npm in `/usr/bin` would reach the live registry and the smoke would go nondeterministic silently. `npm pack` also fills npm's cache, about 1 MB per found update | An `npm` stub beside the interpreter stubs, exiting 66, and the check asserts the `Reason:` names npm; the answer is the same on every machine and a reached npm is caught. The cache is a named non-goal |

Not asked:

- the database-architect, ai-engineer, and prompt-engineer: the slice has no data,
  model, or prompt;
- the product and experience designers: the bundle's shape gains one line, `Reason:`,
  in the shape `update --check` already uses.

## Evidence

All on the Homebrew package `mirror-mind@0.33.0`, where `v0.33.0` is newer than `0.32.1`:

```text
$ cd /tmp
$ mirror runtime release-notes pending --from 0.32.1 --no-fetch
Mirror runtime release notes

Current version: v0.32.1
Source: origin/stable
Pending releases: none

$ cd <a Mirror Mind clone>
$ mirror runtime release-notes pending --from 0.32.1 --no-fetch
Mirror runtime release notes

Current version: v0.32.1
Source: origin/stable
Pending releases: 1
```

A scratch git project whose `origin` has a `stable` branch holding
`docs/releases/v9.9.9.md`:

```text
$ cd <the scratch project>
$ mirror runtime release-notes pending
Mirror runtime release notes

Current version: v0.33.0
Source: origin/stable
Pending releases: 1

## v9.9.9 — Not Mirror
Highlights:
- A release of some other project.
```

A clone shows the same split. With a scratch `MIRROR_HOME`, the clone's own front door
(`node bin/mirror.js runtime release-notes pending --from 0.32.1 --no-fetch`) says `none`
from `/tmp` and `1` from the clone.

### At selection (2026-10-15)

**The registry**, read from a scratch directory:

- `npm view mirror-mind dist-tags`: `latest` and `stable` are both `0.33.0`, and there
  is no `main` tag. A package on `main` answers `unknown` by any route, as `update
  --check` does.
- `npm pack mirror-mind@stable --ignore-scripts`: 919,831 bytes and 475 entries, all
  regular files, in about 1 s. 76 of them are `package/docs/releases/v*.md`.

**This checkout** follows `main` (`.mirror-update-channel`), so the channel default
makes its `pending` read `origin/main` where today it reads `origin/stable`.

**`--ref` reaches `git fetch` as an option.** `fetchReleaseNotesRef` splits the ref at
its first slash into a remote and a branch, and passes both to `git fetch` as argv. In
a scratch repository, these two calls each ran their command through git's
`upload-pack`:

```text
fetchReleaseNotesRef("--upload-pack=touch PWNED-BY-REF/x", <repo>)
fetchReleaseNotesRef("--upload-pack=touch /x", <repo>)

-> <repo>/PWNED-BY-REF and <repo>/x were created
```

The test "a ref shaped like a git option cannot become one" passes because its marker
is absolute: the split cuts it at the leading `/`, and `touch` gets a relative path
whose directory does not exist. Today the command runs in the cwd's repository; with
the repository fixed, it would run in the install's.

### Implementation and the Driver's checks (2026-10-15)

What is now true, at `29fe689f`:

- The route's `pending` branch chooses its source by install kind, and nothing in it
  reads the cwd. A clone reads `--ref` or `origin/<its channel>` in
  `install.repository`; a package goes to the registry; an unknown install answers
  `unknown` with the detector's reason. The read route takes the welcome route's seams,
  now named `InstallRouteIo`; `WelcomeRouteIo` is an alias of it.
- `buildPendingReleaseNotes` takes the repository as given. `repositoryFor` is gone.
  A failed fetch is `unknown` with git's first error line, and a ref that does not
  resolve is `unknown` too; `none` is left for a ref that resolves with nothing newer.
- `buildPendingReleaseNotesFromRegistry` resolves the channel with `channelDirection`,
  and when it is ahead calls `packTarball` (`npm pack <name>@<version>
  --pack-destination <private dir> --ignore-scripts --json`, in `install.root`), reads
  `package/docs/releases/v*.md` with `readTarGzEntries`, and removes the directory.
- `readTarGzEntries` (`ts/src/util/tarEntries.ts`) inflates with `maxOutputLength` set
  to 64 MB, checks every header's checksum, reads ustar `prefix`, pax `path`, and GNU
  `L` names, and refuses a truncated archive.
- A ref beginning with `-` is refused before git runs, and `fetch`, `ls-tree`, and `show`
  take `--end-of-options`.
- `unknown` renders as `Pending releases: unknown` and a `Reason:` line, and exits 1;
  `--ref` on a package exits 2 with a usage line on stderr.
- The package smoke shadows npm with a stub after its install and checks that
  `pending` from the package names `npm mirror-mind@stable`, says `unknown`, gives the
  stub's line as its reason, and exits 1. `REFERENCE.md` says where each install reads.

Three choices the plan did not spell out, recorded so they can be checked:

1. **A package's default `--from` is the install's own manifest version.** For a real
   package it is the same file as the running tree's; in tests the install is injected,
   and the route takes the install's word.
2. **The compressed tarball is bounded too.** It is read whole before it is inflated, so
   a file larger than 64 MB on disk is refused before it is read.
3. **One smoke label changed.** "status names the install (no npm on this PATH)" became
   "(npm a stub on this PATH)", since the stub made the old label false. The check
   itself is unchanged.

Red first, on the unchanged source (the tests and the smoke changed, the source not):

- `tarEntries.test.ts` did not load: the module did not exist.
- `pendingReleaseNotes.test.ts`: 12 of 12 failed. The first reproduces the capture:
  from a plain directory the old route said `Pending releases: none`; from the
  unrelated project, `Pending releases: 1` and `## v9.9.9 — Not Mirror`.
- `releaseNotes.test.ts`: 3 failed. Two because the builder's `start` became
  `repository`, which the old builder resolved as an undefined path. The third is the
  option-shaped-ref test, which got no `unknown_reason`.
- The old fetch, probed directly: `origin/--upload-pack=touch PWNED-AFTER-SLASH` created
  `PWNED-AFTER-SLASH` in the repository. The half after the slash does not begin with
  `-`, so the refusal alone would not stop it; `--end-of-options` is the measure that
  does.
- The package smoke: 71 passed, 4 failed, in 7 s. A package answered `Source:
  origin/stable`, `Pending releases: none`, exit 0. With the npm stub in place, the 71
  existing checks stayed green.

Green, at `29fe689f`:

- `tarEntries.test.ts` 6 of 6. On this Mac, bsdtar writes pax `x` headers even where
  the ustar prefix would fit, so the pax path is the one met here; GNU tar on the
  ubuntu runner writes `L`.
- `pendingReleaseNotes.test.ts` 12 of 12, `releaseNotes.test.ts` 6 of 6,
  `runtimeTailCli.test.ts` 17 of 17.
- `npm test`: 3,201 tests, 3,198 pass, 0 fail, 3 skipped, the machine-dependent ones.
- The package smoke: 75 passed, 0 failed, in 7 s. The updater smoke, with `MIRROR_USER`
  unset: 103 passed, 0 failed, in 24 s.
- `release-notes.golden.json` changes in one entry, `unknown_ref.pending_render`.
- Typecheck, lint (653 files), the retired-surface tripwire, the pack guard (477 files,
  the reader among them), the doc-link check, skill command parity, `git diff --check`,
  and `bash -n` on the smoke are clean.

The Driver ran the [validation route](#validation-route) as written:

- **Step 1.** From `/tmp`, and from a scratch project whose `origin/stable` holds
  `v9.9.9`: byte-identical blocks, `Source: origin/main`, `Pending releases: 1`, `## v0.33.0
  — One Plugin, Three Runtimes`. A run that fetched, from the project, left no
  `FETCH_HEAD` there.
- **Step 2.** This tree packed and installed into a scratch prefix, run from `/tmp` with
  a scratch `XDG_CONFIG_HOME`, against the live registry: `--from 0.32.1` read `Source:
  npm mirror-mind@stable (0.33.0)`, `Pending releases: 1`, `## v0.33.0 — One Plugin,
  Three Runtimes`, in 2 s. `--from 0.31.14` listed `v0.32.0`, `v0.32.1`, and `v0.33.0`,
  in that order. With no `--from`: `Pending releases: none`. No
  `mirror-release-notes-*` directory was left in the temp directory.
- **Step 3.** The scratch package with `--no-fetch`, and the clone with `--ref
  origin/nope --no-fetch`: `Pending releases: unknown`, a `Reason:`, exit 1. `--ref` on
  the package: the usage line, exit 2.
- **Step 4.** `--ref '--upload-pack=touch PWNED/x'` was refused before git ran, and
  `--ref 'origin/--upload-pack=touch PWNED'` answered `fetch failed: fatal: invalid
  refspec '--upload-pack=touch PWNED'`. Nothing was created in the scratch directory or
  the checkout.

Limitations: run on macOS only, so GNU tar's `L` entries are first met by CI on ubuntu,
at the next push. On this checkout, which follows `main`, the default source moved from
`origin/stable` to `origin/main`, as planned.

### Navigator validation (2026-10-15)

**First run, 18:52 to 18:55: the route tested the wrong install for three steps.** It
named a bare `mirror`. In the Navigator's interactive zsh that resolves first to
`/opt/homebrew/bin/mirror`, the released `mirror-mind@0.33.0` from the registry, which
carries neither CR133 nor CR134. The Driver's tool environment resolves
`~/.local/mirror-dev/bin/mirror`, this checkout, first, so the Driver's run of the same
route did not show it. `runtime version` cannot tell the two apart (both are `0.33.0`);
its `Install:` line can.

- **Steps 2 and 3, package half: passed**, on the scratch install of this tree.
  `--from 0.32.1` read `Source: npm mirror-mind@stable (0.33.0)`, `Pending releases: 1`,
  `## v0.33.0 — One Plugin, Three Runtimes`, with its digest and highlights. Without
  `--from`, `Pending releases: none`. With `--no-fetch`, `Pending releases: unknown`, the
  offline reason, and `exit=1`.
- **Steps 1, 3 (clone half), and 4 ran the Homebrew release**, and reproduced the
  defect on it. From `/tmp`, `Source: origin/stable` and `Pending releases: none`. From
  the scratch project, a block that differed from the `/tmp` one at line 5. A run
  without `--no-fetch` left `.git/FETCH_HEAD` in the scratch project. `--ref origin/nope
  --no-fetch` and `--ref '--upload-pack=touch PWNED/x'` both said `none` with `exit=0`.
  No `PWNED` or `x` appeared, since the scratch directory is no repository. These three
  steps validate nothing about CR134. Running both binaries side by side reproduced the
  split: `/opt/homebrew/bin/mirror` answered `none`, exit 0, and
  `~/.local/mirror-dev/bin/mirror` answered `unknown`, exit 1.

The route now names the checkout's front door for the clone steps and adds step 0,
which shows the install that answers. Steps 0, 1, 3 (clone half), and 4 are to be run
again.

**Second run, 19:00 to 19:02, the route as corrected in `7d79c761`.** Before it, the
`FETCH_HEAD` the Homebrew release had left in the scratch project was removed.

- **Step 0.** `Install: clone (/Users/vinicius/dev/workspace/mirror-dev)`.
- **Step 1.** From `/tmp`: `Current version: v0.32.1`, `Source: origin/main`, `Pending
  releases: 1`, `## v0.33.0 — One Plugin, Three Runtimes`. From the scratch project:
  `SAME`. A run without `--no-fetch`, from the project, left no `.git/FETCH_HEAD` there.
- **Step 3, clone half.** `--ref origin/nope --no-fetch`: `Pending releases: unknown`,
  `Reason: ref origin/nope does not resolve`, `exit=1`.
- **Step 4.** `--ref '--upload-pack=touch PWNED/x'`: `Reason: ref "--upload-pack=touch
  PWNED/x" begins with '-' and is refused`, `exit=1`. The form the handoff added, the
  one only `--end-of-options` stops, `--ref 'origin/--upload-pack=touch PWNED'`:
  `Reason: fetch failed: fatal: invalid refspec '--upload-pack=touch PWNED'`, `exit=1`.
  No `PWNED` or `x` in the scratch directory or the checkout.

**Validation recorded 2026-10-15.** With steps 2 and 3 (package half) from the first
run, every step of the route has passed on the code under test. The Navigator returned
the second run with every pass condition met, in reply to the stated next step: on a
pass, CR134 moves to `validated` and the review is drafted.

## Review

Drafted for closure 2026-10-15. The terminal decision is the Navigator's.

**Proportionality.** 466 product lines added and 63 removed, across four files, with
682 lines of tests and smoke. They fix a defect with three faces: `pending` answered for
whatever project the person was in, a package had no true answer at all, and `--ref`
could run a command through `git fetch`. The largest new piece is the tar reader, 124
lines with its comments. It replaces neither a dependency nor a spawned `tar` by
accident: the panel chose it so that no archive-chosen name becomes an argument, and so
the bound sits in one place. Most of the test lines are the route test, whose every case
runs from two directories, the property this CR exists for.

**Scope discipline.** The change touched the plan's files and no other. It made three
choices the plan had not spelled out, recorded with the evidence: the package's default
`--from`, a bound on the compressed tarball as well, and one smoke label. The
validation route was corrected once, after the Navigator's first run met the Homebrew
release. Nothing was captured.

**A lesson for routes, not product debt.** On a machine that has both a package install
and a linked checkout, a bare `mirror` in a validation route tests whichever comes first
on the Navigator's PATH, and the Driver's environment may differ. `runtime version`
shows the same version for both. A route that tests a checkout names its front door and
shows the `Install:` line first, as this one does now.

**Debt: none carried.** For the Navigator to accept at closure:

1. Run on macOS only. GNU tar's `L` entries in the tar reader's test, and the package
   smoke's npm stub, are first met by CI on ubuntu at the next push to `main`.
2. The Homebrew install runs the released code, where the defect is live, as the first
   run showed, until a release carries CR134. That is the Outcome's to observe.

## Outcome

Pending.
