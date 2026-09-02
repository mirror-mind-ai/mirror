[< Parent](../index.md)

# CV23.DS5.US1 — Refresh Operational State After Represented Mutations

**Status:** ✅ Done
**Type:** User Story

---

## User Story

As a read-only Journey consumer,
I want Operational state refreshed after Ariad source mutations,
So that I see committed delivery state without projection availability becoming
mutation authority.

## Outcome

One post-commit coordinator converges represented state, skips unchanged content,
and contains failures without changing the successful source mutation.

## Acceptance Behavior

```text
Given a represented lifecycle mutation commits
When Operational refresh succeeds
Then consumers observe the new source revision
And exactly one refresh request was made after commit

Given refresh fails
When the source mutation returns
Then durable source truth remains committed
And previous projection authority or explicit DS2 divergence is preserved
And diagnostics remain bounded and payload-free
```

## Scope

- Generic Store callback boundary.
- Operational refresh coordinator and active-work adapter.
- Delivery cursor mutation inventory.
- Explorer public-state mutation inventory.
- Refinement logical-mutation inventory.
- Unchanged-content deduplication and bounded diagnostics.

## Out Of Scope

- Sibling Delivery Story scope.

## Validation

Driver-owned unit, integration, concurrency, failure, inventory, full regression,
and unchanged external-contract checks. Navigator delegated validation.
