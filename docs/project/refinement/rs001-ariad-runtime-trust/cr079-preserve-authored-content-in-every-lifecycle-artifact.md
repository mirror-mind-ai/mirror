[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR079 — Preserve authored content in every lifecycle artifact, not one at a time

**Status:** captured
**RS:** RS001
**Driver:** —
**Delivery:** —

## Problem

Ariad lifecycle commands regenerate their story-package artifact from the
arguments they are given, replacing whatever a Driver had authored there. The
project has met this three times now, at three stages, and has fixed it twice —
each time for one artifact:

| Stage | Artifact | Record | State |
|---|---|---|---|
| Plan materialization | `index.md` | [CR004](cr004-preserve-authored-story-index.md) | captured, open |
| Plan approval | `plan.md` | [CR015](cr015-preserve-driver-authored-plan-before-approval.md) | promoted → CV20.DS15/DS16, **done** |
| Validation | `validation.md` | this CR | — |

The third instance, 2026-09-12, during CV22.DS8.US3's closure: `build
validate-item` replaced a 235-line authored `validation.md` with its 33-line
generated summary. Lost in the overwrite were the per-probe result tables, a
cross-engine ledger comparison against the home's own Python-written rows, the
two environmental traps the validation had surfaced, and the step-by-step
outcomes of seven Navigator-run steps. It was recoverable only because the
authored version happened to have been committed before the lifecycle commands
ran.

The pattern is not "three bugs". It is one missing rule, patched per artifact
as each instance is met. CV20.DS15 delivered Plan preservation; nothing
generalized it, so `index.md` is still open and `validation.md` was never
considered. `review.md`, `coherence.md`, `done.md`, and `handoff.md` have the
same shape and have simply not been authored by hand yet in a story that also
ran their command.

## Expected Behavior

A lifecycle command owns its own generated sections and nothing else. Given an
existing artifact, it updates the fields it generates and leaves every other
byte alone; given no artifact, it writes its scaffold as today.

Stated as the rule rather than as three fixes: **no Ariad command replaces
content it did not write.** The natural shape is a marked, regenerable region —
the runtime's contract fields — with authored narrative outside it, which is
how `validation.md` was reassembled by hand after this instance.

A weaker but acceptable form, if merging proves costly: refuse to overwrite a
file whose content diverges from the scaffold the command would have produced,
and name the file. A refusal is recoverable; a silent replacement is only
recoverable through git, and only if the author happened to commit first.

## Impact

Medium, and it is the trust kind rather than the correctness kind. Nothing is
corrupted and nothing ships wrong — the loss is Driver work, and the damage is
to the belief that running the lifecycle is safe. A Driver who has been bitten
once starts copying files before running commands, which is exactly the
defensive ritual a runtime is supposed to make unnecessary.

The exposure grows as story packages get richer. US3's `validation.md` held
evidence that cost real money to produce: eight live provider probes and four
writes against a real home. Regenerating it discarded the record of spend that
had already happened.

## Plan Or Decision

Not planned. Two decisions belong to whoever takes it:

1. **Merge or refuse.** Marked regenerable regions preserve the most and cost
   the most; refuse-and-name is cheap and leaves the Driver to merge by hand.
2. **Whether CR004 folds into this.** CR004 is the same rule at the Plan stage
   for `index.md`. If this CR is taken as the general rule, CR004 should be
   superseded by it rather than fixed separately — a fourth per-artifact patch
   is the thing this CR exists to stop. CV20.DS15's delivered Plan preservation
   is the reference implementation to generalize from, not to duplicate.

## Evidence

- `docs/project/roadmap/cv22-typescript-core-port/cv22-ds8-live-provider-cutover/cv22-ds8-us3-long-tail-cutover-and-gate-consolidation/validation.md`
  — carries a closing note describing the overwrite and the restoration; its
  current structure (contract fields first, authored evidence below) is the
  hand-made version of the merge this CR asks the runtime to perform.
- Commit `96c6991b` — the restoration, with the diff showing 235 lines replaced
  by 33.
- [CR004](cr004-preserve-authored-story-index.md),
  [CR015](cr015-preserve-driver-authored-plan-before-approval.md) — the two
  earlier instances.

## Outcome

_Pending._

## Provenance

Found on 2026-09-12 while closing CV22.DS8.US3, by running the Ariad lifecycle
on a story whose validation evidence had been authored by hand first. Captured
at the Navigator's request after the same session's Debt Review, because the
instance is fixable in place but the rule is not, and the next authored
artifact will meet it again.
