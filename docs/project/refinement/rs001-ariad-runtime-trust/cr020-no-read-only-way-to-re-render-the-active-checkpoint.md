[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR020 — There is no read-only way to re-render the active checkpoint, and the refusals name the wrong reason

## Problem

Ariad surfaces are emitted exactly once, by the command that advances the
cursor. If the emission is lost between the runtime and the Navigator — the
agent filtered the output, a terminal scrolled, a tool call was truncated —
the surface cannot be produced again:

- A second `plan-item` on an already-planned item fails with
  `Error: Prepare must be completed before Plan`. Prepare **was** complete;
  the real reason is that the cursor already sits at the Plan checkpoint.
- A second `validate-item` after the Navigator's acceptance returns an
  `IMPLEMENTATION_GUARD` surface saying
  `Validation requires an approved Plan and completed implementation`. Both
  were true; the real reason is that the cursor had advanced to Debt Review.
- `done-item` emits `DONE_CHECKPOINT` followed by a long `PROJECT_POSITION`;
  neither can be shown again. `pull-candidates` renders a different surface.

The only recovery found in the session was `check-implementation`, whose
`IMPLEMENTATION_GUARD` happens to state the pending confirmation — a side
door, not a status command.

The transport invariant the agent operates under ("return every marked block
verbatim") assumes the block is recoverable if the agent slips. It is not, and
the runtime's refusal messages point diagnosis at the wrong precondition.

## Expected Behavior

- A read-only `build show` (or `build status`) that re-renders the active
  item's current checkpoint surface from cursor state — Plan, Validation, Debt
  Review, Done — without mutating anything, plus the roadmap position on
  request. Idempotent; safe to call any number of times.
- Refusals that name the **actual** state: "Plan already exists for
  `CV8.DS4.TS3`; the cursor is at `after_plan` awaiting `navigator_approval`
  — use `build show` to re-render it", rather than a precondition that is not
  the one that failed.

## Impact

Trust and recoverability. In the 2026-09-07 session two surfaces were lost to
output filtering (`PLAN_CHECKPOINT`/`ARTIFACTS_MATERIALIZED` for TS2;
`VALIDATION_CHECKPOINT`/`DEBT_REVIEW_STARTED` for TS3). Both times the agent
had to admit the loss to the Navigator and substitute an `IMPLEMENTATION_GUARD`
render as circumstantial evidence of the cursor state — a workaround that
proves the state without showing the checkpoint the Navigator was supposed to
approve or accept. The misleading refusal messages cost a second attempt each
time before the real cause was understood. Deterministic surfaces that exist
for one instant are deterministic in a way that does not help the reader
(CR009's argument, applied to time instead of place).

## Plan Or Decision

Pending. Rendering already exists per checkpoint; the change is a read-only
entry point that dispatches on the cursor's current checkpoint and confirmation
fields, and precise refusal text in `plan-item` / `validate-item` when the
cursor is past the requested step. Capture does not authorize implementation.

## Evidence

Session of 2026-09-07, journey `kia-desktop`:

```text
$ python -m memory build plan-item --method ariad --journey kia-desktop   # second call, TS2
Error: Prepare must be completed before Plan
```

```text
$ python -m memory build validate-item … --navigator-accepted             # second call, TS3
<<<ARIAD:IMPLEMENTATION_GUARD>>>
… missing checkpoint: Validation requires an approved Plan and completed implementation
```

`check-implementation` on the TS2 cursor returned `Implementation is blocked:
pending confirmation navigator_approval.` — the state the Navigator needed,
reached by a command meant for something else.

## Outcome

Pending.
