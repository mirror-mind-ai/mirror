[< Parent](../index.md)

# CV23.DS5 — Ariad Lifecycle Refresh

**Status:** ✅ Done
**Type:** Delivery Story

---

## Outcome

Represented Delivery, Explorer, and Refinement mutations request one post-commit
Operational refresh. Projection failure is bounded and observable but never
rolls back durable source truth.

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| [CV23.DS5.US1](cv23-ds5-us1-ariad-lifecycle-refresh/index.md) | Refresh Operational state after represented mutations | User Story | Consumers converge after durable mutations while source truth survives refresh failure | ✅ Done |

## Done Condition

- One coordinator owns compile, unchanged detection, publication, and bounded
  diagnostics.
- Delivery, Explorer, and Refinement mutation inventories request after commit
  exactly once when represented state changes.
- Read-only and excluded/private changes do not advance projection authority.
- Refresh failure never changes a successful source mutation result.
- DS2 remains the only publication/locking/rollback owner.
- Driver-owned specs and automated validation pass without Navigator review.

## Planning Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
