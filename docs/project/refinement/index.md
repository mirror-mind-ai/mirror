[< Project roadmap](../roadmap/index.md)

# Refinement Workbench

This index is the canonical project record for Refinement Story and Change Request
backlog status. Linked documents preserve context and evidence; they do not own status.
If a linked document and this index disagree, this index wins.

## Current Focus

- Refinement Story: RS009
- Change Request: none

Selecting a focus is an explicit project decision. Reading this file never selects or
executes work.

## Refinement Stories

| Order | ID | Story | Status |
|------:|----|-------|--------|
| 1 | [RS001](rs001-ariad-runtime-trust/index.md) | Ariad Runtime Trust | active |
| 2 | [RS002](rs002-collaborative-refinement-work/index.md) | Collaborative Refinement Work | closed |
| 3 | [RS003](rs003-revisable-refinement-lifecycle/index.md) | Revisable Refinement Lifecycle | proposed |
| 4 | [RS004](rs004-identity-resolution-fidelity/index.md) | Identity Resolution Fidelity | proposed |
| 5 | [RS008](rs008-v0319-recursive-journey-parity/index.md) | v0.31.9 Recursive Journey Parity | closed |
| 6 | [RS009](rs009-cv22-front-door-routing-correctness/index.md) | CV22 Front-Door Routing Correctness | proposed |
| 7 | [RS010](rs010-cv22-oracle-and-port-hygiene/index.md) | CV22 Oracle And Port Hygiene | proposed |

## Change Requests

Open work is ordered intentionally. Terminal history follows open work.

| Order | ID | RS | Change | Status | Driver | Delivery |
|------:|----|----|--------|--------|--------|----------|
| 1 | [CR001](rs001-ariad-runtime-trust/cr001-scope-confirmation-checkpoint.md) | RS001 | Make scope confirmation an honest checkpoint | planned | — | — |
| 2 | [CR002](rs001-ariad-runtime-trust/cr002-cursor-sync-roadmap-selection.md) | RS001 | Refuse ambiguous roadmap selection during cursor sync | captured | — | — |
| 3 | [CR004](rs001-ariad-runtime-trust/cr004-preserve-authored-story-index.md) | RS001 | Preserve authored story index during Plan materialization | captured | — | — |
| 4 | [CR008](rs001-ariad-runtime-trust/cr008-bind-lifecycle-commands-to-active-journey.md) | RS001 | Bind lifecycle commands to the active Builder journey | captured | — | — |
| 5 | [CR009](rs001-ariad-runtime-trust/cr009-name-the-target-project-in-artifact-surfaces.md) | RS001 | Name the target project in artifact materialization surfaces | captured | — | — |
| 6 | [CR010](rs003-revisable-refinement-lifecycle/cr010-replan-with-plan-history.md) | RS003 | Re-plan a reviewed Change Request without destroying plan history | captured | — | — |
| 8 | [CR012](rs003-revisable-refinement-lifecycle/cr012-supersede-change-request.md) | RS003 | Close a Change Request superseded by another | captured | — | — |
| 9 | [CR013](rs003-revisable-refinement-lifecycle/cr013-amend-story-and-request-text.md) | RS003 | Amend Refinement Story and Change Request text during refinement | captured | — | — |
| 10 | [CR014](rs004-identity-resolution-fidelity/cr014-resolve-owner-name-from-one-authority.md) | RS004 | Resolve the owner's name from one authority | captured | — | — |
| 11 | [CR017](rs001-ariad-runtime-trust/cr017-projection-refresh-warning-on-every-command.md) | RS001 | Every mutating Ariad command warns that the Operational projection failed, and names no consequence | captured | — | — |
| 12 | [CR018](rs001-ariad-runtime-trust/cr018-story-titles-with-slashes-truncated-in-surfaces-and-scaffolds.md) | RS001 | Story titles containing `/` are truncated to the text after the last slash in surfaces and scaffolds | captured | — | — |
| 13 | [CR019](rs001-ariad-runtime-trust/cr019-plan-checkpoint-states-untruths-about-the-target-project.md) | RS001 | The Plan checkpoint states things that are not true for the target project (parent as sibling; Mirror-only contract lines) | captured | — | — |
| 14 | [CR020](rs001-ariad-runtime-trust/cr020-no-read-only-way-to-re-render-the-active-checkpoint.md) | RS001 | No read-only way to re-render the active checkpoint, and the refusals name the wrong reason | captured | — | — |
| 15 | [CR055](rs009-cv22-front-door-routing-correctness/cr055-audit-subcommand-inheritance-in-claimed-families.md) | RS009 | Audit subcommand inheritance across claimed command families | captured | — | — |
| 16 | [CR056](rs010-cv22-oracle-and-port-hygiene/cr056-measure-title-length-by-code-point.md) | RS010 | Measure title length by code point in titleNeedsImprovement | captured | — | — |
| 17 | [CR057](rs010-cv22-oracle-and-port-hygiene/cr057-stop-paying-for-the-discarded-summary-in-the-close-tail.md) | RS010 | Stop paying for the discarded summary in the close tail | captured | — | — |
| 18 | [CR058](rs010-cv22-oracle-and-port-hygiene/cr058-wait-for-completion-in-the-runtime-diagnose-web-test.md) | RS010 | Wait for completion, not a wall-clock budget, in the runtime-diagnose web test | captured | — | — |
| 20 | [CR060](rs010-cv22-oracle-and-port-hygiene/cr060-fail-loudly-when-a-silent-backup-fails.md) | RS010 | Fail loudly when a silent backup fails | captured | — | — |
| 21 | [CR061](rs010-cv22-oracle-and-port-hygiene/cr061-snapshot-the-live-database-consistently-before-zipping.md) | RS010 | Snapshot the live database consistently before zipping | captured | — | — |
| 22 | [CR062](rs010-cv22-oracle-and-port-hygiene/cr062-write-backup-archives-owner-only.md) | RS010 | Write backup archives owner-only | captured | — | — |
| 23 | [CR063](rs010-cv22-oracle-and-port-hygiene/cr063-keep-journey-slugs-consistent-across-tables-in-repair-encoding.md) | RS010 | Keep journey slugs consistent across tables in repair-encoding | captured | — | — |
| 24 | [CR065](rs010-cv22-oracle-and-port-hygiene/cr065-make-parity-fixture-generators-hermetic-by-construction.md) | RS010 | Make parity fixture generators hermetic by construction | captured | — | — |
| 25 | [CR066](rs010-cv22-oracle-and-port-hygiene/cr066-skip-a-naive-timestamp-instead-of-crashing-the-diagnosis.md) | RS010 | Skip a naive timestamp instead of crashing the diagnosis | captured | — | — |
| 26 | [CR067](rs001-ariad-runtime-trust/cr067-render-the-refused-checkpoint-not-a-hardcoded-implement-stage.md) | RS001 | Render the refused checkpoint, not a hardcoded Implement stage | captured | — | — |
| 28 | [CR069](rs010-cv22-oracle-and-port-hygiene/cr069-fail-cleanly-when-soul-apply-is-given-an-unknown-id.md) | RS010 | Fail cleanly when `soul apply` is given an unknown id | captured | — | — |
| 29 | [CR070](rs010-cv22-oracle-and-port-hygiene/cr070-render-or-remove-the-inert-listening-for-argument.md) | RS010 | Render or remove the inert `--listening-for` argument | captured | — | — |
| 32 | [CR074](rs010-cv22-oracle-and-port-hygiene/cr074-harden-the-week-plan-pending-file.md) | RS010 | Harden the `week plan` pending file | captured | — | — |
| — | [CR072](rs009-cv22-front-door-routing-correctness/cr072-route-every-skill-through-the-front-door.md) | RS009 | Route every skill through the front door | done | @viniciusteles | `mirror-ts-core` |
| — | [CR073](rs010-cv22-oracle-and-port-hygiene/cr073-refuse-a-mistyped-stdin-sentinel-in-journey-update.md) | RS010 | Refuse a mistyped stdin sentinel in `journey update` | done | @viniciusteles | `mirror-ts-core` |
| — | [CR068](rs009-cv22-front-door-routing-correctness/cr068-stop-reporting-unported-llm-gated-leaves-as-burned-down.md) | RS009 | Stop reporting unported LLM-gated leaves as burned down | done | @viniciusteles | `mirror-ts-core` |
| — | [CR071](rs010-cv22-oracle-and-port-hygiene/cr071-collapse-the-triplicated-skill-command-references.md) | RS010 | Collapse the triplicated skill command references | done | @viniciusteles | `mirror-ts-core` |
| — | [CR011](rs003-revisable-refinement-lifecycle/cr011-resume-stranded-change-request.md) | RS003 | Resume a stranded Change Request | done | @alissonvale | `main` |
| — | [CR016](rs001-ariad-runtime-trust/cr016-verify-authored-roadmap-before-ds-done.md) | RS001 | Verify authored roadmap state before Delivery Story Done | done | @alissonvale | `main` |
| — | [CR015](rs001-ariad-runtime-trust/cr015-preserve-driver-authored-plan-before-approval.md) | RS001 | Preserve Driver-authored Plan before approval | promoted | — | `CV20.DS15` |
| — | [CR007](rs002-collaborative-refinement-work/cr007-collaborative-capture-and-handoff-protocol.md) | RS002 | Define the collaborative capture and handoff protocol | done | @alissonvale | `refinement/rs002-collaborative-workbench` |
| — | [CR006](rs002-collaborative-refinement-work/cr006-record-active-driver-and-delivery-link.md) | RS002 | Record the active Driver and delivery link | done | @alissonvale | `refinement/rs002-collaborative-workbench` |
| — | [CR005](rs002-collaborative-refinement-work/cr005-present-canonical-workbench-clearly.md) | RS002 | Present the canonical Workbench clearly | done | @alissonvale | `refinement/rs002-collaborative-workbench` |
| — | [CR003](rs001-ariad-runtime-trust/cr003-surface-materialization-truth.md) | RS001 | Make artifact materialization surfaces truthful | done | — | — |
| — | [CR064](rs009-cv22-front-door-routing-correctness/cr064-log-the-engine-that-answered-not-the-engine-that-was-chosen.md) | RS009 | Log the engine that answered, not the engine that was chosen | done | @viniciusteles | `mirror-ts-core` |
| — | [CR059](rs009-cv22-front-door-routing-correctness/cr059-route-extension-and-hook-calls-through-the-front-door.md) | RS009 | Route the Pi extension and Gemini hook calls through the front door | done | @viniciusteles | `mirror-ts-core` |
| — | [CR054](rs008-v0319-recursive-journey-parity/cr054-assign-workspace-and-web-hierarchy-parity-ownership.md) | RS008 | Assign Workspace and web hierarchy parity ownership | done | @alissonvale | `mirror-ts-core` |
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

## Legacy Boundary

RS008 and CR050 were allocated on the `mirror-ts-core` branch before this index and
main's Workbench converged. They begin after the highest project-wide identifiers
already documented in repository files at allocation time (`RS007` and `CR049`), which
is why the sequence has a visible gap. Earlier roadmap-adjacent refinement campaign
documents remain historical narrative only and were not imported into this index.

No SQLite Workbench rows were inspected, migrated, reconciled, deleted, or dual-written
while creating this authority. Now that this canonical index exists, file-first routing
must not silently fall back to SQLite.
