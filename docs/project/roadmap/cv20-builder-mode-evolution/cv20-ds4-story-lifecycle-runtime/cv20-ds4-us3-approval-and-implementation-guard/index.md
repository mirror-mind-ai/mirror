[< CV20.DS4](../index.md)

# CV20.DS4.US3 — Approval And Implementation Guard

**Status:** ✅ Done
**Type:** User Story

---

## Outcome

Navigator can approve a Plan checkpoint through a deterministic Builder command, and Builder refuses implementation unless the active item has an approved Plan compatible with the current cadence and granularity decision.

---

## Context

The current guard can block implementation while `pending_confirmation=navigator_approval`, but there is no deterministic approval transition that clears the gate and records the approval event. Without this, implementation unlock remains conversational and inconsistent.

---

## Acceptance Behavior

```text
Given a Plan checkpoint is pending Navigator approval
When the Navigator approves the Plan
Then Builder records the approval in runtime state
And clears pending confirmation
And records last delivery event plan_approved
And renders an approval surface with the next allowed phase
```

```text
Given implementation is requested
When there is no approved Plan for the active item
Then Builder refuses implementation
And explains which checkpoint is missing
And does not mutate project files
```

```text
Given implementation is requested
And the active Plan has been approved
When Builder checks implementation permission
Then the guard allows implementation to begin
```

---

## Scope

- Add `approve-plan` command for Ariad-adopted journeys.
- Persist approval transition in the delivery cursor/runtime state.
- Strengthen `check-implementation` to require approved Plan state, not merely absence of pending confirmation.
- Render deterministic approval/guard surfaces.
- Respect hard checkpoint policy regardless of cadence profile.

---

## Out Of Scope

- Implementing the story changes.
- Running validation.
- Review/Coherence/Done closure.

---

## Validation

Focused unit and CLI tests for approval transition, refusal without approval, allowance after approval, and no mutation during refusal.

Validated with:

```text
uv run pytest tests/unit/memory/cli/test_build.py tests/unit/memory/builder/test_lifecycle.py -q
50 passed
```
