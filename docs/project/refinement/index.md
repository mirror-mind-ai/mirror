[< Project roadmap](../roadmap/index.md)

# Refinement Workbench

This index is the canonical project record for Refinement Story and Change Request
backlog status. Linked documents preserve context and evidence; they do not own status.
If a linked document and this index disagree, this index wins.

## Current Focus

- Refinement Story: none
- Change Request: none

Selecting a focus is an explicit project decision. Reading this file never selects or
executes work.

## Refinement Stories

| Order | ID | Story | Status |
|------:|----|-------|--------|
| 1 | [RS001](rs001-ariad-runtime-trust/index.md) | Ariad Runtime Trust | active |
| 2 | [RS002](rs002-collaborative-refinement-work/index.md) | Collaborative Refinement Work | closed |
| 3 | [RS003](rs003-revisable-refinement-lifecycle/index.md) | Revisable Refinement Lifecycle | proposed |

## Change Requests

Open work is ordered intentionally. Terminal history follows open work.

| Order | ID | RS | Change | Status | Driver | Delivery |
|------:|----|----|--------|--------|--------|----------|
| 1 | [CR001](rs001-ariad-runtime-trust/cr001-scope-confirmation-checkpoint.md) | RS001 | Make scope confirmation an honest checkpoint | planned | — | — |
| 2 | [CR002](rs001-ariad-runtime-trust/cr002-cursor-sync-roadmap-selection.md) | RS001 | Refuse ambiguous roadmap selection during cursor sync | captured | — | — |
| 3 | [CR004](rs001-ariad-runtime-trust/cr004-preserve-authored-story-index.md) | RS001 | Preserve authored story index during Plan materialization | captured | — | — |
| 4 | [CR008](rs003-revisable-refinement-lifecycle/cr008-replan-with-plan-history.md) | RS003 | Re-plan a reviewed Change Request without destroying plan history | captured | — | — |
| 5 | [CR009](rs003-revisable-refinement-lifecycle/cr009-resume-stranded-change-request.md) | RS003 | Resume a stranded Change Request | captured | — | — |
| 6 | [CR010](rs003-revisable-refinement-lifecycle/cr010-supersede-change-request.md) | RS003 | Close a Change Request superseded by another | captured | — | — |
| 7 | [CR011](rs003-revisable-refinement-lifecycle/cr011-amend-story-and-request-text.md) | RS003 | Amend Refinement Story and Change Request text during refinement | captured | — | — |
| — | [CR007](rs002-collaborative-refinement-work/cr007-collaborative-capture-and-handoff-protocol.md) | RS002 | Define the collaborative capture and handoff protocol | done | @alissonvale | `refinement/rs002-collaborative-workbench` |
| — | [CR006](rs002-collaborative-refinement-work/cr006-record-active-driver-and-delivery-link.md) | RS002 | Record the active Driver and delivery link | done | @alissonvale | `refinement/rs002-collaborative-workbench` |
| — | [CR005](rs002-collaborative-refinement-work/cr005-present-canonical-workbench-clearly.md) | RS002 | Present the canonical Workbench clearly | done | @alissonvale | `refinement/rs002-collaborative-workbench` |
| — | [CR003](rs001-ariad-runtime-trust/cr003-surface-materialization-truth.md) | RS001 | Make artifact materialization surfaces truthful | done | — | — |

## Status Vocabulary

Refinement Story:

```text
proposed | active | parked | closed
```

Change Request:

```text
captured | planned | in_progress | blocked | validated | done | parked | rejected | promoted
```

Detailed phase history belongs in the CR document. The index records only the current
canonical status.

## Collaboration Convention

The full contributor route is the
[Collaborative Refinement Protocol](rs002-collaborative-refinement-work/collaboration-protocol.md).

- `Driver` names one accountable human contributor, preferably by GitHub handle. It
  never names a Mirror persona, journey, runtime session, or database identity.
- `Delivery` is a pull request link when one exists, otherwise a backticked Git branch.
  It never contains an absolute path, local worktree, conversation ID, or journey UUID.
- The canonical empty value is `—`. A `captured` or `planned` CR may be unassigned.
- An `in_progress`, `blocked`, or `validated` CR must record both Driver and Delivery.
- Assignment and reassignment are explicit Navigator decisions. Mirror never infers
  ownership from the current checkout, latest committer, or private runtime state.
- When a pull request opens, replace the branch reference with its PR link.
- Terminal history keeps Driver and Delivery as provenance. Stale work is never
  reassigned automatically; the Navigator decides whether to keep, reassign, block, or
  park it.

## Artifact Convention

- IDs are stable, project-wide `RSNNN` and `CRNNN` identifiers.
- IDs do not encode a journey, database, person, absolute path, or runtime display code.
- Existing database display codes are not imported and do not define these IDs.
- Each RS owns one directory and one `index.md`.
- Each CR is one evolving Markdown document inside its RS directory.
- Separate `artifacts/` files are optional and exist only when they add information.
- Empty files for lifecycle phases are not created.
- Git owns history, collaboration, conflict resolution, and recovery.
- No document grants commit, push, merge, publication, or release authority.
