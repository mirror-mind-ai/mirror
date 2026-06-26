[< CV20.DS4](../index.md)

# CV20.DS4.TS5 — Cadence Profiles And Stop Policy

**Status:** ✅ Done
**Type:** Technical Story

---

## Outcome

Ariad method data and Builder runtime state distinguish lifecycle order from stop cadence, allowing `stepwise` testing and normal `checkpoint` cadence without relying on agent discretion.

---

## Context

During dogfooding, the Navigator manually drove `activate -> pull -> prepare -> plan`. That is useful for testing, but normal Ariad delivery should not require micro-managing internal phases. After a Pull choice, Builder should be able to run Pull + Prepare + Plan/Expand Decision and stop at the next real checkpoint.

---

## Scope

- Add cadence/stop policy definitions to the Builder method DSL.
- Declare baseline profiles:
  - `stepwise`: stop after every lifecycle phase; intended for testing/debugging.
  - `checkpoint`: auto-run internal phases and stop at method checkpoints; intended default.
- Declare future profiles as known but not active here:
  - `accelerated`.
  - `autonomous`.
- Declare checkpoint hardness/bypass policy for baseline gates.
- Persist selected cadence profile in runtime state per journey.
- Add inspect/set cadence commands for Ariad-adopted journeys.
- Ensure profiles change only stop cadence, not lifecycle order or hard gate semantics.

---

## Acceptance Behavior

```text
Given an Ariad-adopted journey
When the Navigator sets cadence to stepwise
Then Builder records stepwise cadence
And lifecycle commands stop after each phase
```

```text
Given an Ariad-adopted journey
When the Navigator sets cadence to checkpoint
Then Builder records checkpoint cadence
And Builder can continue internal phases until the next hard checkpoint
```

```text
Given a hard checkpoint such as Plan approval
When cadence is checkpoint
Then Builder still stops and requires the declared confirmation
```

---

## Validation

Focused unit tests for cadence model validation, adoption/runtime state, CLI inspect/set cadence, and stop policy resolution.

Evidence recorded during implementation:

```text
98 passed
ruff ok
format ok
mypy ok
```
