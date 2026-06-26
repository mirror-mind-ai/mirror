[< CV20.DS4](../index.md)

# CV20.DS4.US5 — Accelerated And Autonomous Cadence

**Status:** ✅ Done
**Type:** User Story

---

## Outcome

Navigator can deliberately switch an Ariad-adopted Builder journey into accelerated or autonomous cadence profiles, allowing the Driver to continue through bypassable stops while preserving hard method gates and visible runtime evidence.

---

## Context

Earlier DS4 work introduces deterministic Ariad lifecycle surfaces and the need for cadence profiles. The initial cadence implementation should support `stepwise` and `checkpoint` so testing and normal use are methodologically consistent.

This story activates conservative higher-autonomy profiles:

- `accelerated`: Driver may continue through soft stops until the next hard approval/evidence/closure checkpoint.
- `autonomous`: Driver may continue through bypassable checkpoints according to explicit policy, stopping only at hard constraints, unsafe operations, or Navigator-defined limits.

---

## Acceptance Behavior

```text
Given Builder Mode is active for an Ariad-adopted journey
And the journey has declared cadence/checkpoint hardness policy
When the Navigator selects accelerated cadence
Then Builder records the cadence profile
And continues through bypassable soft stops
And still stops at hard gates such as Plan approval, required validation evidence, unsafe operations, or Navigator decisions
```

```text
Given autonomous cadence is available for the journey
When the Navigator enables autonomous cadence with explicit limits
Then Builder records those limits
And surfaces which checkpoints may be bypassed
And stops when a hard gate, safety boundary, scope change, failing required check, or Navigator decision is reached
```

---

## Scope

- Add selectable `accelerated` cadence behavior.
- Add selectable `autonomous` cadence behavior only behind explicit Navigator opt-in.
- Respect method-declared checkpoint hardness and bypass policy.
- Persist cadence profile and limits in runtime state.
- Render cadence status and bypassed stops in Ariad surfaces.
- Provide audit trail for autonomous continuation.

---

## Out Of Scope

- Defining the initial cadence model for `stepwise` and `checkpoint`.
- Implementing core Plan/Validation/Done gates.
- Ignoring hard approval, safety, validation, or coherence boundaries.

---

## Implementation Notes

The implementation is intentionally conservative:

- `accelerated` is active and means continue through soft stops only until the next hard gate.
- `autonomous` is active only with explicit Navigator limits recorded in runtime state.
- Hard gates remain hard: Plan approval, Navigator validation acceptance, debt decisions, unsafe operations, scope changes, push/release, and Done/history boundaries.
- `continue-lifecycle` performs the first safe continuation behavior: in higher-autonomy cadence, it can move from `review_complete` through Coherence and, when Done/history evidence is supplied explicitly, through Done.

Manual dogfooding confirmed the accelerated lifecycle reached Done without crossing hard gates.
