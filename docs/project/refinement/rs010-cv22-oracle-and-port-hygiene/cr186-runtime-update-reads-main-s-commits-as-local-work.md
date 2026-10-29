[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR186 — `runtime update` reads a clone's commits from `origin/main` as local work, and tells the person to push or reset

## Problem

A clone follows `origin/<channel>`: `origin/stable`, unless its `.mirror-update-channel`
marker says `main` (`ts/src/runtime/channel.ts`). The plan stage counts
`origin/stable..HEAD` and treats every commit there as the person's own. It refuses with
`plan: local commits present` and the recovery "Local branch is ahead of upstream; push or
reset before updating." (`plan` in `ts/src/runtime/strategies/clone.ts`;
`inspectGitUpdatePlan` in `ts/src/runtime/git.ts` classifies the same way). It never asks
where those commits came from.

Take a clone on `main` that was fast-forwarded to `origin/main` between releases. It is
ahead of `origin/stable` only by commits the remote already has. The refusal calls them
local, "push" means nothing for them, and "reset" names no target. Nothing says the state
ends on its own at the next release, which will contain those commits. Nothing says that
`runtime channel main` would follow the branch the clone is already on.

v0.33.3's release notes led people into this state. The one-time manual update they gave
for a clone under a non-ASCII path was `git pull --ff-only`, which on `main` pulls past
the release.

## Expected Behavior

- The plan stage separates commits that the other channel already has from commits that
  are on no remote. A clone ahead of its channel only by `origin/main`'s commits is told
  that `stable` is behind it, with two ways out: `runtime channel main`, or staying until
  the next release, which contains them. It is told neither to push nor to reset. (As
  captured, a reset to `origin/stable` was a third way out. Planning dropped it; see
  decision 2 below.)
- Real local work keeps today's refusal and its push-or-reset advice.
- `runtime update` and `inspectGitUpdatePlan` classify the same way.

## Impact

Low. Nothing is lost: the plan stage refuses before the backup, and the working tree and
database are unchanged. But the person is told they have local work they do not have, and
the advice does not apply. It affects anyone who pulls `main` on a clone that follows
`stable`, which the v0.33.3 notes told people to do.

## Plan Or Decision

Captured, unassigned, 2026-10-29, from Leandro Garcia's report on PR #42, at the
Navigator's direction. The report suggests this distinction and naming
`runtime channel main` as an option. Planning decides whether a clone ahead of `stable`
only by `main`'s commits should be refused at all, or reported as current with a note.

The release-note instruction is corrected separately. The v0.33.3 notes now give
`git fetch origin` and `git merge --ff-only origin/stable`, the same fast-forward the
updater performs (`fetchUpstream` and the apply step in
`ts/src/runtime/strategies/clone.ts`).

### Plan (2026-10-29; reviewed through four lenses, approved by the Navigator)

**Objective.** A clone ahead of its channel only by commits the other channel already has
is told the truth: its channel is behind it, and there are two safe ways out. It is not
told that it has local work, and it is not told to push or to reset. Real local work keeps
today's refusal. The update plan and the welcome card's inspection read the same state
the same way.

**What planning found.**

- The package lane already refuses this state. When `stable` resolves to a version below
  the installed one, `plan` stops with `'stable' is behind the installed version (…)`,
  "A downgrade is refused: migrations do not run backwards.", and `runtime channel main`
  as the way out (`strategies/package.ts`). A clone ahead of `stable` by `main`'s commits
  is the same state, so it gets the same verdict and the same words.
- `stable` never has a commit that `main` lacks: release promotion only creates or
  fast-forwards `stable` to `main`'s head. So one local count separates the cases:
  `git rev-list --count origin/stable..HEAD ^origin/main` is 0 exactly when every commit
  past `stable` is already on `origin/main`. Checked 2026-10-29: `origin/main..origin/stable`
  counts 0.
- A reset to `origin/stable` is not safe advice. `main`'s code applies pending migrations
  when it opens the database (`db/migrateOnOpen.ts`), and `stable`'s core refuses a
  database that carries migrations it does not know (`db/schemaState.ts`: "database
  schema is newer than this TS core"). On `stable`, `runtime update` has nothing newer to
  install, so the error would stay until the next release. Today
  `git diff origin/stable origin/main -- ts/src/db/` is empty, so the risk is latent. The
  package lane's downgrade refusal exists because a downgrade once failed on that error.
- The update fetches only `origin/<channel>`, so `origin/main` is read as last fetched. A
  stale or missing ref can only make published commits look local, which is today's
  refusal. It can never make local work look published.
- The two classifications count differently today. `plan` makes two `rev-list --count`
  calls through the injected runner; `inspectGitUpdatePlan` makes one
  `rev-list --left-right --count` call through `runGit`.
- `update.test.ts`'s scripted git answers the first key that a command starts with, so the
  new count would silently receive the ahead count of an existing key.
- `git.ts`'s read-only boundary test scans only `runGit([...])` invocations. A count made
  through a runner parameter would be invisible to it.

**Decisions, approved by the Navigator, 2026-10-29.**

1. Refuse, as the package lane does, rather than report the clone as current. One state
   gets one verdict across install kinds, and the existing recovery shape holds the advice.
2. No reset in the advice, for the migration reason above.

**Behavior.**

A `stable` clone fast-forwarded to `origin/main`:

```text
[✗] plan: 'stable' is behind this checkout (3 commit(s), all on origin/main)

Update result: failed

Recovery:
- A downgrade is refused: migrations do not run backwards.
- Follow the channel that carries <commit>: runtime channel main
- Or stay on <commit> until 'stable' reaches it: the next release contains these commits.
- The working tree and the database are unchanged.
```

- Exit 1, before the backup, like every plan refusal. `--dry-run` refuses the same way.
- Any commit on no remote, alone or on top of `main`'s commits, keeps today's
  `local commits present` and its push-or-reset advice.
- The other channel comes from the channel vocabulary; `main` is never written into the
  code. The extra count runs only when the checkout is ahead and not behind. A count that
  fails reads as local work.
- `inspectGitUpdatePlan` reports the same state as `blocked`, with the plan's detail as its
  note. The welcome card shows no update line for it, as today.

**Affected files.**

- `ts/src/runtime/git.ts`: `readChannelPosition`, the one function that counts and
  classifies, called by both. The `GitRunner` type and `splitUpstream` move here from the
  clone strategy. `inspectGitUpdatePlan` maps the result.
- `ts/src/runtime/strategies/clone.ts`: `plan` maps the same result, with the new refusal.
- `ts/src/runtime/update.ts`: the type's new import.
- Tests:
  - `ts/test/runtime/channelPosition.test.ts` (new): a real `file://` origin where `stable`
    is behind `main`. One table of scenarios: current, behind, ahead only by `main`'s
    commits, mixed, local only, diverged, the `main` channel, and the other channel's ref
    missing. Each is asserted on `readChannelPosition`, and `plan` and
    `inspectGitUpdatePlan` are asserted to agree. The carried case also checks the detail,
    the recovery lines, that neither "push" nor "reset" appears, and that the welcome card
    has no update line.
  - `update.test.ts`: the pipeline refuses the carried case at plan with no backup, also
    under `--dry-run`, and the mixed case keeps today's words. Keys are ordered longest
    first.
  - `cloneStrategy.test.ts`: the new count keeps the local timeout (CR132).
  - `git.test.ts`: the read-only boundary also scans invocations made through a runner
    parameter.
- `REFERENCE.md`: the plan stage of `runtime update`.

**Checks.**

- Test-driven: each behavior starts as a failing test.
- The verification checklist, the repository checks, and the suite on a PATH without
  `mirror`.
- `bash scripts/smoke_runtime_update.sh`, which the development guide requires for
  updater changes.

**Navigator validation.** A scratch clone of a scratch origin whose `stable` is
`origin/stable` and whose `main` is this checkout's `HEAD`, so the fix runs in a clone
ahead of `stable` only by `main`'s commits. The home is a scratch one. From the
repository root:

```bash
S=$(mktemp -d)
git init -q --bare "$S/origin.git"
git push -q "$S/origin.git" origin/stable:refs/heads/stable HEAD:refs/heads/main
git clone -q --branch main "$S/origin.git" "$S/clone"
ln -s "$PWD/node_modules" "$S/clone/node_modules" && echo /node_modules >> "$S/clone/.git/info/exclude"
m() { env -u MIRROR_USER -u MIRROR_HOME -u XDG_CONFIG_HOME -u OPENROUTER_API_KEY HOME="$S" node "$S/clone/bin/mirror.js" "$@"; }
m init probe >/dev/null && m seed >/dev/null
m runtime channel stable
m runtime update --dry-run; echo "exit=$?"   # 1. 'stable' is behind this checkout; runtime channel main, or the next release
m runtime channel main
m runtime update --dry-run; echo "exit=$?"   # 2. already up to date: the advice is safe to follow
m runtime channel stable
git -C "$S/clone" -c user.name=probe -c user.email=probe@example.invalid commit -q --allow-empty -m "local work"
m runtime update --dry-run; echo "exit=$?"   # 3. local commits present, push or reset, as today
```

The `exclude` line keeps the scratch tree clean. `.gitignore` says `node_modules/`, which
matches only a directory, so the symlink would make the tree dirty and the status gate would
refuse before the plan runs.

Pass: step 1 exits 1 with the new plan line and recovery, and its output says neither
"push" nor "reset". Step 2 exits 0 with `already up to date`. Step 3 exits 1 with today's
`local commits present` and its push-or-reset advice. Fail: step 1 says `local commits
present`, mentions a push or a reset, or reaches the backup, or step 3 passes.

**Exclusions.**

- `runtime update --check` keeps reporting `local_ahead` for this state, while a package
  reports `channel_behind`. That can be captured separately if wanted.
- A `main`-channel clone ahead by commits on some other pushed branch keeps today's
  refusal. No one has reported it.
- No second fetch for the other channel's ref.
- No new step in `scripts/smoke_runtime_update.sh`: its value is a real tree moving, a real
  archive, and a real migration, and this change ends at plan, before any of them.
- Release notes are written at release time. Commit, push, and release remain separate
  gates.

**Driver and Delivery.** `@viniciusteles` on `main`, confirmed by the Navigator
2026-10-29.

### Review (2026-10-29)

Before approval, the plan was reviewed through four lenses: engineer, devops engineer,
quality assurance, and quartermaster. All four chose to refuse, in the package lane's
words, rather than report the clone as current, which the plan first proposed. What each
contributed is folded into the plan above:

- **Engineer:** the package lane's precedent; one function that counts and classifies,
  instead of a shared verdict over two ways of counting; the other channel derived, not
  written as `main`; a failed count read as local work; the scripted-git prefix trap.
- **Devops engineer:** drop the reset, for the migration reason; the invariant that
  `stable` is always behind `main`, checked; no second fetch, since a stale ref fails
  toward today's refusal.
- **Quality assurance:** the acceptance cases above, the mixed case first among them; a
  parity test over a real repository; the CR132 timeout test reaching the new count;
  `--check`'s `local_ahead` left as a known risk.
- **Quartermaster:** what had to ship (real work still refused, no reset, a safe
  fallback, parity); what not to build now (other branches, a new kind of plan result, a
  second fetch, the `--check` wording); the smoke step deferred, because nothing past plan
  changes.

### Implementation evidence (2026-10-29)

The work went in as one commit on `main`, `af53174e`, test-first: the new tests failed
before the code existed, and the mixed case passed against today's code, as a guard
should.

- `git.ts`: `readChannelPosition` counts and classifies, and `describeChannelPosition`
  gives the words. `inspectGitUpdatePlan` maps the result. It no longer runs its own
  `rev-list --left-right` count. `GitRunner` and `splitUpstream` moved here.
- `strategies/clone.ts`: `plan` maps the same result, and adds each refusal's way out.
- `REFERENCE.md`: the plan stage of `runtime update`.

**Tests.** Seven new tests:

- `channelPosition.test.ts` (new, four tests over a real `file://` origin): the eight-row
  parity table; the carried case's exact words, with no "push" or "reset" and no welcome
  update line; real local work keeping today's words; and the missing `origin/main`
  reading as local work.
- `update.test.ts`: the pipeline refusing the carried case at plan with no backup, both as
  an update and as a dry run; the mixed case keeping today's words.
- `cloneStrategy.test.ts`: the new count keeping the local timeout.

The boundary test in `git.test.ts` now also scans calls made through a runner named
`git`, and it was checked to find the new count.

The whole suite ran three times, each with 3625 tests: 3622 pass, 0 fail, 3 skipped.

- as `npm test`;
- as CI runs it, with `MEMORY_ENV=test`, through `test_leaves_nothing.sh`, which left
  nothing behind;
- with no `mirror` on the PATH.

**Checks.**

- Clean: typecheck; `git diff --check`; and the retired-surface, pack-contents (507
  files), doc-link, skill-parity, and Claude-plugin checks.
- Lint is clean apart from the warning that was already there, in
  `testTempHomes.test.ts`.
- These smokes pass: `smoke_runtime_update.sh` (103 checks), migration structural parity,
  bootstrap custody, migrate-on-open, conversation lifecycle, Builder lifecycle, and
  extension catalog.

**Decided while implementing.**

- The words for every position are given once, in `describeChannelPosition`. The plan's
  detail and the inspection's note were already the same four lines, written twice.
  Only an unreadable comparison keeps a different line in each, as before.
- The package lane's recovery lines are not shared with the clone's. Each strategy owns
  its words (`updatePipeline.ts`), and the clone's "stay" line says more than the
  package's: the next release contains these commits.

**The agent's run of the validation route.** The run is evidence, not the Navigator's
validation. As first written, the route never reached the plan: the `node_modules`
symlink made the scratch tree dirty, and the status gate refused all three steps. The
route now excludes the link. Run again, from `af53174e`, every step showed what it says:

1. Exit 1, refused at plan, with no backup taken:

   ```text
   [✗] plan: 'stable' is behind this checkout (28 commit(s), all on origin/main)

   Recovery:
   - A downgrade is refused: migrations do not run backwards.
   - Follow the channel that carries af53174e: runtime channel main
   - Or stay on af53174e until 'stable' reaches it: the next release contains these commits.
   - The working tree and the database are unchanged.
   ```

2. After `runtime channel main`: `[✓] plan: already up to date`, exit 0. The advice is
   safe to follow.
3. After one local commit: `[✗] plan: local commits present`, with "Local branch is
   ahead of upstream; push or reset before updating.", exit 1.

In this checkout at the same time, the two CR186 commits not yet pushed were real local
work, and `mirror runtime update --channel stable --dry-run --no-fetch` answered with
today's `local commits present`, as it should. Once they are pushed, the checkout is the
case the scratch clone shows.

## Evidence

- [Leandro's comment on PR #42](https://github.com/mirror-mind-ai/mirror/pull/42#issuecomment-6234421624),
  2026-10-17. Following the v0.33.3 instruction on `main` pulled two commits past the
  release (`1f830f8a`, `625fea87`), and the next `runtime update` refused with `plan: local
  commits present`. He reset to `origin/stable`. Both commits are in v0.34.0 and every
  later release, so the refusal would have ended at the next release.
- Reproduced on 2026-10-29 in this repository's checkout. It was on `main` at
  `origin/main` with no local commits (`## main...origin/main`) and three commits ahead of
  `origin/stable`. `mirror runtime update --channel stable --dry-run --no-fetch` printed
  `[✗] plan: local commits present` and "Local branch is ahead of upstream; push or reset
  before updating.", and exited 1.
- Where the instruction came from: CR140's release-note scope, and the v0.33.3 release
  comment on PR #42.

## Outcome

Pending: implemented on `main`, not yet pushed, and awaiting the Navigator's validation.
