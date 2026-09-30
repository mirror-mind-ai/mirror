[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR111 — The Plan checkpoint renders template sentences as the plan

## Problem

`build plan-item` renders `PLAN_CHECKPOINT` with `plan`, `scope`, `non-goals`,
`acceptance`, `validation`, and `implementation contract` fields, each line marked `✓`.
None of them comes from a plan. `roadmapPlanContext` (`ts/src/builder/commands.ts:741`)
composes them from fixed sentences with the item's title pasted in:

```text
plan        Plan the smallest coherent, testable slice for npm distribution.
scope       ✓ Deliver npm distribution as an observable slice.
acceptance  ✓ Given the starting state needed for npm distribution
            ✓ When the Navigator exercises npm distribution
            ✓ Then the planned observable behavior is visible
```

`planLifecycleItem` (`ts/src/builder/plan.ts`, the `report` it builds) carries a second
set of defaults for the same fields, used when the command passes none. The only field a caller can set is
`--objective` (`ts/src/builder/argv.ts:188`). Nothing reads `plan.md`: not at Plan, and
not later, since `build show` reports the file present or missing and never its content.

So the surface cannot show a real plan, even after the Driver has written one. Ariad's
design is scaffold-then-author: Plan writes `plan.md` where no file exists and the Driver
authors it ([REFERENCE — Builder lifecycle artifacts](../../../../REFERENCE.md#builder-lifecycle-artifacts)).
The card, however, presents the scaffold's sentences as scope and acceptance, checked
off. The Builder skill's transport rule then puts that card in front of the Navigator
verbatim, above whatever the Driver wrote. At the one gate where the Navigator approves a
plan, the surface looks like a plan and is not one.

[CR019](cr019-plan-checkpoint-states-untruths-about-the-target-project.md) removed two
untruths from this card, the parent listed as a sibling and two Mirror-only contract
lines. These survived because the words are literally in the scaffold the command wrote.

## Expected Behavior

The Plan checkpoint states what the runtime knows. When the command wrote a scaffold, the
card says so and names the sections the Driver must author — Scope, Non-Goals,
Acceptance Behavior, Validation Route, Implementation Contract — with no `✓` beside text
nobody has written. When `plan.md` already exists and is authored (see
[CR112](cr112-a-scaffold-cannot-be-told-from-authored-content-and-approve-plan-never-reads-the-plan.md)),
the card says that instead, and names the file as where the plan is read. The two sets
of default sentences collapse into one, or into none: a scaffold's section guidance is
one string per section, printed once, in the file.

## Impact

Wrong at the decision point, the trust floor's second class. A Navigator who reads the
card rather than the file can approve a plan that consists of the item's title in five
template sentences. Ordinary `approve-plan` would accept it (CR112). The card is also
what the Driver transports verbatim in every Plan turn, so the untruth is repeated on
every story.

## Plan Or Decision

On the Ariad trust floor by the Navigator's decision of 2026-09-30
([Decisions](../../decisions.md#the-cv22-release-is-gated-on-an-ariad-trust-floor-worked-before-us3)).
Planned together with CR112, whose scaffold-or-authored answer this card prints.

## Evidence

Observed 2026-09-30 at `9dca47a0`, planning CV22.DS10.US3 in this repository. The card
above is the one rendered; `plan.md` did not exist before the command and held the same
five sentences after it. The Driver then authored a 569-line plan, and no surface can
show any of it: `build show` prints `○ plan.md` before the command and a present mark
after, nothing more.

## Outcome

Pending.
