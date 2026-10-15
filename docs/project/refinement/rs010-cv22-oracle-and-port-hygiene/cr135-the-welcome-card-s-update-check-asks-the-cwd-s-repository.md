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
`@viniciusteles` and Delivery `main` were assigned in the same turn. Implemented
2026-10-14 and **validated by the Navigator 2026-10-15**
([record](#navigator-validation-2026-10-15)). Closure waits on the Navigator's debt
decision ([Review](#review)).

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
the installed Mirror is not touched, and nothing is exported into the shell.

Corrected 2026-10-14, before the Navigator ran it, without changing what it proves:

- the scratch project's git identity is set inside a subshell. The first version
  exported it, so a later commit in the same terminal would have been authored by it;
- the clone half names this checkout's front door, since `mirror` can resolve to an
  installed package that runs other code;
- the smoke runs from the checkout;
- the cache directory exists before a cache is written into it;
- the project's state is shown with `rev-list`, since its branch has no upstream for
  `status` to compare.

**The package**, packed from the working tree at a version one patch behind the
registry's `stable`, installed into a scratch prefix, and run from two directories.
Build the package, then the project, then define the helper:

```bash
rm -rf /tmp/cr135 && mkdir -p /tmp/cr135/src /tmp/cr135/home/runtime /tmp/cr135/home2 /tmp/cr135/os && cd /tmp/cr135
(cd ~/dev/workspace/mirror-dev && git ls-files -z --cached --others --exclude-standard | tar --null -T - -cf -) | tar -C src -xf -
(cd src && npm version 0.32.9 --no-git-tag-version >/dev/null && npm pack --pack-destination /tmp/cr135 >/dev/null 2>&1)
npm install -g --prefix /tmp/cr135/prefix /tmp/cr135/mirror-mind-0.32.9.tgz >/dev/null 2>&1
/tmp/cr135/prefix/bin/mirror runtime version | sed -n 3,4p
```

```bash
(
  export GIT_CONFIG_GLOBAL=/dev/null GIT_AUTHOR_NAME=r GIT_AUTHOR_EMAIL=r@r GIT_COMMITTER_NAME=r GIT_COMMITTER_EMAIL=r@r
  git init -q --bare remote.git && git init -q -b stable proj && cd proj
  echo a > a && git add a && git commit -qm A && git remote add origin /tmp/cr135/remote.git
  echo b > b && git add b && git commit -qm B && git tag v9.9.9 && git push -q origin stable v9.9.9
  git reset -q --hard HEAD~1 && git fetch -q origin
  printf 'registry=http://127.0.0.1:9/\n' > .npmrc
)
git -C /tmp/cr135/proj rev-list --count HEAD..origin/stable
git -C /tmp/cr135/proj tag
```

```bash
pkg() { (cd "$1" && shift && env -u MIRROR_USER -u MIRROR_HOME -u XDG_CONFIG_HOME HOME=/tmp/cr135/os /tmp/cr135/prefix/bin/mirror "$@" --mirror-home /tmp/cr135/home); }
pkg /tmp/cr135 welcome
pkg /tmp/cr135/proj welcome
pkg /tmp/cr135/proj welcome --status-line
printf '{\n  "availability": "update_available",\n  "channel": "stable",\n  "checked_at": "2026-10-11T20:42:04.955000+00:00",\n  "version": "v0.32.1"\n}\n' > /tmp/cr135/home/runtime/update-check.json
pkg /tmp/cr135 welcome --status-line
pkg /tmp/cr135 runtime channel main
pkg /tmp/cr135/proj welcome
grep -o 'update-check.*' /tmp/cr135/home/front-door.log
```

Pass:

- The package reads `Version: 0.32.9` and `Install: package (mirror-mind@0.32.9)`. The
  project is `1` commit behind its `origin/stable`, tagged `v9.9.9`.
- Both cards read `Version 0.32.9 · channel stable` and `✨ New Version Available:
  v0.33.0`, followed by `— One Plugin, Three Runtimes`: the scratch package is packed
  from the working tree, so it carries v0.33.0's note, which a real 0.32.x would not.
  Neither names `v9.9.9` or `commit behind`. The second runs in a project whose
  `.npmrc` points at a closed port, and still answers from the registry.
- The first status line is `◇ home · ⬆ v0.33.0`. With the old verdict, `v0.32.1`,
  written in, it is `◇ home · ✓`.
- `runtime channel main` reads `Update channel: main (was stable)`, and the card then
  reads `channel main` with no update line.
- The log holds two `update-check source=registry verdict=update_available ms=…`
  lines, one per card on `stable`.

**The clone**, this checkout's own front door, from the same two directories and from
the checkout:

```bash
for d in /tmp/cr135 /tmp/cr135/proj ~/dev/workspace/mirror-dev; do
  (cd "$d" && env -u MIRROR_USER -u MIRROR_HOME node ~/dev/workspace/mirror-dev/bin/mirror.js welcome --mirror-home /tmp/cr135/home2 | sed -n 2,4p)
done
```

Pass: three identical blocks, each reading `Version 0.33.0 · channel main`, the
checkout's marker, and none naming `v9.9.9` or `commit behind`.

**The update**, with `MIRROR_USER` unset:

```bash
cd ~/dev/workspace/mirror-dev && env -u MIRROR_USER bash scripts/smoke_runtime_update.sh /tmp/cr135-smoke
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

### Implementation and the Driver's checks (2026-10-14)

What is now true, at `ff715a43`:

- `composeWelcome` takes the install in place of a cwd, and nothing in it reads the
  cwd. Its channel is `channelFor(install)`. A package's check is
  `checkPackageUpdateAvailability`, the read `runtime update --check` makes, with
  `--fetch-retries=0` and the 5 s budget. A clone's check is `checkUpdateAvailability`
  in `install.repository`, then the tag lookup on what is left of the same deadline.
  The "commits behind" line inspects the clone's repository; a package has none.
- `NpmRunner` takes `{ cwd, timeoutMs }`. `readDistTags`, `installGlobal`, and the
  package strategy run in `install.root`. `npm root -g` runs before the install is
  known, in `runningTreeRoot()`, which for a package is the same directory.
  `release:promote`'s publish dry run passes its repository the same way. A timed-out
  npm reports `npm view timed out after N ms`.
- `verdictApplies` hides an `update_available` whose version is not newer than the
  installed one; the card and the status line both use it. The status line takes the
  installed version from the route, read from the running tree's manifest.
- `runtime update` writes `up_to_date` after a success outside `--dry-run`, through
  `recordUpToDate`, with the clone's new commit or no commit for a package.
- The welcome route logs `update-check source=<registry|git> verdict=<…> ms=<n>` when a
  check ran.
- `cacheIsStale`, `cacheShouldRefresh`, `parseIso`, and `UPDATE_CHECK_TTL_MS` are gone,
  with the staleness test (decision 5). `cacheShouldRefresh` went with them: its only
  caller was the gate the TTL fed, and "check at every render on `stable`" is now
  stated directly.
- `git.test.ts`'s source pin of the `ls-remote` budget follows the new shape: the call
  passes `networkTimeoutMs`, whose default is `GIT_NETWORK_TIMEOUT_MS`.

One reading of decision 3, recorded so it can be checked: the card falls back to the
cache only when the check could not answer (`unknown`). `local_ahead`, `diverged`, and
`channel_behind` are answers that there is no update to take, so they show none and
write nothing, as before.

Where the plan's cases landed: everything listed under the new file is there, except
the update route's own npm calls. Those are pinned where their seams are:
`update.test.ts` (`view` and `install -g` run in `PACKAGE.root`),
`packageStrategy.test.ts` (`npmRootGlobal` and `installGlobal` run where told), and
the updater smoke, whose npm shim records the directory of every call the real route
makes.

Red first, on the unchanged code:

- `installUpdateCheck.test.ts` did not load: `card.ts` exported no budget.
- `welcome.test.ts`: the two cases that render the card failed, the oracle-graded cards
  and the spawn spy, since `composeWelcome` read a channel it was no longer given.
- `runtimeTailCli.test.ts`: the card from a directory outside any repository differed
  from the card from the checkout, and the card said `channel stable` where `runtime
  channel` said `main` (this machine's marker).
- `packageStrategy.test.ts`, `update.test.ts`, `release.test.ts`: no npm call carried a
  cwd option.
- The updater smoke, clone lane at the committed `ca63de65`: step 2c read `channel
  stable` and no "commits behind" line. Package lane, with the source changes stashed:
  eight failures. The card from `$PKG_HOME` announced nothing, the card from the
  unrelated project announced its `v9.9.9`, the status line read `⬆ v9.9.9` before the
  update and still after it, and an npm call ran in `$PKG_HOME`.

Green:

- `installUpdateCheck.test.ts`: 16 of 16. The registry that never answers returned at
  about 1 s on a 1 s budget with the cache byte-identical, and the clone remote behind
  a 3 s transport returned at about 1 s.
- `npm test`: 3,179 pass, 0 fail, 3 skipped, the machine-dependent ones.
- Typecheck, lint, the doc-link check, the retired-surface tripwire, the pack guard (476
  files), skill command parity, `git diff --check`, `bash -n` on the smoke, and the
  conversation lifecycle smoke are all clean.
- The updater smoke at `ff715a43`, with `MIRROR_USER` unset: 103 passed, 0 failed, in
  28 s. Step 2c read `channel main` and `1 commit behind origin/main`. The package lane's
  card announced `v0.33.1` from `$PKG_HOME` and from the unrelated project, the status
  line read `⬆ v0.33.1`, then `✓` after the update, and all 15 npm calls ran in the
  install's root. The real `npm install -g` ran from inside the directory it replaced,
  and succeeded, as it did in a manual check on this Mac.

The Driver ran the [validation route](#validation-route) as written:

- The package, from `/tmp/cr135` and from the project with the hostile `.npmrc`: both
  cards read `Version 0.32.9 · channel stable` and `✨ New Version Available: v0.33.0 —
  One Plugin, Three Runtimes`. The status line read `◇ home · ⬆ v0.33.0`, and `◇ home ·
  ✓` with `v0.32.1` written into the cache. After `runtime channel main`, the card read
  `channel main` with no update line. `front-door.log` held two lines,
  `update-check source=registry verdict=update_available`, at 1,350 and 1,200 ms.
- The clone: three identical blocks from `/tmp/cr135`, the project, and the checkout,
  each `Version 0.33.0 · channel main`, with no update line.

Limitations, for review:

- **The registry read's cost was measured twice.** At implementation, `npm view` took
  1.1 to 1.4 s from every directory tried. The Navigator then pointed out that a VPN was
  on, and the [re-measurement without it](#the-session-start-re-measured-2026-10-14)
  puts the check at about 0.27 s per session start, inside decision 1's 0.3 to 0.6 s.
  Through a VPN it costs about 1.2 s, still inside the budget, and every check logs its
  milliseconds.
- **A clone on `stable` pays more than a package, as before CR135.** Each `git
  ls-remote` over SSH to GitHub takes about 1.35 s: one read when up to date, two when an
  update exists. CR135 adds only the 5 s ceiling over both. On a slow link the tag
  lookup can be cut by it, and the update is cached without its version.
- A clone updated with `--no-fetch` records `up_to_date` against its local refs. The
  next render on `stable` asks the remote anyway.
- Two installs over one home: an `up_to_date` written by the newer one reads `✓` to the
  older one until its next check. The version rule only catches updates that are not
  newer.
- `npm install -g` running inside the directory it replaces is proven on macOS. CI's
  smoke proves it on ubuntu.

Decision 4's capture:
[CR138](cr138-runtime-status-and-version-read-a-clone-s-repository-and-channel-from-the-cwd.md).
It found more than the channel row: from outside the checkout, `runtime status` grades
this healthy clone `attention needed`, exit 1, because it inspects the cwd's git.

### The session start, re-measured (2026-10-14)

At the Navigator's request, after they turned off the VPN that was on during the
implementation run:

- `npm view mirror-mind dist-tags --json --fetch-retries=0`, five runs each: 0.26 to
  0.32 s from `/tmp`, the home directory, and the Homebrew package's root, after the
  first runs from `/tmp` warmed up at 0.43 to 0.75 s.
- A scratch package packed from `f3d9cc44` at 0.32.9 and installed into a scratch
  prefix: five card renders logged `update-check source=registry
  verdict=update_available` at 261 to 273 ms.
- The Pi session-start composite through that package, `conversation-logger
  session-start --fast --welcome --format json`, five alternating runs each, wall time:
  529 to 548 ms with the check, 252 to 271 ms with
  `MIRROR_WELCOME_REMOTE_UPDATE_CHECK=off`. The check adds about 0.27 s. The envelope
  carried the card's `✨ New Version Available: v0.33.0` and the status line's `⬆
  v0.33.0`.
- For comparison, this checkout's `git ls-remote origin refs/heads/stable` and `git
  ls-remote --tags origin 'refs/tags/v*'` over SSH to GitHub took 1.34 to 1.42 s each,
  three runs.

### Navigator validation (2026-10-15)

The Navigator ran the [validation route](#validation-route), as corrected in `0a3eeffd`,
in their own shell, from 15:43 to 15:50.

- **The package.** `Version: 0.32.9` and `Install: package (mirror-mind@0.32.9)`. The
  project was `1` commit behind its `origin/stable`, tagged `v9.9.9`. Both cards,
  from `/tmp/cr135` and from the project with the hostile `.npmrc`, read `Version
  0.32.9 · channel stable` and `✨ New Version Available: v0.33.0 — One Plugin, Three
  Runtimes`, with no `v9.9.9` and no `commit behind`. The status line read `◇ home ·
  ⬆ v0.33.0`, then `◇ home · ✓` with `v0.32.1` written in. `runtime channel main`
  read `Update channel: main (was stable)`, and the card then read `channel main` with
  no update line. The log held two `update-check source=registry
  verdict=update_available` lines, at 549 and 606 ms.
- **The clone.** Three identical blocks, from `/tmp/cr135`, the project, and the
  checkout, each `Version 0.33.0 · channel main` with no update line.
- **The update.** The updater smoke ended with 103 passed and 0 failed. Step 2c read
  the clone's channel and its commits behind. In the package lane, the card announced
  `v0.33.1` from `pkg-home` and from `unrelated`, with nothing from the cwd's
  repository. The status line carried the package's verdict, and read `✓` after the
  update. All 15 npm calls ran in the install's root.

**Validation recorded 2026-10-15.** The Navigator returned the full run with every
pass condition met, in reply to the stated next step: on a pass, CR135 moves to
`validated`.

## Review

**Proportionality.** About 380 product lines added and 125 removed, across six files,
with 945 lines of tests and 78 of smoke. They fix a defect with three faces: the card
announced another project's tag, a package was never told of a release, and the status
line kept a stale verdict across updates. They also close the trust boundary the panel
found, where a project's `.npmrc` could choose the registry the update installs from.
The new test file is most of the line count, because each of its cases runs the check
from two directories, which is the property this CR exists for.

**Scope discipline.** The change touched the plan's files, plus:

- `ts/scripts/releasePromote.ts` and `release.test.ts`: the publish dry run's cwd moves
  into the new `NpmCall` options, and nothing else;
- `git.test.ts`: the source pin of the `ls-remote` budget, which the plan's new
  parameter moved;
- the smoke's `run_cli`, which now resolves the clone's path: the entry runs only when
  `argv[1]` names the file its own URL does, and on macOS `/tmp` is a symlink;
- `cacheShouldRefresh` and `parseIso`, which went with the TTL (decision 5);
- the route corrections in `0a3eeffd`, before the Navigator ran it, and one capture,
  [CR138](cr138-runtime-status-and-version-read-a-clone-s-repository-and-channel-from-the-cwd.md).

**Debt: none carried, if the Navigator accepts these limitations:**

1. Two installs over one home: an `up_to_date` written by the newer one reads `✓` to
   the older one until its next check.
2. A clone updated with `--no-fetch` records `up_to_date` against its local refs,
   until its next render on `stable`.
3. A clone on `stable` pays about 1.35 s per SSH `ls-remote`, one or two per session
   start, as before. On a slow link the 5 s ceiling can cut the tag lookup, and the
   update is cached without its version.
4. A package on `stable` pays about 0.27 s per session start for the registry read,
   and 0.55 to 0.6 s cold in the Navigator's run.
5. Decision 3 as implemented: the card falls back to the cache only when the check
   could not answer.
6. `npm install -g` running inside the directory it replaces is proven on macOS. On
   Linux it waits for CI's smoke, which runs once the commits are pushed.

## Outcome

Pending.
