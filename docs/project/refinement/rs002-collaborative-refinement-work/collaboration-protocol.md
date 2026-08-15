[< RS002](index.md) · [Refinement Workbench](../index.md)

# Collaborative Refinement Protocol

This protocol is the shared operating route for contributors and their Mirrors working
with the file-first Refinement Workbench. The canonical
[`docs/project/refinement/index.md`](../index.md) owns focus, ordering, current status,
Driver, and Delivery. Linked RS/CR documents own narrative, plans, evidence, decisions,
and outcomes. Git owns diffs, history, conflicts, collaboration, and recovery.

The protocol coordinates ordinary document work. It does not create an application
state machine, parser, lock service, ID registry, synchronization layer, or custom Git
workflow.

## Authority Boundary

- When the canonical index exists, never inspect, compare, migrate, reconcile, or
  dual-write legacy SQLite Workbench state.
- Reading is read-only. Showing the Workbench never selects or executes work.
- Focus, status, assignment, reassignment, deletion, conflict meaning, commit, push,
  merge, publication, and release require explicit Navigator authority.
- A linked document cannot override focus, ordering, status, Driver, or Delivery from
  the root index.
- Never encode people, journeys, databases, local paths, conversations, or runtime IDs
  inside `RSNNN` or `CRNNN` identity.
- Clones whose role is production are read-only for refinement authoring. Draft, edit,
  and commit refinement documents only in a development clone: production working trees
  are deployment artifacts, and runtime machinery may reset them at any time.

## Status Meanings

| Status | Operational meaning |
|--------|---------------------|
| `captured` | The problem and expected behavior are recorded. No plan or implementation is authorized. |
| `planned` | Scope, acceptance, validation, and exclusions are recorded and approved. Implementation has not started. |
| `in_progress` | An explicitly assigned Driver is implementing through the recorded Delivery reference. |
| `blocked` | Assigned work cannot proceed. The CR narrative records the blocker and the decision needed. |
| `validated` | Implementation evidence passed and the Navigator explicitly accepted the user-visible validation route. |
| `done` | Validation and proportionality/debt review are complete; the CR is terminal history. |
| `parked` | Work is deliberately deferred; the CR records a reason and revisit trigger. |
| `rejected` | The project decided not to proceed; the CR is preserved with the reason. |
| `promoted` | The concern moved from Refinement into Delivery Work; the CR records its Delivery target. |

Status is not a substitute for narrative evidence. `blocked`, `parked`, `rejected`, and
`promoted` require their reason in the CR document. `parked` also requires a revisit
trigger. `promoted` also requires a concrete Delivery target.

## 1. Inspect Before Mutation

Read the canonical index and the linked RS/CR documents relevant to the request. Confirm:

- current focus;
- highest existing project-wide RS and CR numbers;
- target RS and its boundaries;
- current status, Driver, and Delivery;
- whether another branch or PR already owns related work.

If the index is unreadable, structurally ambiguous, or concurrently conflicted, stop and
report the practical defect. Never fall back to SQLite.

## 2. Capture Refinement Work

Capture records work; it never selects or starts it. Drafting and claiming an
identifier are two different acts.

1. Require a concrete title, problem, and expected behavior.
2. Require an explicit existing RS target or explicit authority to create a new RS. The
   current layout has no unassigned CR directory; do not invent placement.
3. **Draft numberless.** A capture-in-progress carries a slug
   (`replan-with-plan-history.md`), not an ID: no `CRNNN` or `RSNNN` in the filename,
   heading, or prose. Cross-reference sibling drafts with relative links — they survive
   later numbering unchanged. A draft may live in a working tree or on a branch for as
   long as it needs; it cannot collide with anything, because it claims nothing.
4. **Allocating an ID is publication.** In one act, in one session: inspect the
   complete canonical index, take the next unused number (three-digit formatting),
   rename the draft, add the canonical row (`captured`, Driver `—`, Delivery `—`),
   and push to origin — a branch with an open pull request is a visible claim. An
   allocated ID that exists only in a local working tree is not a state this process
   has.
5. The CR document keeps the required sections: `Problem`, `Expected Behavior`,
   `Impact`, `Plan Or Decision`, `Evidence`, and `Outcome`.
6. Preserve `Current Focus` exactly.

If two open claims take the same ID, ordinary Git conflict resolution decides the
survivor at merge; the other renumbers after the conflict's meaning is explicitly
resolved. Never silently overwrite, merge narratives, or renumber another
contributor's work. Publication-time allocation shrinks the collision window from
days to minutes — without locks, reservation, or a second authority.

## 3. Select And Plan

Selection changes only `Current Focus`. It does not alter CR status and does not
implicitly authorize planning or implementation.

Planning records:

- bounded objective and expected behavior;
- implementation route and affected files;
- acceptance criteria and validation route;
- conscious exclusions and authority boundaries.

After the Navigator approves the plan, change `captured` to `planned`. Planning alone
does not assign a Driver or authorize commit, push, merge, or release.

## 4. Assign And Start

Before moving a CR to `in_progress`:

1. obtain explicit Navigator agreement on one human Driver;
2. create or identify a delivery branch or pull request;
3. update status, Driver, and Delivery atomically in the canonical row.

Use a GitHub handle when practical. Use a PR link when one exists; otherwise use a
backticked branch name. Never infer ownership from the checkout, latest commit, active
journey, conversation, or SQLite state.

When a PR opens, replace the branch reference with the PR link. Reassignment is an
explicit semantic edit. Staleness does not reassign work automatically.

## 5. Implement And Record Evidence

Implement only the approved plan. Keep newly discovered scope outside the CR unless it
is required for correctness; capture it separately when useful. Record commands,
results, smoke artifacts, limitations, and relevant environment boundaries in the CR.
Implementation evidence does not authorize `validated`.

Commits and pushes follow the project's normal checkpoints. Merge, publication, and
release remain separate decisions.

## 6. Validate

Provide a natural user route, expected observation, pass condition, and fail condition.
Use isolated state whenever runtime behavior could touch personal data. Move to
`validated` only after explicit Navigator acceptance.

A model-generated summary of automated tests is not Navigator validation. A prompt that
contains hidden implementation instructions is not a natural user route.

## 7. Review And Reach A Terminal State

After validation, record whether the change created debt or disproportionate machinery.
Choose explicitly:

- `done` when the outcome is complete and no unresolved debt action blocks closure;
- `parked` with reason and revisit trigger;
- `rejected` with reason;
- `promoted` with a Delivery target.

Move terminal CRs below open work, preserving Driver and Delivery as provenance. Clear
current CR focus when the focused CR becomes terminal. Do not select the next CR
implicitly.

## 8. Return Handoff

Use this compact shape in the pull request or collaboration thread:

```markdown
## Refinement return handoff

- RS / CR:
- Canonical status:
- Driver:
- Delivery:
- Changed files:
- Checks and results:
- Navigator validation:
- Limitations or conscious exclusions:
- Unresolved maintainer decisions:
- Requested next action:
```

The handoff reports canonical facts and evidence; it does not grant merge, publication,
or release authority.

## 9. End The Session Clean

A session that touched the refinement tree ends in one of exactly two states:

- **published** — the tree is clean and origin has the work; or
- **named** — the divergence is stated to the Navigator in the handoff: which files,
  which state (modified, committed-but-unpushed), and who picks it up.

Silent divergence is the one failure this protocol cannot survive. An unpublished
claim collides later; an unpublished draft strands; uncommitted work in the wrong
clone simply evaporates. Naming the state costs one sentence — the alternative cost
is unbounded, and it was paid three ways in one week before this rule existed.

## Concurrency And Recovery

Refresh the delivery branch against its approved base before final handoff. Let Git
surface index, ID, focus, status, assignment, and narrative conflicts. Mechanical,
meaning-preserving conflict repairs may be proposed, but semantic conflicts stop for the
Navigator. Never solve a conflict by consulting SQLite, deleting another contributor's
record, or creating a second authority.
