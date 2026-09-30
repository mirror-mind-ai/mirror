[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR112 — A scaffold cannot be told from authored content, and ordinary Plan approval never reads the plan

## Problem

Ariad writes three kinds of scaffold into a project and then protects them as if a
person had written them.

Expand writes a child story's `index.md` from a template
(`userStoryStatement`, `ts/src/builder/artifacts/storyIndex.ts:20`):

```text
As a user,
I want to npm distribution,
So that I can receive the value of this story.
```

Plan writes `plan.md` and `test-guide.md` the same way (`renderPlanArtifact`,
`renderTestGuideArtifact`, `ts/src/builder/artifacts/planArtifacts.ts`). None of the
three carries a mark. [CR079](cr079-preserve-authored-content-in-every-lifecycle-artifact.md)'s
rule, never overwrite an authored artifact, is implemented as never overwrite an
existing file, so a scaffold is protected exactly like an authored one, and nothing ever
tells the Driver that a file is still the template.

Nothing reads the files either. `build show` (`ts/src/builder/activeCheckpoint.ts`)
prints each record as present or missing and cannot say "present, and still the
scaffold". Ordinary `approve-plan` (`runApprovePlan`, `ts/src/builder/commands.ts`,
the branch without `--use-preauthorization`) calls `approvePlanCheckpoint` and never
opens `plan.md`, so an untouched scaffold is approvable. Only the preauthorized route
checks the plan (`unfilledPlanSectionsFor`, `ts/src/builder/planPreauthorization.ts`),
and it refuses placeholder bodies: the check exists, on one of the two paths.

## Expected Behavior

The runtime knows the bytes it would write, so it can tell a scaffold from anything else
without a marker in the file. `build show` and the Plan checkpoint report each artifact
as `scaffold` or `authored`: a file byte-identical to what Ariad would write for this
item today is a scaffold; so is a `plan.md` any of whose required sections still holds
its scaffold guidance, or an `index.md` whose story statement is still the template
sentence, since an edit elsewhere in the file does not author those. Ordinary
`approve-plan` refuses a `plan.md` in that state, in one line that names the file and
the sections to author, the way
[CR067](cr067-render-the-refused-checkpoint-not-a-hardcoded-implement-stage.md) taught
refusals to speak. The completeness rule is one implementation shared by both approval
routes, not a second definition of "placeholder". A scaffold is still never overwritten,
and an authored file is still never rewritten.

## Impact

Silent, the trust floor's first class: a placeholder can reach approval, and from there
implementation, with every surface saying present. CV22.DS10.US3's `index.md` held the
template sentence above from 2026-09-19 to 2026-09-30, eleven days, through a Pull and a
Prepare that read the package and reported nothing. Its siblings were authored by Driver
discipline, not by mechanism.

## Plan Or Decision

On the Ariad trust floor by the Navigator's decision of 2026-09-30
([Decisions](../../decisions.md#the-cv22-release-is-gated-on-an-ariad-trust-floor-worked-before-us3)).
First in floor order: it is the one change where a wrong state can advance.
[CR111](cr111-the-plan-checkpoint-renders-template-sentences-as-the-plan.md) prints the
answer this change computes.

## Evidence

Observed 2026-09-30 at `9dca47a0`. `git log` for
`docs/project/roadmap/cv22-typescript-core-port/cv22-ds10-python-retirement-npm-distribution/cv22-ds10-us3-npm-distribution/index.md`
shows the file written by DS10's Expand on 2026-09-19 (`05aa7ead`) and touched twice on
2026-09-25 to add the inheritance pointer and a `--journey` flag; the template statement
above survived both edits and was still the story's User Story on this day.
`build pull-item` and its Prepare reported `implementable: yes` and three terrain files
present. `build plan-item` reported `↻ existing story index` for that file, then wrote
`plan.md` and `test-guide.md` from the template. `build show` before and after showed
`○ plan.md` and `✓ plan.md`. `runApprovePlan`'s ordinary branch was read, not run: no
approval was given.

## Outcome

Pending.
