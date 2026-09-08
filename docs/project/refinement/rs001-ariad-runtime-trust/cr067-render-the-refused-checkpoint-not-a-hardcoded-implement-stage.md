[< RS001](index.md) · [Refinement Workbench](../index.md)

# CR067 — Render the refused checkpoint, not a hardcoded Implement stage

**Status:** captured
**RS:** RS001
**Driver:** —
**Delivery:** —

## Problem

`cmd_validate_item` catches **every** `ValueError` raised by
`validate_lifecycle_item` and renders it through one error path
(`src/memory/cli/build.py:1792`):

```python
except ValueError as exc:
    print(render_implementation_guard_blocked(str(exc)))
    sys.exit(1)
```

`render_implementation_guard_blocked` hardcodes its lifecycle ribbon and its
boundary sentence:

```text
Delivery Flow: ✓ Pull → ✓ Prepare → ✓ Expand → ✓ Plan → ◉ Implement → ○ Validate → ○ Debt Review → ○ Done
boundary: No implementation files may be mutated until the guard allows Implement.
```

So a refused Validation is reported as "you have not implemented yet",
whatever the actual reason and whatever the cursor actually says. Observed on
`mirror-ts-core` with the delivery cursor at `last_delivery_event =
coherence_complete`, one step from Done: calling `validate-item` again renders
the surface above, placing the item at **Implement** — five stages behind where
it is. Reproduced twice, deterministic.

The refusal itself is correct: re-validating a completed checkpoint should be
refused, and the raise happens before any persistence, so nothing is mutated
(cursor generation and `last_delivery_event` were verified unchanged after the
reproduction). Only the rendering is wrong.

## Expected Behavior

A refused checkpoint renders the lifecycle position the cursor actually holds,
and a boundary sentence describing the refusal that occurred.

`render_implementation_guard_blocked` is the right surface for exactly one
condition — implementation attempted before Plan approval. It is the wrong
surface for "already validated", "pending a different confirmation", or
"missing implementation evidence", which are different refusals at different
stages and currently share one misleading rendering.

## Impact

This is a trust-boundary defect, the same family as CR003. Ariad's premise is
that a deterministic surface is the reliable rendering of runtime state; here
the surface contradicts the state it claims to describe.

The concrete cost is a false alarm that looks exactly like a serious one. A
reader who trusts the surface over the database concludes the delivery cursor
was reset or lost, and goes looking for state corruption that never happened.
That is what occurred on CV22.DS7.TS3: the surface was read as evidence of two
diverging cursors, and only a direct read of
`__builder_delivery_cursor__:mirror-ts-core` showed a single healthy row at
`coherence_complete`. An error path that manufactures a plausible-looking
emergency is worse than one that says nothing.

## Plan Or Decision

Distinguish the refusals instead of collapsing them:

- Give the lifecycle's refusal reasons distinct identities (an exception type
  or a reason code per branch) rather than a bare `ValueError` string.
- Render the guard from the CURSOR — its `last_delivery_event` decides the
  ribbon — so a refusal at Coherence renders at Coherence.
- Keep `render_implementation_guard_blocked` for the implement-before-approval
  condition it was written for, and add a refusal surface for a checkpoint
  declined at its own stage.
- Fix the siblings in the same change. `cmd_review_item`, `cmd_coherence_item`,
  and `cmd_done_item` were checked and carry the identical shape — every
  `ValueError` routed to `render_implementation_guard_blocked`, at two call
  sites each. Together with `cmd_validate_item` that is eight sites, so a
  refusal at Debt Review, Coherence, or Done renders `Implement` exactly as
  Validation does. Whichever stage a reader meets first, the surface is wrong.

The codebase already contains the alternative convention: `cmd_approve_plan`
handles the same exception type with a plain `Error: {exc}` on stderr and no
fabricated ribbon. Adopting that shape would be a strict improvement even
without a new surface; a stage-aware refusal surface is the better end state.

A regression test should assert that a refusal at a known cursor position
renders that position, not a constant one.

## Evidence

_Pending._

## Outcome

_Pending._

## Provenance

Found on 2026-09-08 during CV22.DS7.TS3, after a stray `validate-item` call
rendered `Implement` for an item at `coherence_complete`. Captured after that
story's Debt Review closed, as its own finding rather than retrofitted into it.

One adjacent observation, recorded because it is unexplained rather than
diagnosed: a `validate-item` call made without `--journey` in the same session
failed with `Builder method validation requires a journey`, while journey
resolution through `resolve_operating_session_id` / `get_active_mode` verified
correct immediately afterwards and has not reproduced since. It may be
unrelated to this CR.
