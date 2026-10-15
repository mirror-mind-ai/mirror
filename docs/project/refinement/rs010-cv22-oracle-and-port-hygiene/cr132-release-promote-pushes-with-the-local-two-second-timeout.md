[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR132 — `release:promote` pushes with the two-second local git timeout, and stops half-promoted

## Problem

`npm run release:promote -- --target vX.Y.Z --push` pushes the tag and then `stable`
through `runGit(["push", remote, ref], repository)` (`ts/scripts/releasePromote.ts`).
`runGit` defaults to `GIT_LOCAL_TIMEOUT_MS`, which is 2 seconds (`ts/src/runtime/git.ts`).
A push over SSH to GitHub takes longer than that, so the push is killed: `spawnSync git
ETIMEDOUT`.

By then the tag exists and `stable` has moved, both locally. The promotion reports
`failed` with the tag and the branch unpublished, and its recovery list is empty.

`git.ts` already defines `GIT_NETWORK_TIMEOUT_MS` (120 s). Its comment cites the v0.30.1
release incident, a short timeout on a network operation, and `releaseNotes.ts` passes it
to its `fetch`. The two pushes do not.

## Expected Behavior

- The push steps run with `GIT_NETWORK_TIMEOUT_MS`, like every other network git call.
- A push that fails after the local steps succeeded prints the recovery: the two
  commands that finish the promotion (`git push origin vX.Y.Z`, `git push origin
  stable`), and that the tag and branch already exist locally, so they are not re-created.
- A test pins the timeout the push steps pass.

## Impact

Medium for the release route: a maintainer can meet a failed promotion on any push slower
than two seconds. No history is at risk, because the tag and the branch stay local until
pushed and are not moved by a re-run.

## Plan Or Decision

Captured, unassigned, at the `v0.33.0` release (2026-10-13). Current Focus unchanged.
Likely a one-argument change per push, plus the recovery lines and the test.

Selected 2026-10-14. The plan below was reviewed by a three-lens panel the same day
([record below](#panel-review-2026-10-14)), and its findings are folded in.
**Approved 2026-10-14 by the Navigator.** Driver `@viniciusteles` and Delivery `main`
were assigned in the same turn. Implemented the same day, validated by the Navigator,
and **done 2026-10-14** ([Outcome](#outcome)).

**Decided 2026-10-14 by the Navigator: the clone updater's fetch joins this CR.** The
premise "like every other network git call" is not true. The Python oracle gave
`_git_push_ref` and `_git_fetch` the network budget in one commit (`521177f8`,
2026-07-13), after the v0.30.1 promotion reported failure for a push that had landed.
The port lost both. `release:promote`'s pushes and the clone updater's `git fetch` run
on the 2-second local budget: `fetchUpstream` in `ts/src/runtime/strategies/clone.ts`
goes through `defaultGitRunner`, which passes no timeout. Only the release-notes fetch
and `checkUpdateAvailability`'s `ls-remote` kept the network budget. This CR restores
both halves of the oracle's fix.

### Objective

The pushes of `release:promote` and the clone updater's fetch run with the 120-second
network budget, as they did before the port. A promotion whose push fails shows why,
says what is already where, and says how to finish, without promising what a re-run
cannot do.

### Design

**The pushes use the network budget.** The push loop passes `GIT_NETWORK_TIMEOUT_MS`
to `runGit`.

**The clone updater's fetch uses it too.** `GitRunner` gains an optional third
parameter, the timeout, which `defaultGitRunner` passes to `runGit`. `fetchUpstream`
asks for `GIT_NETWORK_TIMEOUT_MS`, and every other command of the strategy keeps the
local default. Both update lanes, the ordinary one and the repair lane, run the same
`fetch` step, so one change covers both.

**A failed push shows why.** Git's message for a refused push spans several lines. A
step's detail that spans lines prints its first line on the step and the rest beneath
it, trimmed and indented, so the list of steps stays readable.

**A failed push says how to finish.** When a push fails after the local steps passed,
the recovery says:

- that the tag and the stable branch are at HEAD locally, and which refs the remote
  took before the failure;
- that a push that timed out may have landed anyway, and pushing a ref the remote
  already has changes nothing;
- that a push the remote rejected fails again until what the lines above name is
  resolved;
- the re-run: `npm run release:promote -- --target vX.Y.Z --push`, with `--remote` and
  `--stable` whenever the failed run used values other than the defaults. It reuses the
  tag and the branch, and ends with the publication steps, `latest dist-tag` included;
- or the pushes left: `git push <remote> <ref>` for the failed ref and every one after
  it.

The recovery names both kinds of failure and does not guess which one happened. The
re-run comes first because finishing by hand skips the printed publication steps, as
it did at `v0.33.0`.

**REFERENCE.md says the same.** It also corrects one sentence in the same paragraph:
the paragraph says the publish dry run reaches no registry, but with npm 11 the dry run
reads the registry and refuses a version already published.

### Files

- `ts/scripts/releasePromote.ts`: the budget, the recovery, the re-run command, and the
  rendering of a detail that spans lines.
- `ts/src/runtime/strategies/clone.ts`: the runner's timeout and the fetch.
- `ts/test/runtime/release.test.ts`, against local bare remotes:
  - a push slower than two seconds completes, and the promotion succeeds. The remote's
    `pre-receive` hook sleeps three seconds, on the tag's push only;
  - a push the remote refuses, in a promotion run with `--remote upstream` and
    `--stable release`, prints the recovery: the tag on the remote, the local tag and
    branch at HEAD, the re-run carrying both options, `git push upstream release`, and
    git's lines indented under the failed step;
  - a re-run after the refusal succeeds, reusing the tag and the branch, and ends with
    the publication steps.
- `ts/test/runtime/cloneStrategy.test.ts`, new: through a recording runner,
  `fetchUpstream` asks for the network budget and every other call of the strategy asks
  for none.
- `scripts/smoke_runtime_update.sh`: a new step, `runtime update --dry-run` with the
  clone's `origin` reached through a stand-in `ssh` that takes three seconds. The fetch
  passes and HEAD does not move. Before this change, that fetch fails with
  `ETIMEDOUT`.
- `REFERENCE.md`: the `release:promote` paragraph.
- This CR and its index row.

### Acceptance

- A push that takes longer than two seconds completes, and the promotion succeeds.
- A failed push leaves the tag and the branch at HEAD locally. Its step shows git's
  lines indented beneath it, and the recovery names what the remote took, both kinds of
  failure, the re-run with the run's own options, and the pushes left.
- A re-run with `--push` after a failed push succeeds without re-creating the tag or
  moving the branch, and prints the publication steps.
- The clone updater's fetch, in either lane, completes over a transport slower than two
  seconds, and every other command of the strategy keeps the local budget.
- `npm test`, typecheck, lint, the doc-link check, and the runtime updater smoke stay
  green.

### Validation Route

Navigator, with no GitHub and no registry write.

**The pushes.** The route uses a scratch clone at `v0.32.0`, which was tagged and
never published, so the publish dry run passes. Its `origin` is a local bare
repository whose hook sleeps three seconds and refuses `stable`.

```bash
rm -rf /tmp/cr132 && mkdir /tmp/cr132 && cd /tmp/cr132
git clone -q --branch v0.32.0 ~/dev/workspace/mirror-dev clone
git init -q --bare remote.git
printf '#!/bin/sh\nsleep 3\nwhile read old new ref; do [ "$ref" = refs/heads/stable ] && { echo "stable refused for the route" >&2; exit 1; }; done\nexit 0\n' > remote.git/hooks/pre-receive
chmod +x remote.git/hooks/pre-receive
cd clone && git remote set-url origin /tmp/cr132/remote.git
node ~/dev/workspace/mirror-dev/ts/scripts/releasePromote.ts --target v0.32.0 --push
printf '#!/bin/sh\nsleep 3\n' > /tmp/cr132/remote.git/hooks/pre-receive
node ~/dev/workspace/mirror-dev/ts/scripts/releasePromote.ts --target v0.32.0 --push
git -C /tmp/cr132/remote.git show-ref
cd ~ && rm -rf /tmp/cr132
```

Pass:

- First run: `[✓] push tag: v0.32.0` after about three seconds, then `[✗] push stable:`
  with git's lines indented beneath it, `stable refused for the route` among them. The
  recovery names the tag as on the remote, both kinds of failure, the re-run, and
  `git push origin stable`.
- Second run: `tag: v0.32.0 already at HEAD`, `stable branch: stable already at HEAD`,
  both pushes `✓`, the `publish` and `latest dist-tag` steps, and `success`.
- `show-ref` lists `refs/heads/stable` and `refs/tags/v0.32.0`.

**The fetch.** The updater smoke, from the development clone, with `MIRROR_USER`
unset. The smoke inherits it, and its package lane then fails on a home conflict that
has nothing to do with this CR ([Evidence](#implementation-and-the-drivers-checks-2026-10-14)):

```bash
env -u MIRROR_USER bash scripts/smoke_runtime_update.sh /tmp/cr132-smoke
```

Pass: the new step reports that the fetch passed through the three-second transport
and that HEAD did not move, and the smoke ends as it always does, with no failures.

Fail: an `ETIMEDOUT` anywhere, a failed run with no recovery, a re-run that re-creates
or refuses anything, or a smoke failure.

### Non-Goals

- The welcome card's update check. Its `ls-remote --tags` runs on the 2-second budget
  and `checkUpdateAvailability`'s `ls-remote` on the 120-second one, both at session
  start. Keeping the session start bounded is CR135's expected behavior, so it is
  settled there; the evidence is recorded in CR135.
- One policy inside `runGit` that picks the budget from the subcommand. It would change
  every caller's timeout at once, including the welcome card's, which CR135 has to
  bound.
- Telling a timeout from a rejection in code. The recovery names both and lets git's
  own lines say which one happened.
- Changing either budget's value.
- CR126, and the push of any other tool.

### Panel review (2026-10-14)

The Navigator requested this review before approval. The devops-engineer, engineer, and
quality-assurance lenses reviewed the Driver's draft. Each tested its claims against
the code, a scratch remote, and the updater smoke. Only dissent was recorded.

Synthesis: the plan restores the oracle's fix, and its shape is right. Its weak point
was the failure path it adds:

- the printed re-run could have re-run a different promotion;
- the recovery promised a re-run would fix failures it cannot fix;
- git's message broke the one-line-per-step output;
- the fetch half had no route the Navigator could watch.

The plan succeeds if a slow push and a slow fetch both complete, and a failed push
tells its reader exactly what is left, with commands that repeat the run that failed.

| Lens | Dissent | Resolution |
|---|---|---|
| engineer | **Blocker.** The printed re-run was `--target vX.Y.Z --push` alone. A promotion run with `--remote upstream` or `--stable next` would be re-run against `origin` and `stable`: another promotion, which creates or moves a different branch and pushes it to a different remote | The re-run repeats `--remote` and `--stable` whenever they are not the defaults. The refusal test runs with both options set and asserts the printed command |
| devops-engineer | The draft did not say whether the repair lane, which a person runs when the updater itself is broken, gets the fix. It does, because both lanes run the same `fetch` step, but the plan has to say so. And a refused push today prints git's whole message inside the step line, four lines with trailing spaces, so the list of steps stops being a list | The repair lane is named in the design and the acceptance. A detail that spans lines prints its first line on the step and the rest trimmed and indented beneath it |
| quality-assurance | The recovery promised a re-run for every failed push. A re-run fixes a push that timed out, since re-pushing an identical ref is `Everything up-to-date`, exit 0 (measured). It cannot fix a rejection: a tag of the same name at another commit is `! [rejected] ... (already exists)`, exit 1 (measured). And the fetch half had no route the Navigator could watch, only a unit test with its own transport | The recovery names both kinds of failure and promises neither, with no code that guesses which one happened. The slow transport moves into the updater smoke, so the fetch is proven through `runtime update` itself, in CI on both operating systems, and the Navigator runs the smoke as the fetch half of the route. The unit test keeps a recording runner and costs no time |

Not asked:

- the security-engineer: the change adds no trust boundary, since it runs the same
  commands against the same remotes and only waits longer;
- the database-architect, ai-engineer, and prompt-engineer: the slice has no data,
  model, or prompt;
- the product and experience designers: the output it changes is a maintainer's.

## Evidence

```text
$ npm run release:promote -- --target v0.33.0 --push
[✓] release doctor: 2 warning(s)
[✓] publish dry run: packed
[✓] tag: created v0.33.0 at HEAD
[✓] stable branch: fast-forwarded stable to HEAD
[✗] push tag: spawnSync git ETIMEDOUT
Release promotion result: failed
```

Finished by hand with the script's own commands: `git push origin v0.33.0` (new tag) and
`git push origin stable` (`c94a3f79..5d6fb590`). The same SSH remote took `git push origin
main` without trouble minutes earlier.

At selection (2026-10-14):

- **The oracle.** `521177f8` ("Give git network operations a network-appropriate
  timeout", 2026-07-13) gave `_git_push_ref` and `_git_fetch` a 120-second timeout,
  with `tests/unit/memory/cli/test_runtime_git_timeout.py`.
- **The port.** `releasePromote.ts`'s push and `clone.ts`'s `fetchUpstream`, through
  `defaultGitRunner`, call `runGit` with no timeout. Only `releaseNotes.ts`'s fetch and
  `git.ts`'s `ls-remote` pass `GIT_NETWORK_TIMEOUT_MS`.
- **Characterization on today's code.** The validation route's first run, at
  `v0.32.0`, printed `[✗] push tag: spawnSync git ETIMEDOUT` after about 2 s, with no
  recovery. Four seconds later the remote held `refs/tags/v0.32.0`. The promotion
  reported failure for a push that landed: the v0.30.1 incident, reproduced.
- **Why the route uses `v0.32.0`.** At `v0.33.0` the route stops at `publish dry
  run`, because npm 11.18's `npm publish --dry-run` reads the registry and refuses a
  published version ("You cannot publish over the previously published versions:
  0.33.0"). `npm view mirror-mind versions` lists `0.0.0-stage`, `0.0.1`, `0.32.1`,
  and `0.33.0`.

The panel's checks (2026-10-14), each run against scratch repositories:

- **Re-pushing a ref the remote already has** prints `Everything up-to-date`, exit 0.
  **Pushing a tag the remote holds at another commit** prints `! [rejected] v1.0.0 ->
  v1.0.0 (already exists)`, exit 1.
- **A fetch through a stand-in `ssh`** (`GIT_SSH_COMMAND` running a script that sleeps
  three seconds, then serves a local bare repository; `GIT_SSH_VARIANT=simple`), through
  `runGit`: with the local budget, exit 1 after 2.0 s, `spawnSync git ETIMEDOUT`; with
  the network budget, exit 0 after 3.1 s.
- **Both update lanes run the same `fetch` step.** `ORDINARY_LANE` and `REPAIR_LANE` in
  `ts/src/runtime/update.ts` both run `capture`, `fetch`, and `plan` before
  `dryRunStop`, so `runtime update --dry-run` fetches.
- **A refused push on today's code** (the route's remote, refusing `stable` without
  the sleep). The step carries git's whole message, and nothing follows it:

```text
[✓] push tag: v0.32.0
[✗] push stable: remote: stable refused for the route
To /tmp/cr132-refuse/remote.git
 ! [remote rejected]   stable -> stable (pre-receive hook declined)
error: failed to push some refs to '/tmp/cr132-refuse/remote.git'

Release promotion result: failed
```

### Implementation and the Driver's checks (2026-10-14)

What is now true:

- `release:promote`'s two pushes pass `GIT_NETWORK_TIMEOUT_MS`. A failed push shows
  git's message under its step, one line per line, and prints the recovery the plan
  describes. Its re-run carries `--remote` and `--stable` when they differ from
  `DEFAULT_REMOTE` and `DEFAULT_STABLE_BRANCH`, which are now named once and used by
  the CLI too.
- The clone strategy's `GitRunner` takes an optional timeout, and `fetchUpstream`
  asks for the network budget. Both update lanes run it.
- REFERENCE.md describes both, and npm 11's registry read in the publish dry run.

Checks:

- Red first. The slow push failed at `push tag` with `spawnSync git ETIMEDOUT`, the
  refused push printed an empty recovery, and the fetch asked for no budget. The re-run
  test passed before the change, because it pins the reuse the recovery relies on.
- `release.test.ts`: 19 of 19. `cloneStrategy.test.ts`: 2 of 2. `npm test`: 3,160
  pass, 0 fail, and 3 skipped, the machine-dependent ones.
- Typecheck, lint, the retired-surface tripwire, the pack guard (476 files), the
  doc-link check, `git diff --check`, and `bash -n` on the smoke are all clean.
- The updater smoke's step 2b, before the change (`dcddb33e`): `[✗] fetch: spawnSync
  git ETIMEDOUT`. After it (`3b16a510`, with `MIRROR_USER` unset): `[✓] fetch: origin
  main`, `Update result: success`, and HEAD unchanged. The whole smoke: 89 passed, 0
  failed, in 23 s.
- The Driver ran the push half of the [validation route](#validation-route) as
  written. The first run, after the three-second hook:

```text
[✓] push tag: v0.32.0
[✗] push stable: remote: stable refused for the route
    To /tmp/cr132/remote.git
    ! [remote rejected]   stable -> stable (pre-receive hook declined)
    error: failed to push some refs to '/tmp/cr132/remote.git'

Release promotion result: failed

Recovery:
- The tag v0.32.0 and the branch stable are at HEAD locally; v0.32.0 reached origin.
- A push that timed out may have landed anyway; pushing a ref the remote already has changes nothing.
- A push the remote rejected fails again until what the lines above name is resolved.
- To finish: npm run release:promote -- --target v0.32.0 --push (it reuses the tag and the branch, and ends with the publication steps)
- Or push what is left: git push origin stable
```

  The second run read `tag: v0.32.0 already at HEAD` and `stable branch: stable
  already at HEAD`, both pushes passed, `publish` and `latest dist-tag` followed, and the
  run ended with `success`. `show-ref` listed `refs/heads/stable` and `refs/tags/v0.32.0`.

A finding outside this CR, captured as
[CR137](cr137-the-updater-smoke-fails-on-a-machine-that-exports-mirror-user.md): on a
machine that exports `MIRROR_USER`, the updater smoke's package lane (section 6) fails
24 checks, because the smoke never clears the
variable. The message is "MIRROR_HOME (.../pkg-mirror-home) conflicts with MIRROR_USER
(vinicius-dev)". CI has no `MIRROR_USER`. The route runs the smoke with
`env -u MIRROR_USER`.

### Navigator validation (2026-10-14)

The Navigator ran both halves of the [validation route](#validation-route) in their own
shell, from 20:16 to 20:22.

- **The pushes.** The first run read `[✓] push tag: v0.32.0`, then `[✗] push stable:`
  with git's message indented beneath it, and the recovery exactly as the Driver's run
  printed it. The second run read `stable branch: stable already at HEAD`, both pushes
  passed, `publish` and `latest dist-tag` followed, and it ended with `success`.
  `show-ref` listed `refs/heads/stable` and `refs/tags/v0.32.0` at `78dd5836`.
- **The fetch.** `env -u MIRROR_USER bash scripts/smoke_runtime_update.sh
  /tmp/cr132-smoke`: step 2b read `[✓] fetch: origin main` and `Update result:
  success`, with HEAD unchanged. The smoke ended with 89 passed, 0 failed.

**Accepted by the Navigator**: both halves of the route, as run.

CI on `679c2b42`: Tests run `38614965867` passed (`ts` on ubuntu and macOS, and
`smoke`). The updater smoke's step 2b passed on both operating systems, each ending
with 89 passed and 0 failed. Docs run `38614965854` passed.

## Review

**Proportionality.** About forty lines of script, three in the clone strategy, five
tests, and one smoke step, for a defect that twice made a release report failure for a
push that had landed, and that could stop every clone's update on a slow link. The
panel's additions are the re-run's options, the two kinds of failure, and the indented
message. Each one closes a way the recovery could mislead the person reading it.

**Scope discipline.** The change touched the plan's files, plus the fetch the Navigator
folded in before planning finished. It made one correction in the same REFERENCE.md
paragraph, where npm 11's publish dry run reads the registry, and one capture, CR137.
CR135 gained the session start's two `ls-remote` budgets, as evidence only.

**Debt: none carried.** The Navigator accepted four named limitations at closure:

- Each git call still chooses its own budget. One policy inside `runGit` was ruled out
  because it would also lengthen the welcome card's checks, which CR135 has to keep
  bounded. Revisit when CR135 settles them.
- The smoke's step 2b needs `git-upload-pack` on the clone's restricted `PATH`. It is
  there on both CI runners and on this Mac, and a machine without it fails the step
  loudly.
- The slow cases cost about four seconds in the unit suite and four in the smoke.
- The recovery does not tell a timeout from a rejection. By design, git's own lines
  under the failed step say which one happened.

## Outcome

**Done 2026-10-14.** `release:promote`'s pushes and the clone updater's fetch, in both
update lanes, use git's 120-second network budget again, as the oracle's did. A failed
push shows git's message under its step, and its recovery says what is where, what each
kind of failure means, and how to finish with commands that repeat the run that failed.
The Navigator validated both halves of the route, and CI passed on `679c2b42`.

**Still to observe:** the next release's `release:promote --push` to GitHub over SSH,
the push that timed out at `v0.33.0`. Record here whether both pushes passed.

**Observed at `v0.33.1`, 2026-10-15: both passed.** `release:promote --target v0.33.1
--push` reported `push tag: v0.33.1` and `push stable: stable`, the whole promotion in
7 s, and `origin` showed the tag and `stable` at `4dfa4b35`.
