[< Parent](../index.md)

# CV20.DS15.TS2 — Cursor-Bound Exact-Scope Authorization Receipt

**Status:** ✅ Done
**Type:** Technical Story

---

## Technical Story

In order to carry explicit Navigator authority safely across Plan materialization,
as the Ariad runtime,
I want one bounded receipt attached to an active-item cursor generation,
so that authority cannot drift to another Journey, item, flow, child set, Plan
contract, or stop boundary.

## Outcome

`PlanPreauthorizationReceipt` persists only bounded structural coordinates and a
canonical SHA-256 scope fingerprint. Every Pull advances `cursor_generation`,
including a re-Pull of the same item. Child identity is canonicalized as a set;
authored order remains available on the cursor for presentation.

## Acceptance Behavior

```text
Given explicit exact-scope Delivery Story authority
When Ariad records the receipt
Then Journey, method, generation, item, level, flow, canonical child set,
Plan contract, policy, and fixed stop are bound
And no prompt, Plan body, reasoning, identity, conversation, secret, or path is stored
```

```text
Given the same item is pulled again
When its cursor is persisted
Then its generation advances
And prior pending authority is invalidated
```

## Scope

- Typed receipt serialization and conservative malformed-data handling.
- Active-item Pull generation.
- Exact structural fingerprint.
- Central preservation and coordinate-change invalidation.

## Out Of Scope

- Raw language receipts.
- Semantic Plan equivalence.
- General delegation policy storage.

## Validation

Focused tests: `test_delivery_cursor.py`, `test_lifecycle.py`, and receipt tests in
`test_delivery_story_plan.py`. Aggregate validation was accepted by the Navigator.
