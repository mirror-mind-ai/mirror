[< RS002](index.md) · [Canonical status](../index.md#change-requests)

# CR006 — Record The Active Driver And Delivery Link

## Problem

The canonical index can mark a Change Request `in_progress`, but it cannot say who has
assumed the work or where its implementation is being delivered. Maintainers must infer
ownership from branches, pull requests, or private conversation context, which is not a
reliable shared authority.

## Expected Behavior

An in-progress Change Request records a human Driver and a project-visible delivery
reference such as a pull request or branch. Captured and planned work may remain
unassigned. Assignment and reassignment are explicit semantic decisions.

The Driver field must not alter CR identity or encode local Mirror journey state. A
delivery reference must never be an absolute path, personal database identifier, or
runtime-local UUID. Git remains the authority for commits, diffs, conflicts, and
history.

After defining the canonical representation, CR006 must extend the standard Workbench
presentation introduced by CR005 so an assigned or in-progress CR visibly includes its
Driver and delivery reference. The view must omit those details cleanly when they are
not assigned rather than inventing placeholders or inferring ownership from local Git
state.

## Impact

Without explicit execution ownership, two contributors can unknowingly work on the same
Change Request, and maintainers cannot tell whether `in_progress` means active delivery,
stale work, or an abandoned local session.

## Plan Or Decision

Use two explicit columns in the canonical Change Request table:

```text
| ... | Status | Driver | Delivery |
```

### Representation

- `Driver` names one accountable human contributor, preferably by GitHub handle such as
  `@alissonvale`. It never names a Mirror persona, journey, local runtime session, or
  database identity.
- `Delivery` contains a project-visible Git reference: a Markdown link to a pull request
  when one exists, otherwise a backticked branch name. It never contains an absolute
  path, local worktree, conversation ID, or journey UUID.
- The canonical empty value is `—`. Captured and planned CRs may remain unassigned.
- An `in_progress`, `blocked`, or `validated` CR must retain a non-empty Driver and
  Delivery reference. Terminal history keeps those values as provenance.
- One accountable Driver is recorded even when others contribute; co-authorship remains
  visible in Git and the pull request.

### Lifecycle rules

1. Before a CR moves to `in_progress`, create or identify its delivery branch, then
   record Driver and Delivery in the same canonical index change as the status.
2. When a pull request opens, replace the branch reference with the PR link.
3. Reassignment is an explicit Navigator decision and one reviewable Git edit; it must
   never be inferred from the current checkout, latest committer, or private Mirror
   state.
4. Staleness causes no automatic reassignment. The Navigator decides whether to keep,
   reassign, block, or park the CR, preserving the existing delivery reference when it
   remains useful evidence.
5. Completion keeps Driver and Delivery in terminal history rather than erasing who
   delivered the work.

### Implementation route

1. Extend the canonical index table with `Driver` and `Delivery` columns, using `—` for
   existing unassigned work and preserving historical truth for completed work where
   evidence is already explicit.
2. Add the collaboration convention to the canonical index so another Mirror can apply
   the rules without private session context.
3. Extend `.pi/skills/mm-build/SKILL.md` so the standard CR005 Workbench view displays
   `Driver` and `Delivery` only when the canonical row provides non-empty values. Never
   infer or synthesize them.
4. Update `REFERENCE.md` with the assignment boundary and update CR005 with a short
   follow-up pointer showing that CR006 extended its presentation contract.
5. Create a project-visible branch before CR006 enters `in_progress`; record its Driver
   and branch together with that status transition.
6. Validate in a newly loaded Pi session with the natural prompt `Mostre o Refinement
   Workbench`. The focused assigned CR must show Driver and Delivery, while unassigned
   CRs omit assignment details cleanly.

### Acceptance behavior

- The canonical index answers who owns active execution and where it is being delivered.
- `in_progress`, `blocked`, and `validated` cannot be represented without Driver and
  Delivery according to the documented convention.
- The Workbench presentation shows only canonical assignment facts and omits unassigned
  metadata rather than displaying misleading placeholders.
- Read-only inspection remains read-only and does not inspect Git or SQLite to discover
  ownership.
- Reassignment, stale-work decisions, commit, push, merge, and release remain explicit
  Navigator decisions.

### Conscious exclusions

- Assignment services, locks, heartbeats, timestamps, stale-work automation, and
  concurrent-edit prevention.
- Multiple-driver or role-taxonomy modeling.
- Runtime Markdown parsing or schema validation.
- Claude Code skill parity.

## Evidence

Post-release Workbench inspection showed that the original table contained only
`Order`, `ID`, `RS`, `Change`, and `Status`. No CR was `in_progress`, so the gap could be
closed before multi-contributor execution began.

Implementation created branch `refinement/rs002-collaborative-workbench`, added the
canonical Driver and Delivery columns and collaboration convention, assigned CR006 to
`@alissonvale` on that branch while moving it to `in_progress`, and preserved CR005's
same delivery provenance in terminal history. Builder skill guidance, `REFERENCE.md`,
and CR005's follow-up note now carry the presentation and non-inference boundary.

The isolated smoke and Navigator validation both used the natural prompt `Mostre o
Refinement Workbench`. CR006 displayed its canonical Driver and Delivery, CR005 retained
those details in terminal history, unassigned CRs omitted them, the inspection stayed
read-only, and the rendered view stated that SQLite was not consulted.

## Review

The change remains document-first and proportional. It adds two explicit Markdown
columns, one collaboration convention, and agent presentation guidance; it introduces
no assignment service, lock, timestamp, parser, schema migration, or SQLite access.
Git still owns delivery evidence and conflict history, while the canonical index owns
only the project's current assignment statement.

No corrective debt action is required. The lack of automated enforcement is a conscious
boundary of this document-first release rather than an accidental omission; repeated
real-world violations would be the evidence needed for a later validator. Full capture,
status-transition, and return-handoff guidance remains intentionally owned by CR007.

## Outcome

Done. The Navigator validated the behavior on 2026-08-03. CR006 moved to terminal
history with `@alissonvale` and `refinement/rs002-collaborative-workbench` preserved as
provenance, and current CR focus was cleared. Selecting CR007 remains a separate
Navigator decision.
