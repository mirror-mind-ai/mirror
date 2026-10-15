[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR138 — `runtime status`, `version`, and `diagnose` read a clone's repository and channel from the cwd, so a healthy clone is `attention needed` outside its checkout

## Problem

For a clone install, `runtime status` and `runtime version` inspect the repository that
holds the cwd, not the install. Both name the install correctly on their first line,
`Install: clone (<checkout>)`, from where the front door lives. Then they report the
repository, the git state, and the update channel of whatever directory the command was
run in (`buildRuntimeStatus({ start: cwd })` and `channelForStatus` in
`ts/src/runtime/status.ts`; `inspectGitFor` and `inspectUpdateChannel(start)` in the
`version` route of `ts/src/frontDoor/runtimeRoute.ts`).

So, from a directory outside any repository:

- `runtime status` reports `Repository: unknown` with a `Git status note: fatal: not a
  git repository`, and its verdict is `attention needed`, exit 1, because
  `statusVerdict` reads that git error. The same install is `ready` from its checkout.
- Both commands report `Update channel: stable` with `Update channel note: no
  repository`, while `runtime channel` reports the install's own `main` from its marker.

From another repository, they report that repository's branch, commit, dirt, and channel
marker as the install's.

`runtime update` does not have the problem. It inspects `install.repository` for a
clone, and `runtime channel` reads the install's marker. A package does not have it
either: it reports `Repository: none (package install)` and its channel file.

Found while planning [CR135](cr135-the-welcome-card-s-update-check-asks-the-cwd-s-repository.md),
its decision 4, which left these two commands out of that CR's scope.

## Expected Behavior

- For a clone, `runtime status` and `runtime version` report the install's own
  repository, git state, and channel, whatever the cwd. Their verdict from any
  directory is the verdict from the checkout.
- The channel row reads what `runtime channel` reports.
- Planning decides what `runtime version --start PATH` keeps. REFERENCE.md documents it
  as inspecting "a repository from a chosen path instead of the current working
  directory"; the install line already ignores it.
- Added at selection, 2026-10-15: the clone-role row reads the install's own marker, and
  `runtime diagnose` grades the install's own repository. Run inside another project, it
  reports none of that project's files. The Navigator brought `diagnose` into scope.

## Impact

Low to medium. REFERENCE.md's recommended update flow starts with `runtime status`, and
a clone user who runs it from a project is told `attention needed` about a healthy
install. The channel row contradicts `runtime channel` and the welcome card, which reads
the install since CR135. No skill runs either command directly, and `runtime update`
gates on the install's own status, so no update is refused or allowed wrongly. Nothing
is at risk.

## Plan Or Decision

Captured, unassigned, 2026-10-14, at CR135's implementation, as CR135's decision 4
asked. Current Focus unchanged.

Selected 2026-10-15. Selection found three things the capture did not say
([evidence at selection](#at-selection-2026-10-15)): the clone-role row reads the cwd
too; `runtime diagnose` builds the same report, and from inside another project reports
that project's uncommitted files as Mirror drift; and a false `attention needed` is logged
as a front-door `ERROR` that `diagnose` later counts. The Navigator brought `diagnose`
into scope at selection, and the title says so. The Navigator took both decisions as
recommended, and the plan was reviewed by a four-lens panel the same day
([record below](#panel-review-2026-10-15)), its findings folded in. Its security lens
found that the defect is also a way for a checkout the person did not make to run a
command. **Approved 2026-10-15 by the Navigator**, with Driver `@viniciusteles`. The
Delivery given, `viniciusteles`, is neither a branch nor a pull request, so assignment
waits for that decision and the status is `planned`.

### Objective

`runtime status`, `runtime version`, and `runtime diagnose` describe the install that is
running, from any directory. For a clone that means its own repository, git state, clone
role, and channel, the channel being what `runtime channel` reports. A healthy clone is
`ready` from anywhere, and `diagnose` never grades a repository that is not the
install's.

### Design

**The install chooses the repository.** `buildRuntimeStatus` stops defaulting `start` to
the cwd. Without `start`, it inspects the install's own repository: a clone's
`install.repository`. A package has none, as today, and an unknown install has none
either (decision 2). A `start` that is given stays an explicit override. Every existing
builder test and golden passes one, including the case that pins a clone graded from a
non-repository directory as `attention needed`, so none of them moves.

**One rule, in one place.** `inspectionRootFor(install, start)` answers where the
repository rows come from: `start` when given, else a clone's `install.repository`,
else none. The builder and the `version` route both call it; `version` builds no report
of its own, so it cannot drift. The clone-role row is rendered by one
`renderCloneRoleLines(install, role)` beside `renderRepositoryLines`, used by both
renderers.

**The routes stop passing the cwd.** `status`, `diagnose`, and `update` pass no
`start`; `version` passes `--start` only when it is given (decision 1). `update`'s gate
built its report with `start: cwd` for a non-clone, so an unknown install ran git in the
cwd before `runUpdate` refused it; with no `start`, nothing runs. The three read routes
take the read route's `install` seam (`io.install ?? detectThisInstall()`), as `pending`
does since CR134, so tests can inject a clone. The update route's own detection is
unchanged.

**Git runs only where the install is.** `inspectGit` and the worktree inspection run
`git` in the directory they are given, and git reads that repository's `.git/config`,
where `core.fsmonitor` names a command git runs on `status` (measured at selection: it
ran). Today `runtime status` and `diagnose`, run inside a checkout the person did not
make, run what that checkout chose. After this change, git runs in the install's own
checkout, and in another repository only through `version --start PATH`, by explicit
request. REFERENCE.md says so in those words.

**The channel is `runtime channel`'s.** Without an explicit `start`, the channel row
comes from `channelFor`, the one answer `update`, `update --check`, `channel`, and the
welcome card already use; for a clone it reads the marker in the install's checkout.
With `version --start PATH`, the repository rows, the clone role and channel markers
among them, come from PATH, which is what the flag has always meant. `channelForStatus`
goes.

**`diagnose` grades the install's tree.** Its worktree findings come from
`report.git.repository`, which is now the install's checkout. A dirty Mirror checkout is
reported as before; another project's work never is.

**A package and an unknown install read nothing from the cwd.** A package's clone-role
row reads `none (package install)`, as its Repository row does. Today it reports the
cwd's marker, so a package run from inside a dev clone says `dev`. An unknown install
inspects no repository: its git rows are `unknown`, with the detector's reason as the
note, and its verdict is `attention needed` (decision 2).

### Decisions

1. **`runtime version --start PATH`.** (a) *Recommended:* keep it as the explicit
   override, with its documented meaning: inspect the repository at PATH. Without it, the
   install's own. It is the oracle's flag, and keeping it costs nothing. (b) Retire it
   with a cutoff, through the retired-surface table and Pending Cutoffs: a heavier route
   for a flag nothing in the product calls.
2. **An install that cannot be identified.** (a) *Recommended:* inspect no repository.
   The git rows say why, with the detector's reason, and the verdict is `attention
   needed`, which is true: `runtime update` refuses such an install. (b) Keep inspecting
   the cwd for it, as today. It is rare, a copy that is neither a checkout nor a global
   package, but it is the same defect.

Both were taken as recommended, 2026-10-15.

### Files

- `ts/src/runtime/installKind.ts`: `inspectionRootFor(install, start)`, the one rule.
- `ts/src/runtime/status.ts`: `buildRuntimeStatus` takes its root from
  `inspectionRootFor`; the channel row comes from `channelFor`, or from an explicit
  root's marker; `channelForStatus` is removed.
- `ts/src/runtime/git.ts`: `inspectGitFor` answers an unknown install without the cwd
  (decision 2); `renderCloneRoleLines(install, role)`, a package's `none (package
  install)`, used by both renderers.
- `ts/src/frontDoor/runtimeRoute.ts`: `status`, `diagnose`, and `update` pass no `start`;
  `version` passes `--start` only when given, through `inspectionRootFor`; the three read
  routes take `io.install`.
- `ts/test/frontDoor/runtimeInstallReads.test.ts` (new): the three routes in-process.
  The install is a clone fixture: clean, channel `main`, role `dev`. Each runs from a
  plain directory and from an unrelated repository with uncommitted work and its own
  markers, `stable` and `production`. Asserted:
  - byte-identical output for each command from both places;
  - `status` `ready` with exit 0;
  - `diagnose` naming none of the unrelated files;
  - with the install's clone made dirty, `diagnose` naming the install's files and
    `status` saying `attention needed`;
  - `version --start <unrelated>` reading the unrelated repository (decision 1);
  - a package's clone-role row, and an unknown install (decision 2);
  - the unrelated repository is hostile: its `.git/config` sets `core.fsmonitor` to a
    command that creates a marker file. After `status`, `version`, and `diagnose` run
    from inside it, the marker does not exist. That proves git never ran there, not that
    its output was filtered. With `--start <unrelated>`, the marker does appear: the
    explicit request runs git there, as documented.
  The process cwd moves with each run, as in the `pending` tests. `MIRROR_HOME` is
  pinned to the fixture home and provider keys are stripped, as `diagnose.test.ts` does,
  so `diagnose`'s other findings are the fixture's and the byte comparison holds on any
  machine.
- `ts/test/runtime/status.test.ts`: a builder case with no `start` reads the install's
  repository from any process cwd. The existing cases are unchanged.
- `ts/test/frontDoor/runtimeTailCli.test.ts`: the status and diagnose exit-code test's
  comment says what is now inspected, this checkout. Its assertions, that each exit code
  agrees with its verdict, are unchanged.
- `scripts/smoke_npm_package.sh`: the package's `status` says `Clone role: none (package
  install)`.
- `REFERENCE.md`: `status`, `version`, and `diagnose` describe the install; `--start` is
  the explicit override, and the one way these commands run git in a repository the
  install does not own.

### Acceptance

- From any directory, a clone's `status`, `version`, and `diagnose` print what they print
  from its checkout, byte for byte. A healthy clone is `ready` everywhere, exit 0.
- The channel row equals `runtime channel`'s, and the clone-role row is the checkout's
  marker.
- `diagnose` run inside another project reports none of that project's files, and a
  dirty Mirror checkout is still reported.
- Run inside a repository whose `core.fsmonitor` names a command, `status`, `version`,
  `diagnose`, and `update --check` do not run it. `version --start` on that repository
  does.
- `version --start PATH` inspects PATH (decision 1).
- A package's rows read nothing from the cwd, and an unknown install says why
  (decision 2).
- `runtime-status.golden.json`, `runtime-git.golden.json`, and
  `runtime-diagnose.golden.json` are byte-identical.
- `runtime update` is unchanged.

### Validation Route

Driver's checks: the new tests red first, then the suite, typecheck, lint, the guards,
both smokes, and an empty diff on the three goldens.

Navigator's route, in your own shell. Every step names this checkout's front door,
`M=~/dev/workspace/mirror-dev/bin/mirror.js`, never a bare `mirror`, which on this
machine is the Homebrew package (CR134's lesson).

0. **Which install answers.** `"$M" runtime version | grep '^Install'` prints `Install:
   clone (<this checkout>)`. Fail: anything else.
1. **`status`, from anywhere.** From the checkout, from `/tmp`, and from a scratch git
   project with a modified and an untracked file, run `"$M" runtime status`. Pass: the
   three blocks are byte-identical and name the checkout, `Clone role: dev`, and `Update
   channel: main`. Fail: `Repository: unknown`, `stable`, `production`, or blocks that
   differ.
2. **`version`, and its override.** `"$M" runtime version` from the same three places:
   byte-identical. Then `"$M" runtime version --start <scratch project>`: that project's
   repository and markers (decision 1).
3. **`diagnose` grades Mirror only.** `"$M" runtime diagnose` from the scratch project and
   from the checkout. Pass: the same findings, the `front_door_errors` count set aside,
   since each run exits 1 and is logged as an `ERROR` that the next run counts (CR139);
   and none names the scratch project's files. Fail: a `git_dirty` finding for
   `tracked.txt` or `untracked.txt`.
4. **Git does not run in the scratch project.** `git -C <scratch project> config
   core.fsmonitor 'touch <scratch project>/FSMON-RAN; false'`, then `"$M" runtime
   status` and `"$M" runtime diagnose` from inside it. Pass: `FSMON-RAN` does not exist.
   Then `"$M" runtime version --start <scratch project>`: it does. Fail: the file after
   `status` or `diagnose`.

### Non-Goals

- **Logging every non-zero exit as `ERROR`.** A valid verdict that exits 1 is logged as
  an `ERROR`, and `diagnose` then counts it as a front-door error: `status`'s `attention
  needed`, `diagnose`'s own findings, and `pending`'s `unknown` among them. This CR
  removes the false verdicts that feed it, not the loop:
  [CR139](cr139-a-verdict-that-exits-1-is-logged-as-a-front-door-error.md), captured at
  this selection.
- **`runtime update`'s detection and strategy**, which already read the install. Only
  its gate's `start` changes, above.
- **The clone-role guard in `build load`**, which reads the journey's project path, the
  right repository for what it guards.
- **The climb inside `inspectGit` and `inspectMarker`.** They ask git for the top of the
  repository from where they start, and started at the checkout's root, the answer is
  the root itself.

### Panel review (2026-10-15)

The Navigator asked for the same four lenses as CR134's. The security-engineer,
devops-engineer, quality-assurance, and engineer lenses reviewed the Driver's draft, each
testing its claims against the code and scratch repositories. Only dissent was recorded.

Synthesis: the plan's shape holds, and the security finding is why it should be done
soon. Folded in: a hostile unrelated repository in the test, `--start` named as the one
explicit exception, the update route's `start` dropped, the validation's step 3
corrected and a step 4 added, the test's environment pinned, and two shared helpers so
`version` and the two renderers cannot drift.

| Lens | Dissent | Resolution |
|---|---|---|
| security-engineer | `inspectGit` and the worktree inspection run git in the directory they start from, and git runs that repository's `core.fsmonitor` command on `status` (measured: a scratch repository's command ran). So `runtime status` and `diagnose`, run inside a checkout the person did not make, run what it chose, and REFERENCE.md tells clone users to start every update with `runtime status`. The design closes it; the test should prove git never ran there, and `--start` should be named as the one explicit exception | The unrelated repository in the test sets `core.fsmonitor` to create a marker, and the marker must not exist after the three commands; with `--start` it must. REFERENCE.md says `--start` is the one way these commands run git outside the install. Validation gains step 4 |
| devops-engineer | The plan called `runtime update` unchanged, but its gate builds the report with `start: cwd` for a non-clone, so an unknown install runs git in the cwd before `runUpdate` refuses it | The update route passes no `start`; the builder's default is the install. One line, now in Files |
| quality-assurance | Step 3's "the same findings" from two places cannot hold: each `diagnose` exits 1, is logged as an `ERROR`, and the next run counts one more (33, then 34, in the evidence). And the in-process `diagnose` test composes four finding sources that read the env and the home, so the byte comparison depends on the machine unless pinned | Step 3 sets the `front_door_errors` count aside and says why, with CR139. The test pins `MIRROR_HOME` to the fixture home and strips provider keys, as `diagnose.test.ts` does |
| engineer | `version` does not use the builder; it inspects on its own, and "the same root rule" named no place for the rule, which is how the two drift. The clone-role row is rendered twice, so a package's `none` would be written twice | `inspectionRootFor(install, start)` in `installKind.ts`, called by the builder and by `version`. `renderCloneRoleLines(install, role)` beside `renderRepositoryLines`, used by both renderers |

Not asked:

- the database-architect, ai-engineer, and prompt-engineer: the slice has no data,
  model, or prompt;
- the product and experience designers: the rows keep their names; one gains a value,
  `none (package install)`, in the shape the Repository row already has.

## Evidence

This checkout's `mirror`, a clone install whose marker says `main`, on 2026-10-14:

```text
$ cd /tmp && mirror runtime status        # exit 1
Install: clone (/Users/vinicius/dev/workspace/mirror-dev)
Repository: unknown
Git branch: unknown
Git commit: unknown
Git dirty: unknown
Git status note: fatal: not a git repository (or any of the parent directories): .git
Update channel: stable
Update channel note: no repository
Status: attention needed

$ cd ~/dev/workspace/mirror-dev && mirror runtime status
Install: clone (/Users/vinicius/dev/workspace/mirror-dev)
Repository: /Users/vinicius/dev/workspace/mirror-dev
Update channel: main
Status: ready

$ cd /tmp && mirror runtime channel
Update channel: main
Source: /Users/vinicius/dev/workspace/mirror-dev/.mirror-update-channel
```

`runtime version` from `/tmp` prints the same `Repository: unknown`, `Update channel:
stable`, and `Update channel note: no repository` rows.

### At selection (2026-10-15)

On the code `v0.33.1` shipped, with this checkout's front door named explicitly
(`~/dev/workspace/mirror-dev/bin/mirror.js`):

- **The capture reproduces.** From `/tmp`: `runtime status` exit 1, `Repository:
  unknown`, `Git status note: fatal: not a git repository`, `Update channel: stable`,
  `Status: attention needed`. From the checkout: exit 0, the checkout, `main`, `ready`.
- **The clone-role row reads the cwd too.** From `/tmp`, `status` and `version` say
  `Clone role: production`, and `version` adds `Clone role note: no repository`. From
  the checkout they say `dev`, which is the marker's value.
- **`diagnose` grades the cwd's repository.** From a scratch repository with a modified
  tracked file and an untracked file, it reported `Findings: 3 attention needed`. Two of
  them were that project's files: `git_dirty: M  tracked.txt` and `git_dirty: ??
  untracked.txt`, with the recommendation "commit, stash, or discard intentional work
  before update planning". From `/tmp` and from the checkout it reported one finding,
  the same in both.
- **A false verdict becomes a counted error.** `frontDoorLog.ts` logs any non-zero exit
  at `ERROR` (`level = exitCode === 0 ? "INFO" : "ERROR"`), and `diagnose` counts
  `ERROR` lines as `front_door_errors` (`diagnose.ts`). In the `vinicius-dev` home, 17 of
  the last 24 hours' 36 `ERROR` lines were `runtime` commands, these checks among them.
- **The builder already treats `start` as given.** `status.test.ts` pins a clone graded
  from a non-repository directory as `attention needed`. The default, not the
  parameter, is what reads the cwd, so making the install the default moves no test.

## Outcome

Pending.
