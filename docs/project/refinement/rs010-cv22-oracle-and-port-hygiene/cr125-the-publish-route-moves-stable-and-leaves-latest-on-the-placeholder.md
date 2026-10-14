[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR125 — The publish route moves `stable` and leaves `latest` on the placeholder

## Problem

`publish.yml` stages the package under the dist-tag the dispatcher names, and the
documented dispatch names `stable`, because the updater's package lane reads `stable`
(`runtime channel`). npm installs `latest` when no tag is given, and `latest` is what
Getting Started's one install line resolves to. Nothing in the route moves `latest`.

On 2026-10-11, after `mirror-mind@0.32.1` was approved and public under `stable`, the
registry read `{ latest: '0.0.1', stable: '0.32.1' }`: a stranger running
`npm install -g mirror-mind` received the placeholder published to take the name, three
files and no `bin`. The Navigator moved `latest` by hand (`npm dist-tag add
mirror-mind@0.32.1 latest`), with 2FA, after the Driver noticed.

## Expected Behavior

A release approved under `stable` is what `npm install -g mirror-mind` installs. Either
the staged publish carries `latest` as well, or the printed route (`release:promote`'s
last step and the workflow's summary) names the `dist-tag add` as a step of the release,
not something to notice. A rehearsal under `next` must still leave `latest` alone.

## Impact

High for the first stranger and invisible to everyone else: the updater follows
`stable` and existing installs were right; only the documented install line was wrong,
for the minutes between approval and the manual tag. It would have been wrong for days
had the scratch-prefix verification been skipped.

## Plan Or Decision

The decision to take first: whether `latest` is a second tag the stage carries
(npm stages one tag per publish; a second needs `dist-tag add` after approval, which the
trusted publisher cannot run, so it is a maintainer step either way) or a step the route
prints. Printing is the smaller change and keeps every registry mutation a human act,
which is the publish decision's rule. Captured without selecting.

**Decided 2026-10-14 by the Navigator: `latest` is a step the route prints, not a tag the
stage carries.** npm confirms the premise: a stage has one tag, immutable once staged,
and `npm stage approve` takes only `--otp` ([Evidence](#evidence)). The trusted publisher
is granted `npm stage publish` alone. A second tag is therefore a maintainer's
`npm dist-tag add` with 2FA, however the route is built. Staging under `latest` and adding
`stable` by hand would move that step, not remove it, and would make the forgotten step
the updater's, which no existing install would notice, instead of the install line's.
So the stage keeps `stable`, and the route names `latest` as a step of the release.

Selected 2026-10-14. The plan below was reviewed by a four-lens panel the same day
([record below](#panel-review-2026-10-14)), and its findings are folded in.
**Approved 2026-10-14 by the Navigator**, including the tag guard the panel added.
Driver `@viniciusteles` and Delivery `main` were assigned in the same turn.

### Objective

Both places that print the route tell the person releasing that a release under
`stable` ends with npm's `latest` moved to the same version, and how to see that it
moved. A rehearsal under `next` is told that `latest` stays. The workflow stages under
no other tag.

### Design

**`release:promote` prints `latest` as a step of its own, by the rule the workflow
uses.** After `publish` comes a `latest dist-tag` step, also `skip`: printed, never run.
When the channel is `stable`, it says: once the version is public under `stable`, run
`npm dist-tag add mirror-mind@<version> latest` with 2FA, because `npm install -g` reads
`latest` and the updater reads `stable`; then `npm view mirror-mind dist-tags` shows
both at `<version>`. "Once public" holds on both of `publish`'s paths: the staged
approve, and `dist-tag add … stable` for a version already on the registry. For any
other channel (`--stable next` prints a rehearsal's route today) it says that `latest`
stays where it is. The step is printed in every mode that prints the publish plan
(local, `--push`, `--dry-run`), and the script still runs no registry command. Its name
says `dist-tag` because the same route also marks a GitHub Release `--latest`, which is
a different thing.

**The publish workflow refuses an unknown tag and ends with what a maintainer does
next.** A first step refuses any `dist_tag` other than `stable` (a release) or `next`
(a rehearsal), before any npm command. A tag cannot be changed once staged, so a
dispatch under `latest` or a typo would stage a version the updater never sees. A last
step, after `Stage with provenance`, writes to the run log and to `$GITHUB_STEP_SUMMARY`:

1. `npm stage list mirror-mind`, to find the stage id;
2. `npm stage approve <id>`, with 2FA;
3. for `stable` only, `npm dist-tag add mirror-mind@<version> latest`, with 2FA;
4. `npm view mirror-mind dist-tags`.

For `next` it says that `latest` stays where it is. The name and version come from the
committed `package.json`, the file the stage packed. Nothing parses npm's output, which
npm documents no format for. Every step reads the input through `env`, including the
two existing steps, instead of interpolating it into a script. The header comment's
approve steps gain the `latest` line, and the input's description names both tags.

**The docs that describe the route say the same.** REFERENCE.md's `release:promote`
paragraph still names `npm publish --tag stable` as the printed plan, untrue since the
2026-10-10 rehearsal; it is corrected to the staged route and the `latest dist-tag`
step. The publish decision gains a dated paragraph recording this one, and npm's rule
that trust tokens cannot run `npm stage` subcommands. The release chain in
engineering-principles, which names no npm step at all, gains one.

### Files

- `ts/scripts/releasePromote.ts`: `publicationPlan` returns the `publish` and
  `latest dist-tag` steps; comments.
- `ts/test/runtime/release.test.ts`:
  - the execute, `--push`, and dry-run tests assert the `latest dist-tag` step after
    `publish`, its version, the `npm view` check, and that npm is asked for nothing but
    the dry run;
  - a new test promotes with `stableBranch: "next"` and asserts that `latest` stays.
- `.github/workflows/publish.yml`: the tag guard, the summary step, `env` for the input,
  the header comment, the input description.
- `REFERENCE.md`: the `release:promote` paragraph.
- `docs/project/decisions.md`: a paragraph in the publish decision.
- `docs/process/engineering-principles.md`: the release chain.
- This CR and its index row.

### Acceptance

- With the channel `stable`, `release:promote` prints a `latest dist-tag` step after
  `publish`, naming `npm dist-tag add mirror-mind@<version> latest` and `npm view
  mirror-mind dist-tags`, in execute, `--push`, and `--dry-run` modes.
- With any other channel, the step says that `latest` stays where it is and names no
  `dist-tag add … latest`.
- `release:promote` runs no npm command except `publish --dry-run`, in any mode.
- The workflow refuses a `dist_tag` other than `stable` or `next` before its first npm
  command.
- For `stable`, the workflow's summary names the approve, the `latest` step, and the
  `npm view` check. For `next`, it says that `latest` stays.
- No step interpolates `inputs.dist_tag` into a script, and `actionlint`, which runs
  shellcheck on every `run:` block, is clean.
- REFERENCE.md describes the route the script prints.
- `npm test`, typecheck, lint, and the doc-link check stay green.

### Validation Route

Navigator, in the development clone, at the `v0.33.0` release commit, with no registry
or remote touched:

```bash
git worktree add --detach /tmp/cr125-v0.33.0 v0.33.0
cd /tmp/cr125-v0.33.0
node ~/dev/workspace/mirror-dev/ts/scripts/releasePromote.ts --target v0.33.0 --dry-run
node ~/dev/workspace/mirror-dev/ts/scripts/releasePromote.ts --target v0.33.0 --stable next --dry-run
cd - && git worktree remove /tmp/cr125-v0.33.0
```

Pass:

- Both runs end with `Release promotion result: success`.
- In the first run, the last two lines are `[-] publish: …`, naming `dist_tag=stable`,
  and `[-] latest dist-tag: …`, naming `npm dist-tag add mirror-mind@0.33.0 latest` and
  `npm view mirror-mind dist-tags`.
- In the second run, `publish` names `dist_tag=next`, and `latest dist-tag` says that
  `latest` stays.
- The second run's doctor shows one warning, because `origin/next` does not exist. That
  warning is expected.

Fail: a missing `latest dist-tag` line, another version in it, a `latest` move under
`next`, or a `✓` or `✗` on either line. The `-` mark means printed, not run.

The workflow half cannot be observed without a dispatch, and a dispatch under `stable`
or `next` stages on the registry. Evidence stands in for it:

- `actionlint`, with shellcheck;
- the guard's and the summary's shell, run locally for `stable`, `next`, and a typo.

Decided at approval (2026-10-14): that evidence is enough for CR125 to close, and the
Navigator still reads it at validation. The first real summary is read at the next
release and recorded under Outcome.

### Non-Goals

- Moving `latest` from CI, or any registry mutation by a script. Trust tokens cannot
  move it, and the publish decision keeps registry mutations human.
- An automated check that `latest` equals `stable` after a release, in
  `release:doctor`, `runtime diagnose`, or the update check. The route prints the
  `npm view` command that would show a mismatch. A check that runs on its own is the
  next step if a release misses `latest` again.
- The `release` environment's deployment-branch policy:
  [CR136](cr136-the-release-environment-takes-a-dispatch-from-any-ref.md).
- Deprecating the `0.0.1` placeholder.
- CR132 (`release:promote`'s push timeout) and CR126 (the tripwire on docs-only
  pushes): the same route, separate CRs.

### Panel review (2026-10-14)

The Navigator requested this review before approval. The devops-engineer,
security-engineer, quality-assurance, and engineer lenses reviewed the Driver's draft.
Each tested its claims against the files, npm's own documentation (npm 11.18.0), and
the repository's GitHub settings. Only dissent was recorded.

Synthesis: the decision stands. Every lens agreed that `latest` cannot be the stage's
second tag, and that a printed step keeps every registry mutation human. The draft fell
short in three ways:

- it applied its own rule in one place, conditioning `latest` on `stable` in the
  workflow while printing it unconditionally from the script;
- it told the person releasing to move `latest` without saying how to see that it
  moved;
- it planned to validate a workflow it never ran.

The plan succeeds if every route that ends a `stable` release names `latest` and the
check that shows it, and no route under another tag tells anyone to move it.

| Lens | Dissent | Resolution |
|---|---|---|
| engineer | **Blocker.** The draft printed `latest` unconditionally because "`release:promote` is only the stable route", but `--stable <name>` is a documented option. Run at `v0.33.0` today, `--stable next` prints a rehearsal's route (`dist_tag=next`), so the draft would have told a rehearsal to move `latest`, against this CR's expected behavior. The step also said "after the approve", which is false on `publish`'s other path, a `dist-tag add … stable` for a version already public | One rule in both places: `latest` moves only for `stable`. The step says "once the version is public under `stable`", which holds on both paths. A test promotes with `next` |
| devops-engineer | The step told the person releasing to act and gave no way to see the result. A scratch-prefix install found the defect, and the Impact section says that check could have been skipped. The draft also named the step `latest` in a route whose GitHub Release is marked `--latest` | The route ends with `npm view mirror-mind dist-tags` and the version both tags must show. The step is named `latest dist-tag`. The stage id comes from `npm stage list`: npm documents no output format for `stage publish`, and a change in npm's output already broke the pack guard once |
| security-engineer | The draft moved the input to `env` in its new step and left two steps interpolating `${{ inputs.dist_tag }}` into a shell. The input is also unvalidated, so a dispatch under `latest` or a typo stages under a tag that cannot be changed, and that version never reaches the updater. The realistic risk is low, because three human gates come first: write access to dispatch, the `release` environment's reviewer, and `npm stage approve` with 2FA. The boundary should still be explicit | Every step reads the input through `env`. A first step refuses any tag but `stable` or `next`, before any npm command |
| quality-assurance | The workflow half had no observable validation. Its "local run" was a copy of the YAML, not the workflow, and nothing said whether CR125 could close before a real dispatch. The route's fail condition, "a step that ran rather than printed", cannot be seen in a dry run | `actionlint` runs shellcheck on every `run:` block, and the guard and the summary are run locally for `stable`, `next`, and a typo. The split is named, and the Navigator decides at validation. Pass and fail are read from the marks (`-` means printed). The route adds a `--stable next` run |

One security finding is outside this CR. The `release` environment has a required
reviewer and no deployment-branch policy, so any ref can be dispatched into it.
Rehearsals use branches, so restricting it is a policy decision, not a fix. It is
captured as [CR136](cr136-the-release-environment-takes-a-dispatch-from-any-ref.md),
not folded in.

Not asked:

- the database-architect, ai-engineer, and prompt-engineer: the slice has no data,
  model, or prompt;
- the product and experience designers: nothing a person sees changes, and the install
  line is right whenever the route is followed;
- the writer: its domain is the Navigator's own prose.

## Evidence

- 2026-10-11 20:18Z: `npm stage publish . --provenance --tag "stable"` staged
  `mirror-mind@0.32.1`; approved by the Navigator; `npm view mirror-mind dist-tags` read
  `{ latest: '0.0.1', stable: '0.32.1' }`; `npm install -g --prefix /tmp/… mirror-mind`
  installed `0.0.1` with no `bin`.
- After `npm dist-tag add mirror-mind@0.32.1 latest`: `{ latest: '0.32.1', stable:
  '0.32.1' }`, and a scratch install ran `mirror`, `init`, `seed` (20 created), `list
  personas` (12), `runtime status` (`Install: package (mirror-mind@0.32.1)`).
- 2026-10-14, `v0.33.0`: the Navigator approved `latest` as a step of the release,
  carried by this CR's lesson; the printed route still did not name it
  ([worklog](../../../process/worklog.md)).
- 2026-10-14, npm 11.18.0, `npm help stage`, "Tag Behavior": a staged package's tag "is
  an immutable property", one per stage; `npm stage approve --help` lists `--otp` and
  `--registry` only.
- 2026-10-14, before the change: in a detached worktree at `v0.33.0`, `releasePromote.ts
  --target v0.33.0 --dry-run` ends with the `publish` step and no `latest` step. With
  `--stable next`, the doctor reports one warning, and `publish` prints `gh workflow run
  publish.yml --ref v0.33.0 -f dist_tag=next`, a rehearsal's route.
- 2026-10-14, the panel's checks:
  - npm's "Trust Relationship Permissions": short-lived trust tokens "can only be used
    with `npm stage publish` and `npm publish`" and "cannot run `npm stage`
    subcommands".
  - npm documents no output format for `npm stage publish`.
  - `gh api repos/mirror-mind-ai/mirror/environments/release`: the protection rules are
    `required_reviewers` only, and `deployment_branch_policy` is `null`.
  - `actionlint` 1.7.12 with shellcheck 0.11.0 is clean on `publish.yml` before the
    change.
- `.github/workflows/publish.yml` input `dist_tag`; `ts/scripts/releasePromote.ts` final
  printed step;
  [the publish decision](../../decisions.md#the-npm-package-is-published-by-staging-from-ci-with-provenance-and-a-maintainer-approves-with-2fa).

## Outcome

Pending.
