# Delivery Story Plan — CV23.DS5

**Journey:** mirror-mind-development
**Method:** ariad
**Cadence:** accelerated
**Navigator Flow Unit:** delivery_story
**Validation owner:** Driver, delegated by Navigator

## Objective

Connect represented Delivery, Explorer, and Refinement mutations to one
post-commit Operational refresh coordinator. Source truth commits first;
projection failure never rolls it back. Equivalent projected content is
recognized as unchanged rather than publishing a meaningless new snapshot.

## Work Package

- CV23.DS5.US1 — Refresh Operational state after represented mutations

## Architecture

```text
represented mutation commits
          ↓
Store.request_projection_refresh(journey)
          ↓
ProjectionRefreshCoordinator
  ├─ read durable Delivery cursor
  ├─ compile registered Operational document
  ├─ compare current sourceRevision
  └─ publish through DS2 only when changed
          ↓
published | unchanged | failed (bounded, never raised to source mutation)
```

`Store` owns only a generic optional post-commit callback seam. It does not
import projection code. `MemoryClient` wires the production coordinator after
Journey services exist. Domain mutations request refresh only after their own
commits complete.

## Represented Mutation Inventory

### Delivery

`set_delivery_cursor` and `clear_delivery_cursor` are the single durable owner
for active item, checkpoint, pending confirmation, and last event. They request
refresh exactly once only when that projected tuple changes. Cadence, limits,
flow-unit metadata, and other non-projected cursor changes do not request it.
This covers Pull, Prepare, Expand, Plan, approval, Validation, Review,
Coherence, Done, and cursor clear without editing every lifecycle caller.

### Explorer

The Explorer story persistence boundary compares the public projection shape
(summary, status/title, attractors, experiment, and handoff) before and after a
commit. Source-conversation evidence and other excluded private fields do not
request refresh. Archive/promote request after their durable status commit.
Builder handoff writes documents first and then persists the public handoff, so
the resulting single request sees complete files.

### Refinement

Workbench service operations request once at their completed logical mutation
boundary, after all related story/change/cursor commits. Create/capture/attach/
discard operations request explicitly; lifecycle transitions request through
the single flow-event constructor. Read-only overview/recommendation operations
never request. Canonical document-first state remains compiler authority; a
compatibility-only DB change may therefore compile as unchanged.

## Coordinator Contract

- Build active work from the durable Delivery cursor only.
- Compile through `AriadOperationalProjectionService` using registered root
  authority; callers never provide a root.
- Inspect the current `ariad:operational` pair under DS2 consistency.
- If current and compiled `sourceRevision` match, return `unchanged` and do not
  create a receipt, projection, manifest update, or new snapshot authority.
- Otherwise publish the already compiled document through DS2 exactly once.
- Catch bounded projection errors and unexpected exceptions after source commit;
  return a payload-free `failed` outcome and emit only code/journey diagnostics.
- Never retry, repair, invoke a model/network, or roll back source truth.
- Preserve DS2 explicit divergence unchanged.
- Successful and unchanged refreshes are quiet at CLI surfaces.
- Retain the latest bounded outcome per Journey for operational inspection and
  tests; no document payload is retained in failure diagnostics.

## Acceptance Behavior

```text
Given a represented durable mutation commits successfully
When its post-commit refresh succeeds
Then exactly one refresh request occurs
And consumers see the new Operational source revision

Given a mutation changes only excluded or non-represented state
When its commit completes
Then no request occurs or the coordinator resolves it as unchanged
And no projection/manifest bytes advance

Given publication or compilation fails after the source commit
When the mutation returns
Then source truth remains committed
And the caller receives its normal success result
And bounded refresh diagnostics report failure without payload content
```

## Failure and Concurrency Posture

- The coordinator adds no lock; DS2 remains the per-Journey linearization owner.
- One coordinator serializes same-Journey requests within a process and skips
  equal revisions. Separate processes may compile concurrently; DS2 gives their
  publications one safe total order.
- Any cross-process race after comparison remains safe because DS2 receipt and
  manifest rules govern the commit. Tests force concurrent same-Journey requests
  through the coordinator and retain DS2's subprocess concurrency coverage.
- A callback bug is contained by `Store.request_projection_refresh`; mutation
  APIs never rethrow refresh failures.

## Implementation Sequence

1. Red tests for coordinator published/unchanged/failed outcomes and no rollback.
2. Red tests for Store callback containment and MemoryClient wiring.
3. Red inventory tests for Delivery, Explorer, and Refinement request counts,
   ordering, and excluded/read-only operations.
4. Add Operational compile/publish/inspect seams without duplicating DS2 writes.
5. Implement coordinator and active-work adapter.
6. Wire generic Store callback and domain post-commit request points.
7. Wire MemoryClient production coordinator.
8. Update architecture/reference docs and run Driver-owned gates.
9. Close and commit DS5 separately; do not push or release.

## Out of Scope

- Public CLI `rebuild-operational`/`inspect` and test-only probe commands (DS6).
- Background queues, retries, debounce timers, watchers, repair, or write-back.
- Changing canonical document-first Refinement authority.
- Rewriting lifecycle functions around a new event bus.
- Models, embeddings, providers, Pi processes, network, TypeScript, release, or
  Nautilus changes.
