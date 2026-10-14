[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR135 — The welcome card's update check asks the cwd's repository, not the install, and the status line keeps a stale verdict

## Problem

The welcome card announces a new version ("✨ New Version Available", then "Ask: what's
new in this update?"), and the status line shows `⬆` while the cached verdict says so.
Neither asks about the install that is running.

When its cache is older than six hours, `composeWelcome` refreshes the verdict through
`checkUpdateAvailability(cwd, …)` (`ts/src/welcome/card.ts`, `ts/src/runtime/git.ts`).
That compares the HEAD of the repository holding the cwd with `stable` on that
repository's `origin`, by `git ls-remote`. The installed version is passed in and never
compared, and the registry is never asked. The channel comes from the same place:
`inspectUpdateChannel(cwd, null)` reads a marker in the cwd's repository, not the
package's channel file that `runtime channel` writes. Pi's session start runs all of this
in the person's project, since the extension spawns the front door with its own cwd.

So the verdict is about whatever repository the person is in:

- **Outside any repository, or in one whose `origin` has no `stable`**, the check is
  `unknown`. Nothing is shown and nothing is cached, so a package is never told of a new
  version.
- **In a project whose `origin` has a `stable` branch**, the verdict is about that
  project. A scratch project whose `origin/stable` is one commit ahead, tagged `v9.9.9`,
  made the card announce "New Version Available: v9.9.9" on the newest Mirror.
- **In a Mirror Mind clone**, the verdict is about the clone's HEAD, not the install.

The status line reads the cached verdict with no expiry (`ts/src/welcome/statusLine.ts`).
Only `up_to_date` and `update_available` are ever written, and a successful `runtime
update` does not touch the cache. So a verdict stays until some later check, from some
repository, writes another. On this machine the cache holds a verdict checked from a
clone at the `v0.32.0` tag on 2026-10-11: `update_available`, `v0.32.1`. The status line
still shows `⬆ v0.32.1` with `0.33.0` installed.

A clone install runs the same code, so it has the same problem whenever the session runs
outside the clone.

US2 deferred this explicitly: "Welcome-card update awareness for `package` installs. US3,
with the package." ([US2 plan](../../roadmap/cv22-typescript-core-port/cv22-ds10-python-retirement-npm-distribution/cv22-ds10-us2-npm-era-updater-and-release-tooling/plan.md#non-goals),
Non-Goals). US3's record does not mention it.

## Expected Behavior

- The check answers for the running install, never the cwd. A package compares its
  version with its channel's version on the registry, as `runtime update --check` does
  (`readDistTags`). A clone checks its own checkout, whatever the cwd.
- The channel the card shows and checks is the install's, from the source `runtime
  channel` reports.
- A verdict that no longer applies is not shown. An `update_available` for a version not
  newer than the installed one is dropped, and a successful `runtime update` rewrites the
  cache.
- The session start stays bounded, whatever source the check asks.
- Tests pin it from a cwd outside any repository and from an unrelated repository whose
  `origin` has a tagged `stable` branch. Neither changes the verdict.

## Impact

Medium. A package is the default install, and its card never announces a real update.
Instead, the card and the status line can announce one that does not exist, about
another project, and the status line keeps it across sessions and updates. The update
route itself is correct: `runtime update --check` and `runtime update` ask the registry.
Nothing is at risk. With [CR134](cr134-release-notes-pending-reads-the-cwd-s-git-repository.md)
open, the question the card suggests also gets a wrong answer.

## Plan Or Decision

Captured, unassigned, 2026-10-14, beside
[CR133](cr133-release-notes-reads-the-git-repository-above-the-package.md) and
[CR134](cr134-release-notes-pending-reads-the-cwd-s-git-repository.md). Current Focus
unchanged. The package half likely reuses the `update --check` route.

Selected 2026-10-14. The plan below was reviewed by a four-lens panel the same day
([record below](#panel-review-2026-10-14)), and its findings are folded in.
**Approved 2026-10-14 by the Navigator, with every decision as recommended.** Driver
`@viniciusteles` and Delivery `main` were assigned in the same turn.

Two premises above are not quite true ([evidence at selection](#at-selection-2026-10-14)).
On `stable`, the card checks at every render, not when the cache is older than six
hours. On `main`, it never checks. And the cwd reaches the card a second way, with no
network at all: the local "N commits behind" line reads the cwd's repository too.

### Objective

The welcome card and the status line announce an update only when the running install
has one. A package asks the registry for its channel's version, a clone asks its own
checkout, and nothing in the verdict comes from the cwd. A verdict about a version the
install already has is not shown, a successful `runtime update` replaces the cached one,
and the card's remote work has one bound, whatever it asks.

### Design

**The card asks the install.** The welcome route detects the install as `runtime
channel` does, from where the front door lives, with nothing spawned. `composeWelcome`
takes that install where it took a cwd:

- a **package** reads its channel's dist-tag through `readDistTags`, the read `runtime
  update --check` makes. `update_available` is cached with the version `v<dist-tag>`,
  and `up_to_date` is cached. `channel_behind` and `unresolved` are neither cached nor
  shown. No git runs;
- a **clone** runs `checkUpdateAvailability` and the tag lookup in its own repository,
  and the local "N commits behind" line counts the same repository;
- an **unknown** install checks nothing and shows no update line.

The install, the npm runner, the config home, and the budget are injectable, as the
update route's are.

**The channel is the install's.** `composeWelcome` derives it from the install through
`channelFor`, the answer `runtime channel` prints, for the version line and for the
check. The route passes the install and nothing that could disagree with it.

**npm runs in the install's own directory, never the person's.** npm reads the project
config of the directory it runs in, so a repository that ships an `.npmrc` with
`registry=` would answer the card's read, and then the update's install, from wherever it
chose ([panel](#panel-review-2026-10-14)). Every npm call the product makes, the
card's read and the update route's `root -g`, `view`, and `install -g`, runs with `cwd`
set to `install.root`, whose project config is the package's own tree. The user's
`~/.npmrc` and `npm_config_*` are read as before. `NpmRunner` takes `{ cwd, timeoutMs }`.

**One budget for the remote work.** The card's remote reads share one deadline,
`WELCOME_REMOTE_BUDGET_MS`, 5 seconds: the registry read, or the clone's `ls-remote` and
then its tag lookup on what is left. The registry read passes `--fetch-retries=0`, so a
registry that cannot be reached fails at once instead of retrying for over a minute.
`runtime update --check` keeps its own budgets and npm's retries.

**Only a verdict that still applies is shown.** One rule, used by the card and the
status line: an `update_available` whose version is not newer than the installed version
is not shown. A verdict without a version, from a clone's tag lookup that found none, is
shown as today, since nothing can judge it. The status line reads the installed version
from the running tree's manifest, a file read, so it still spawns nothing.

**A check that answers nothing changes nothing.** When the check returns neither
`up_to_date` nor `update_available`, the cache stays as it is, as today, and the card
shows the cached verdict that passes the rule above, as the status line does. Today the
card shows nothing while the status line shows the cached `⬆`.

**A successful update records itself.** After `runtime update` succeeds, outside
`--dry-run`, it writes `up_to_date` for the channel it followed into the cache of the
home it updated. Other homes over the same install keep their caches, and the rule above
drops their old verdicts.

**The cadence is unchanged.** On `stable` the card checks at every render; on `main` it
never checks and shows the cache, filtered. The welcome spec is corrected to say so.
`cacheIsStale` and `UPDATE_CHECK_TTL_MS` are reachable by neither path (decision 5).

**The check leaves a trace.** The welcome's front-door log line records the check's
source, verdict, and milliseconds, as `runtime update` records its run, so a slow
session start can be explained later.

### Decisions

All six were taken as recommended, 2026-10-14.

| # | Question | Driver's recommendation |
|---|---|---|
| 1 | The budget for the card's remote work | 5 s in total, and no npm retries. Online, the registry read took 0.3 to 0.6 s here. A check that never answers costs at most the budget at each session start, against Pi's 30 s ceiling for the whole session-start envelope |
| 2 | The cadence. The code checks at every render on `stable`, while this CR, the welcome spec, and `UPDATE_CHECK_TTL_MS` say every six hours | Keep the code's cadence, which the oracle chose so that a release published today shows at the next session start, and correct the spec. Honoring the TTL instead would cost one check per six hours and announce a release up to six hours late |
| 3 | The card falls back to the cached verdict when a check answers nothing | Include it. With a 5 s budget, a slow link would otherwise hide a known update on the card while the status line shows it |
| 4 | `runtime version` and `runtime status` read a clone's channel from the cwd too | Not this CR: capture it as its own, beside CR134 |
| 5 | `cacheIsStale` and `UPDATE_CHECK_TTL_MS` are dead: on `stable` every value the code writes forces the check, on `main` the cache is returned stale or fresh, and decision 2 keeps both | Delete them and their test. The golden's `meta.staleness` keys stay, unused, with a README row. This deletes a test that grades a frozen golden, so it is your call |
| 6 | The update route's npm calls move to `install.root` too, outside the card | Include it. Without it the card stops handing the lure and the update still takes the bait; it is one argument on three calls in the same runner |

### Files

- `ts/src/welcome/card.ts`: the check by install kind, the budget, the package mapping,
  the rule, and the fallback.
- `ts/src/welcome/updateCache.ts`: the rule, shared with the status line, and the
  writer `runtime update` calls.
- `ts/src/welcome/statusLine.ts`: the installed version, and the rule.
- `ts/src/runtime/git.ts`: `checkUpdateAvailability` takes its `ls-remote` timeout,
  `GIT_NETWORK_TIMEOUT_MS` by default.
- `ts/src/runtime/strategies/package.ts`: `NpmRunner` takes `{ cwd, timeoutMs }`;
  `npmRootGlobal`, `readDistTags`, and `installGlobal` pass the install's root as cwd,
  and `readDistTags` takes a timeout and a retry count. The budgets and retries of
  `runtime update` are unchanged.
- `ts/src/frontDoor/runtimeRoute.ts`: the welcome route passes the install and the
  installed version, and logs the check; the update route writes the cache after a
  success and runs npm in the install's root.
- `ts/test/welcome/installUpdateCheck.test.ts`, new. Every check runs from two
  directories: one outside any repository, and an unrelated repository whose
  `origin/stable` is one commit ahead, tagged `v9.9.9`, and fetched. The cases:
  - a package, against a recording npm runner: `update_available` names the dist-tag,
    `up_to_date` is cached and shows nothing, `channel_behind` and `unresolved` cache
    nothing, the read carries `--fetch-retries=0` and the remaining budget, and git is
    never spawned (the `git` spy of the status-line test);
  - the cwd given to the runner is `install.root`, with the unrelated repository
    holding an `.npmrc` that names `http://127.0.0.1:9/`, for the card's read and for
    the update route's three calls;
  - `MIRROR_WELCOME_REMOTE_UPDATE_CHECK=off` keeps a package off the registry: the
    runner sees no call;
  - a clone fixture whose own `origin/stable` is one commit ahead, tagged `v1.1.0`: the
    card names `v1.1.0`, the cache holds the clone's commits, and the "commits behind"
    line counts the clone's;
  - the channel line and the check follow a package's `update-channel` file and a
    clone's marker;
  - a registry that never answers, and a clone remote behind a transport slower than
    the budget: the card returns within the budget and a margin, shows no new verdict,
    and leaves the cache byte-identical. The budget is injected at 1 s;
  - the rule: a cached `update_available` for the installed version or an older one is
    shown by neither surface; a newer one, or one without a version, by both. The
    oracle's own case, `v9.9.9` cached at an install of `9.9.9`, is pinned here by name
    as hidden;
  - what the update writer records, for a clone and for a package.
  The in-process cases that change directory restore it in `finally`; the structural
  proof, a real cwd, is the CLI-level test below.
- `ts/test/welcome/welcome.test.ts`: the oracle-graded cases pass the fixture clone as
  the install, and its installed version moves from `9.9.9` to `9.9.8`.
- `ts/test/goldens/welcome.golden.json`, by hand: `meta.fixture_version` becomes
  `9.9.8`, and the seven `Version 9.9.9 · channel stable` card lines become
  `Version 9.9.8 · channel stable`. Nothing else. The oracle's fixture announced
  `v9.9.9` to an install at `9.9.9`, which is the stale verdict this CR stops showing;
  at `9.9.8` every recorded update line stays true. A row in
  `ts/test/goldens/README.md` records the edit, and, under decision 5, that
  `meta.staleness` is no longer graded.
- `ts/test/frontDoor/runtimeTailCli.test.ts`: the card's channel is the one `runtime
  channel` prints, where the test asserted the cwd's marker. The card from a directory
  outside any repository and from the unrelated repository is byte-identical to the card
  from the checkout. The remote check stays off, so nothing reaches the network.
- `ts/test/runtime/packageStrategy.test.ts`: `readDistTags` passes the timeout and the
  retry flag only when asked, and every call carries the install's root as cwd.
- `scripts/smoke_runtime_update.sh`:
  - the clone lane, before its update: the card, from a directory outside any
    repository, reads `channel main` and `1 commit behind origin/main`, the scratch
    clone's own;
  - the package lane, while the shim's `stable` is ahead: the card and the status line
    name the newer version, from `$PKG_HOME` and from an unrelated repository with a
    tagged `origin/stable`. After the real update, the status line reads `✓`. The shim
    answers the welcome's registry read.
- `docs/product/specs/welcome/index.md`: the source by install kind, the channel, the
  cadence, the budget, and the rule.
- `REFERENCE.md`: `runtime update` records its result for the welcome card and the
  status line.
- This CR and its index row.

### Acceptance

- From a directory outside any repository, and from an unrelated repository whose
  `origin/stable` is ahead and tagged, the card and the status line give the install's
  own verdict: a package's channel dist-tag, a clone's checkout against its own remote.
- The card's channel line reads what `runtime channel` reports.
- No surface shows an `update_available` for a version at or below the installed one.
  After a successful `runtime update`, the status line reads `✓`.
- The card's remote work ends within the budget, and a check that answers nothing leaves
  the cache untouched.
- `npm test`, typecheck, lint, the doc-link check, and the updater smoke stay green.

### Validation Route

Navigator, in their own shell. Scratch homes only. The registry is read, never written,
and the installed Mirror is not touched.

**The package**, packed from the working tree at a version one patch behind the
registry's `stable`, installed into a scratch prefix, and run from two directories:

```bash
rm -rf /tmp/cr135 && mkdir -p /tmp/cr135/src /tmp/cr135/home /tmp/cr135/os && cd /tmp/cr135
(cd ~/dev/workspace/mirror-dev && git ls-files -z --cached --others --exclude-standard | tar --null -T - -cf -) | tar -C src -xf -
(cd src && npm version 0.32.9 --no-git-tag-version >/dev/null && npm pack --pack-destination /tmp/cr135 >/dev/null)
npm install -g --prefix /tmp/cr135/prefix /tmp/cr135/mirror-mind-0.32.9.tgz >/dev/null
export GIT_CONFIG_GLOBAL=/dev/null GIT_AUTHOR_NAME=r GIT_AUTHOR_EMAIL=r@r GIT_COMMITTER_NAME=r GIT_COMMITTER_EMAIL=r@r
git init -q --bare remote.git && git init -q -b stable proj && cd proj
echo a > a && git add a && git commit -qm A && git remote add origin /tmp/cr135/remote.git
echo b > b && git add b && git commit -qm B && git tag v9.9.9 && git push -q origin stable v9.9.9
git reset -q --hard HEAD~1 && git fetch -q origin
printf 'registry=http://127.0.0.1:9/\n' > .npmrc && cd /tmp/cr135
pkg() { (cd "$1" && shift && env -u MIRROR_USER -u MIRROR_HOME -u XDG_CONFIG_HOME HOME=/tmp/cr135/os /tmp/cr135/prefix/bin/mirror "$@" --mirror-home /tmp/cr135/home); }
pkg /tmp/cr135 welcome
pkg /tmp/cr135/proj welcome
pkg /tmp/cr135/proj welcome --status-line
printf '{\n  "availability": "update_available",\n  "channel": "stable",\n  "checked_at": "2026-10-11T20:42:04.955000+00:00",\n  "version": "v0.32.1"\n}\n' > /tmp/cr135/home/runtime/update-check.json
pkg /tmp/cr135 welcome --status-line
pkg /tmp/cr135 runtime channel main
pkg /tmp/cr135/proj welcome
```

Pass:

- Both cards read `Version 0.32.9 · channel stable` and `✨ New Version Available:
  v0.33.0`. Neither names `v9.9.9` or `commit behind`. The second runs in a project
  whose `.npmrc` points at a closed port, and still answers from the registry.
- The first status line ends with `⬆ v0.33.0`. With the old verdict, `v0.32.1`, written
  in, it ends with `✓`.
- After `runtime channel main`, the card reads `channel main` and shows no update line.

**The clone**, this checkout's own `mirror`, from the same two directories and from the
checkout:

```bash
mkdir -p /tmp/cr135/home2
for d in /tmp/cr135 /tmp/cr135/proj ~/dev/workspace/mirror-dev; do
  (cd "$d" && env -u MIRROR_USER -u MIRROR_HOME mirror welcome --mirror-home /tmp/cr135/home2 | sed -n 2,4p)
done
```

Pass: three identical blocks, each reading `channel main`, the checkout's marker, and
none naming `v9.9.9` or `commit behind`.

**The update**, with `MIRROR_USER` unset:

```bash
env -u MIRROR_USER bash scripts/smoke_runtime_update.sh /tmp/cr135-smoke
rm -rf /tmp/cr135 /tmp/cr135-smoke
```

Pass: the new welcome steps of both lanes pass, the status line reads `✓` after the
package update, and the smoke ends with no failures.

Fail: `v9.9.9` or `commit behind` on any card, a channel other than the install's,
`⬆ v0.32.1` on the status line, a card that waits past the budget, or a smoke failure.

### Non-Goals

- `runtime version` and `runtime status` reading a clone's channel from the cwd
  (decision 4).
- `runtime update --check` writing the cache.
- A `main` dist-tag. The publish route moves `stable` and `latest` only, so a package
  on `main` resolves nothing; the card keeps checking on `stable` only, for both kinds.
- `runtime update --check`'s budgets and npm's retries there.
- Judging a cached verdict by its channel. The status line would have to read a clone's
  marker through git. A verdict cached for the other channel stays until the next check
  or update, still subject to the version rule.
- One budget policy inside `runGit` (CR132's limitation): the card passes its own.
- [CR134](cr134-release-notes-pending-reads-the-cwd-s-git-repository.md), the answer to
  the question the card suggests.
- A prerelease clone tag (`v0.33.0-rc1`) parses as no version and is hidden by the rule
  where today it shows. Release tags are plain `vX.Y.Z`, so nothing real is lost.

### Panel review (2026-10-14)

The Navigator asked which lenses fit and had them review. The security-engineer,
devops-engineer, quality-assurance, and engineer lenses reviewed the Driver's draft, each
testing its claims against the code, npm, and scratch directories. Only dissent was
recorded.

Synthesis: the plan's shape holds. Its weak point was the spawn it adds, `npm` at every
session start in the person's project directory, which the draft did not treat as a
boundary. The rest is test completeness and one seam. The plan succeeds if the card and
the status line give the install's own verdict from any directory, a hostile project
cannot choose the registry, and nothing the card does outlives its budget.

| Lens | Dissent | Resolution |
|---|---|---|
| security-engineer | **Blocker.** npm reads the project config of the directory it runs in. A project holding `.npmrc` with `registry=http://127.0.0.1:9/` redirected `npm view mirror-mind dist-tags` there, from its root and from a subdirectory (measured); a neutral cwd reached the real registry. The card would announce the version a hostile registry names and invite "update my Mirror"; `runtime update` runs `npm install -g` in the same cwd, against the same registry, and `npm install` runs the installed package's scripts. The update half is pre-existing; the card is the lure, delivered at every session start | Every npm call runs with `cwd` set to `install.root` (decision 6). A test gives the runner a project with the hostile `.npmrc` as cwd and asserts the cwd passed, for the card and for the update route's three calls. The validation route's unrelated project carries that `.npmrc`. The clone side was already safe: `ls-remote` runs in the install's own repository |
| devops-engineer | A second Node process at every session start on `stable` is acceptable, but a slow session start months from now has no trace. And the package smoke's shim matches its argv exactly, so the welcome's read is "unscripted" until the shim learns it | The welcome's front-door log line records the check's source, verdict, and milliseconds. The shim answers the welcome's read; CI runs the smoke with `HOME=$PKG_HOME`, so no runner `.npmrc` is read. Accepted: the local git calls around a clone's check keep their 2 s budgets outside the 5 s |
| quality-assurance | The golden hand edit hides the oracle's own case without pinning it. The kill switch has no case for a package. The in-process `chdir` cases could leave the cwd changed on failure. The route never creates `/tmp/cr135/home2` | The hidden case is pinned by name in the new test, for both surfaces. The kill switch has its case: the runner sees no call. `chdir` restores in `finally`, and the real-cwd proof is the CLI test. The route creates the home. Accepted: a prerelease tag is hidden by the rule (Non-Goals) |
| engineer | The route passed `install` and `updateChannel` as two inputs that must agree. `NpmRunner(args, cwd?, timeoutMs?)` grows positional optionals, and the security finding puts a cwd on every call. `cacheIsStale` and `UPDATE_CHECK_TTL_MS` are reachable by no path, and a test of a function nothing calls is noise | `composeWelcome` derives the channel from the install. `NpmRunner` takes `{ cwd, timeoutMs }`. The dead TTL is decision 5, the Navigator's, since deleting its test touches a frozen golden's coverage |

Not asked:

- the database-architect, ai-engineer, and prompt-engineer: the slice has no data,
  model, or prompt;
- the product and experience designers: the card's wording does not change.

## Evidence

The real home, on the Homebrew package `mirror-mind@0.33.0`:

```text
$ mirror welcome --status-line
◇ <home> · Mirror Mind on ◌ Mirror Mode · ⬆ v0.32.1

$ cat <home>/runtime/update-check.json
{
  "availability": "update_available",
  "channel": "stable",
  "checked_at": "2026-10-11T20:42:04.955000+00:00",
  "current_commit": "78dd5836db36ded207616b8d8bc504ee58e4f530",
  "note": null,
  "remote_commit": "c94a3f794f65f4c0abc20ef46dbeb333a4fcb0cf",
  "title": null,
  "version": "v0.32.1"
}
```

In this repository, `78dd5836` is the `v0.32.0` tag and `c94a3f79` the `v0.32.1` tag.
The file was last written on 2026-10-11, before the update to `0.33.0` on 2026-10-14.

A scratch home, and a scratch project with HEAD at commit A and `origin/stable` at commit
B, tagged `v9.9.9`:

```text
$ cd <the scratch project>
$ mirror welcome --mirror-home <scratch home>
◇ Mirror · home
Version 0.33.0 · channel stable
0 journeys · 0 personas · 0 memories · 0 conversations · since today
✨ New Version Available: v9.9.9
Ask: "what's new in this update?" or "update my Mirror"

→ Where shall we begin?

$ cd /tmp && mirror welcome --status-line --mirror-home <scratch home>
◇ home · ⬆ v9.9.9
```

The cache it wrote held the scratch project's HEAD as `current_commit` and its
`origin/stable` as `remote_commit`.

A scratch home holding a copy of the real cache, from `/tmp`: the card shows no update
line and leaves the cache byte-identical, and the status line still shows `⬆ v0.32.1`.
An empty scratch home, from `/tmp`: no `update-check.json` is written.

With a scratch `XDG_CONFIG_HOME`, `runtime channel main` reports `Update channel: main`
from the package's file, and the card still prints `Version 0.33.0 · channel stable`.

Added 2026-10-14 from
[CR132](cr132-release-promote-pushes-with-the-local-two-second-timeout.md)'s selection,
at the Navigator's request. These points are read from the code, not observed:

- When the cache is older than six hours (`UPDATE_CHECK_TTL_MS`), `refreshUpdateCache`
  (`ts/src/welcome/card.ts`) asks the remote twice, on two different budgets:
  - `checkUpdateAvailability`'s `ls-remote <remote> refs/heads/<branch>`
    (`ts/src/runtime/git.ts`) runs with `GIT_NETWORK_TIMEOUT_MS`, 120 seconds;
  - on `update_available`, `remoteTagForCommit`'s `ls-remote --tags <remote>
    refs/tags/v*` runs with the default `GIT_LOCAL_TIMEOUT_MS`, 2 seconds.
- In Pi, the card renders inside `conversation-logger session-start --fast --welcome`,
  which the extension runs with a 30-second exec timeout (`runMirror` in
  `.pi/extensions/mirror-logger.ts`). With a stale cache, a remote that does not answer
  can hold the session start until that timeout, well before the 120-second budget
  runs out.
- A tag lookup slower than two seconds fails, `remoteTagForCommit` returns no tag, and
  the `update_available` verdict is cached without its version.

### At selection (2026-10-14)

Run with this checkout's `mirror`, a clone install whose `runtime channel` reports
`main` from its marker, against scratch homes and a scratch project whose
`origin/stable` is one commit ahead of HEAD, tagged `v9.9.9`.

- **The card checks at every render on `stable`, not every six hours.**
  `cacheShouldRefresh` is true for any cached `up_to_date` or `update_available` on
  `stable`, so the TTL never gates the check. On `main`, `updateAwareness` returns the
  cache before checking. A cache that said `up_to_date`, written seconds before, was
  replaced at once: from the scratch project the card announced `✨ New Version
  Available: v9.9.9`, and the cache then held the project's HEAD and its
  `origin/stable`. The six-hour statements in the Problem and in the evidence added from
  CR132 describe the TTL, not what the code does. The welcome spec says the same.
- **The "commits behind" line reads the cwd too, with no network.** With
  `MIRROR_WELCOME_REMOTE_UPDATE_CHECK=off`, after `git fetch` in the scratch project, the
  card read `New Version Available: 1 commit behind origin/stable · run runtime update`.
  `updateLine` asks `inspectGitUpdatePlan` about `inspectGit(cwd)`.
- **The channel line follows the cwd for a clone install as well.** The same install
  rendered `Version 0.33.0 · channel stable` from `/tmp` and `Version 0.33.0 · channel
  main` from the checkout. `runtime version` and `runtime status` from `/tmp` report
  `Install: clone (…/mirror-dev)` with `Update channel: stable` and `Update channel note:
  no repository`.
- **The registry read.** `npm view mirror-mind dist-tags --json` answered in 0.57 s,
  with `latest` and `stable` both at `0.33.0` and no `main` tag. Against a registry
  whose name does not resolve, it failed after 70 s, spent on npm's retries. With
  `--fetch-retries=0` it failed after 0.2 s, and the real registry answered in 0.3 s.
- **The Homebrew install is a package by layout.** `/opt/homebrew/bin/mirror runtime
  version` reports `Install: package (mirror-mind@0.33.0)` with `Install root:
  /opt/homebrew/lib/node_modules/mirror-mind`, so the route detects it with nothing
  spawned.

The panel's checks (2026-10-14):

- **npm honours the cwd's project config.** In a scratch project holding
  `package.json` and `.npmrc` with `registry=http://127.0.0.1:9/`, `npm view mirror-mind
  dist-tags --json --fetch-retries=0` failed with `ECONNREFUSED 127.0.0.1:9`, from the
  project root and from a subdirectory. From `/`, the same command answered from the
  registry. The Pi extension spawns the front door with no cwd of its own, so the card
  runs in the directory Pi was opened in, and `runtime update`'s npm calls pass no cwd
  either.
- **The TTL gates nothing.** `cacheIsStale` has one caller, `updateAwareness`. On
  `stable`, `cacheShouldRefresh` is true for both values the code ever writes, so the
  check runs whether the cache is fresh or stale; on `main`, the function returns the
  cache before checking, fresh or stale.

## Outcome

Pending.
