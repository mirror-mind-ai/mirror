[< Project roadmap](../roadmap/index.md)

# Refinement Workbench

This index is the canonical project record for shared Refinement Story and Change
Request backlog state. Linked documents preserve context and evidence; they do not own
focus, ordering, status, Driver, or Delivery. If a linked document disagrees with this
index, this index wins.

## Current Focus

- Refinement Story: RS008
- Change Request: CR054

Selecting a focus is an explicit project decision. Reading or creating this Workbench
never selects or executes work.

## Refinement Stories

| Order | ID | Story | Status |
|------:|----|-------|--------|
| 1 | [RS008](rs008-v0319-recursive-journey-parity/index.md) | v0.31.9 Recursive Journey Parity | active |

## Change Requests

Open work is ordered intentionally. Terminal history follows open work.

| Order | ID | RS | Change | Status | Driver | Delivery |
|------:|----|----|--------|--------|--------|----------|
| 1 | [CR054](rs008-v0319-recursive-journey-parity/cr054-assign-workspace-and-web-hierarchy-parity-ownership.md) | RS008 | Assign Workspace and web hierarchy parity ownership | captured | — | — |
| — | [CR053](rs008-v0319-recursive-journey-parity/cr053-port-conservative-transactional-journey-removal.md) | RS008 | Port conservative transactional journey removal | done | @alissonvale | `mirror-ts-core` |
| — | [CR052](rs008-v0319-recursive-journey-parity/cr052-port-parent-movement-and-cycle-semantics.md) | RS008 | Port parent movement and cycle semantics | done | @alissonvale | `mirror-ts-core` |
| — | [CR051](rs008-v0319-recursive-journey-parity/cr051-restore-recursive-journey-read-and-render-parity.md) | RS008 | Restore recursive journey read and CLI rendering parity | done | @alissonvale | `mirror-ts-core` |
| — | [CR050](rs008-v0319-recursive-journey-parity/cr050-reconcile-moving-target-and-parent-authority.md) | RS008 | Reconcile moving-target policy and parent authority | done | @alissonvale | `mirror-ts-core` |

## Status Vocabulary

Refinement Story:

```text
proposed | active | parked | closed
```

Change Request:

```text
captured | planned | in_progress | blocked | validated | done | parked | rejected | promoted
```

Detailed phase history belongs in each CR document. This index records only current
canonical state.

## Collaboration Convention

- `Driver` names one accountable human contributor, preferably by GitHub handle. It
  never names a Mirror persona, journey, runtime session, or database identity.
- `Delivery` is a pull request URL when one exists, otherwise a backticked Git branch.
  It never contains an absolute path, local worktree, conversation ID, or journey UUID.
- The canonical empty value is `—`. Captured or planned work may remain unassigned.
- An `in_progress`, `blocked`, or `validated` CR must record both Driver and Delivery.
- Assignment, reassignment, focus, status, commit, push, merge, publication, and release
  are explicit Navigator decisions and are never inferred from private runtime state.
- Git owns history, collaboration, conflicts, delivery, and recovery.

## Artifact Convention

- IDs are stable, project-wide `RSNNN` and `CRNNN` identifiers.
- IDs never encode a journey, database row, person, path, or runtime display code.
- Each RS owns one directory and one `index.md`; each CR is one evolving Markdown file.
- Empty lifecycle-phase files are not created.
- No document grants implementation, commit, push, merge, publication, or release
  authority.

## Legacy Boundary

This is the first canonical root Workbench for this branch. `RS008` and `CR050` begin
after the highest project-wide identifiers already documented in repository files
(`RS007` and `CR049`). Earlier roadmap-adjacent refinement campaign documents remain
historical narrative only and were not imported into this index.

No SQLite Workbench rows were inspected, migrated, reconciled, deleted, or dual-written
while creating this authority. Now that this canonical index exists, file-first routing
must not silently fall back to SQLite.
