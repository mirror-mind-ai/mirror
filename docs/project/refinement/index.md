[< Project roadmap](../roadmap/index.md)

# Refinement Workbench

This index is the canonical project record for Refinement Story and Change Request
backlog status. Linked documents preserve context and evidence; they do not own status.
If a linked document and this index disagree, this index wins.

## Current Focus

- Refinement Story: RS001
- Change Request: CR107

Selecting a focus is an explicit project decision. Reading this file never selects or
executes work.

## Refinement Stories

| Order | ID | Story | Status |
|------:|----|-------|--------|
| 1 | [RS001](rs001-ariad-runtime-trust/index.md) | Ariad Runtime Trust | active |
| 2 | [RS002](rs002-collaborative-refinement-work/index.md) | Collaborative Refinement Work | closed |
| 3 | [RS003](rs003-revisable-refinement-lifecycle/index.md) | Revisable Refinement Lifecycle | closed |
| 4 | [RS004](rs004-identity-resolution-fidelity/index.md) | Identity Resolution Fidelity | proposed |
| 5 | [RS008](rs008-v0319-recursive-journey-parity/index.md) | v0.31.9 Recursive Journey Parity | closed |
| 6 | [RS009](rs009-cv22-front-door-routing-correctness/index.md) | CV22 Front-Door Routing Correctness | proposed |
| 7 | [RS010](rs010-cv22-oracle-and-port-hygiene/index.md) | CV22 Oracle And Port Hygiene | proposed |

## Change Requests

Open work is ordered intentionally. Terminal history follows open work.

| Order | ID | RS | Change | Status | Driver | Delivery |
|------:|----|----|--------|--------|--------|----------|
| 1 | [CR014](rs004-identity-resolution-fidelity/cr014-resolve-owner-name-from-one-authority.md) | RS004 | Resolve the owner's name from one authority | captured | — | — |
| 2 | [CR055](rs009-cv22-front-door-routing-correctness/cr055-audit-subcommand-inheritance-in-claimed-families.md) | RS009 | Audit subcommand inheritance across claimed command families | captured | — | — |
| 3 | [CR056](rs010-cv22-oracle-and-port-hygiene/cr056-measure-title-length-by-code-point.md) | RS010 | Measure title length by code point in titleNeedsImprovement | captured | — | — |
| 4 | [CR057](rs010-cv22-oracle-and-port-hygiene/cr057-stop-paying-for-the-discarded-summary-in-the-close-tail.md) | RS010 | Stop paying for the discarded summary in the close tail | captured | — | — |
| 5 | [CR058](rs010-cv22-oracle-and-port-hygiene/cr058-wait-for-completion-in-the-runtime-diagnose-web-test.md) | RS010 | Wait for completion, not a wall-clock budget, in the runtime-diagnose web test | captured | — | — |
| 6 | [CR063](rs010-cv22-oracle-and-port-hygiene/cr063-keep-journey-slugs-consistent-across-tables-in-repair-encoding.md) | RS010 | Keep journey slugs consistent across tables in repair-encoding | captured | — | — |
| 7 | [CR065](rs010-cv22-oracle-and-port-hygiene/cr065-make-parity-fixture-generators-hermetic-by-construction.md) | RS010 | Make parity fixture generators hermetic by construction | captured | — | — |
| 8 | [CR066](rs010-cv22-oracle-and-port-hygiene/cr066-skip-a-naive-timestamp-instead-of-crashing-the-diagnosis.md) | RS010 | Skip a naive timestamp instead of crashing the diagnosis | captured | — | — |
| 9 | [CR069](rs010-cv22-oracle-and-port-hygiene/cr069-fail-cleanly-when-soul-apply-is-given-an-unknown-id.md) | RS010 | Fail cleanly when `soul apply` is given an unknown id | captured | — | — |
| 10 | [CR070](rs010-cv22-oracle-and-port-hygiene/cr070-render-or-remove-the-inert-listening-for-argument.md) | RS010 | Render or remove the inert `--listening-for` argument | captured | — | — |
| 11 | [CR074](rs010-cv22-oracle-and-port-hygiene/cr074-harden-the-week-plan-pending-file.md) | RS010 | Harden the `week plan` pending file | captured | — | — |
| 12 | [CR076](rs010-cv22-oracle-and-port-hygiene/cr076-collapse-the-three-close-tail-metadata-calls.md) | RS010 | Collapse the three close-tail metadata calls into one | captured | — | — |
| 13 | [CR078](rs010-cv22-oracle-and-port-hygiene/cr078-stop-spending-thirteen-seconds-polling-for-a-consult-cost.md) | RS010 | Stop spending thirteen seconds polling for a `consult` cost | captured | — | — |
| 14 | [CR080](rs010-cv22-oracle-and-port-hygiene/cr080-give-the-consolidation-prompt-an-identity-context-it-can-act-on.md) | RS010 | Give the consolidation prompt an identity context it can act on | captured | — | — |
| 15 | [CR081](rs010-cv22-oracle-and-port-hygiene/cr081-typecheck-the-parity-tools.md) | RS010 | Typecheck the parity tools | captured | — | — |
| 16 | [CR083](rs010-cv22-oracle-and-port-hygiene/cr083-path-normalization-assumptions-are-untested-in-the-port.md) | RS010 | Path-normalization assumptions in the ported tree are untested, and one shipped wrong for two plateaus | captured | — | — |
| 17 | [CR085](rs009-cv22-front-door-routing-correctness/cr085-the-ts-front-door-does-not-read-the-env-python-reads.md) | RS009 | The TypeScript front door does not read the `.env` Python reads | captured | — | — |
| 18 | [CR086](rs010-cv22-oracle-and-port-hygiene/cr086-baseline-advance-must-name-the-oracle-change.md) | RS010 | A baseline advance must name the oracle change it absorbs | captured | — | — |
| 19 | [CR087](rs010-cv22-oracle-and-port-hygiene/cr087-journey-status-returns-every-journeys-full-document.md) | RS010 | `journey_status` without a slug returns every journey's full document | captured | — | — |
| 20 | [CR091](rs010-cv22-oracle-and-port-hygiene/cr091-operation-runs-outlived-its-only-consumer.md) | RS010 | `operation_runs` outlived its only consumer: dead service, two live tables, real rows | captured | — | — |
| 21 | [CR094](rs004-identity-resolution-fidelity/cr094-two-journey-identity-layers-drift-with-no-consistency-mechanism.md) | RS004 | Two journey identity layers hold the same document, and the one Mirror Mode reads is the one that drifts | captured | — | — |
| 22 | [CR095](rs009-cv22-front-door-routing-correctness/cr095-journey-status-renders-an-empty-document-for-an-unknown-slug.md) | RS009 | `journey <slug>` renders an empty status document, exit 0, for a journey that does not exist — on both engines | captured | — | — |
| 23 | [CR096](rs009-cv22-front-door-routing-correctness/cr096-conversations-lists-instead-of-appending-when-options-come-first.md) | RS009 | `conversations <options> append` renders the listing, exit 0, and drops the payload on stdin | captured | — | — |
| 24 | [CR097](rs010-cv22-oracle-and-port-hygiene/cr097-new-ids-are-32-bits-because-the-oracle-s-were.md) | RS010 | New record ids are 32 bits because the oracle's were, and `messages` already collides | captured | — | — |
| 25 | [CR098](rs010-cv22-oracle-and-port-hygiene/cr098-the-pi-extension-logs-the-start-of-every-prompt.md) | RS010 | The Pi extension logs the first 80 characters of every prompt | captured | — | — |
| 26 | [CR099](rs010-cv22-oracle-and-port-hygiene/cr099-a-global-capability-binding-is-not-idempotent.md) | RS010 | A `--global` capability binding is not idempotent | captured | — | — |
| 27 | [CR100](rs010-cv22-oracle-and-port-hygiene/cr100-the-session-resolver-guesses-from-a-table-of-three-row-kinds.md) | RS010 | The session resolver guesses "the session" from a table that holds three kinds of row | captured | — | — |
| 28 | [CR101](rs010-cv22-oracle-and-port-hygiene/cr101-explorer-and-soul-activation-stamp-a-guessed-session.md) | RS010 | Explorer and Soul activation stamp their mode onto a guessed session | captured | — | — |
| 29 | [CR106](rs010-cv22-oracle-and-port-hygiene/cr106-a-pi-session-in-a-scratch-mirror-home-copies-the-whole-pi-history-into-it.md) | RS010 | A Pi session started against a scratch Mirror home copies the whole Pi history into it | captured | — | — |
| 30 | [CR107](rs001-ariad-runtime-trust/cr107-an-escaped-pipe-in-a-candidate-table-title-is-read-as-a-cell-border.md) | RS001 | An escaped pipe in a candidate-table title is read as a cell border | in_progress | @viniciusteles | `mirror-ts-core` |
| 31 | [CR108](rs010-cv22-oracle-and-port-hygiene/cr108-the-claude-code-copies-of-other-skills-drift-from-pi-in-behavior.md) | RS010 | The Claude Code copies of other skills drift from Pi in behavior, and no guard compares them | captured | — | — |
| 32 | [CR109](rs009-cv22-front-door-routing-correctness/cr109-mirror-log-help-records-help-and-renames-the-conversation.md) | RS009 | `mirror log --help` records `--help` as the response and renames the conversation to it | captured | — | — |
| 33 | [CR110](rs010-cv22-oracle-and-port-hygiene/cr110-the-doc-link-checker-reads-a-link-inside-inline-code-as-a-real-link.md) | RS010 | The doc-link checker reads a link inside inline code as a real link | captured | — | — |
| 34 | [CR116](rs004-identity-resolution-fidelity/cr116-identity-get-piped-to-identity-set-adds-a-newline-each-round-trip.md) | RS004 | `identity get` piped to `identity set` adds a newline each round trip | captured | — | — |
| 35 | [CR117](rs001-ariad-runtime-trust/cr117-a-delivery-story-s-flow-unit-outlives-it.md) | RS001 | A Delivery Story's flow unit outlives it, and no story after it can be preauthorized | captured | — | — |
| 36 | [CR118](rs001-ariad-runtime-trust/cr118-a-story-closure-and-a-delivery-story-closure-report-their-record-in-two-shapes.md) | RS001 | A story's closure and a Delivery Story's report their record in two shapes | captured | — | — |
| 37 | [CR119](rs001-ariad-runtime-trust/cr119-the-delivery-story-done-preflight-reads-a-status-line-s-last-word.md) | RS001 | The Delivery Story Done preflight reads a status line's last word, so `✅ Done · 2026-05-11` is refused and `Not done` passes | captured | — | — |
| — | [CR103](rs001-ariad-runtime-trust/cr103-candidate-and-position-rows-print-a-package-s-entire-status-line.md) | RS001 | Candidate and position rows print a roadmap package's entire status line | done | @viniciusteles | `mirror-ts-core` |
| — | [CR082](rs001-ariad-runtime-trust/cr082-lifecycle-surfaces-print-absolute-paths.md) | RS001 | Plan and Expand surfaces print absolute filesystem paths where their artifact surface prints project-relative ones | done | @viniciusteles | `mirror-ts-core` |
| — | [CR009](rs001-ariad-runtime-trust/cr009-name-the-target-project-in-artifact-surfaces.md) | RS001 | Name the target project in artifact materialization surfaces | done | @viniciusteles | `mirror-ts-core` |
| — | [CR114](rs001-ariad-runtime-trust/cr114-the-builder-resume-offers-prepare-on-a-completed-item.md) | RS001 | The Builder resume offers Prepare on a completed item | done | @viniciusteles | `mirror-ts-core` |
| — | [CR115](rs001-ariad-runtime-trust/cr115-the-cadence-profile-is-shown-on-no-read-only-surface.md) | RS001 | The cadence profile that changes what Plan does is shown on no read-only surface | done | @viniciusteles | `mirror-ts-core` |
| — | [CR113](rs001-ariad-runtime-trust/cr113-the-pull-card-claims-prepare-did-not-run-mislabels-the-level-and-skips-the-parent.md) | RS001 | The Pull card claims Prepare did not run, names every level a Delivery Story, and skips the parent | done | @viniciusteles | `mirror-ts-core` |
| — | [CR111](rs001-ariad-runtime-trust/cr111-the-plan-checkpoint-renders-template-sentences-as-the-plan.md) | RS001 | The Plan checkpoint renders template sentences as the plan | done | @viniciusteles | `mirror-ts-core` |
| — | [CR112](rs001-ariad-runtime-trust/cr112-a-scaffold-cannot-be-told-from-authored-content-and-approve-plan-never-reads-the-plan.md) | RS001 | A scaffold cannot be told from authored content, and ordinary Plan approval never reads the plan | done | @viniciusteles | `mirror-ts-core` |
| — | [CR105](rs001-ariad-runtime-trust/cr105-choosing-delivery-story-flow-leaves-the-story-confirmation-pending.md) | RS001 | Choosing Delivery Story flow leaves the story-by-story confirmation pending | done | @viniciusteles | `mirror-ts-core` |
| — | [CR090](rs001-ariad-runtime-trust/cr090-debt-review-surface-mixes-portuguese-into-english.md) | RS001 | The Debt Review surface mixes Portuguese into an English sentence | done | @viniciusteles | `mirror-ts-core` |
| — | [CR104](rs004-identity-resolution-fidelity/cr104-journey-slugs-are-not-validated-and-command-hints-print-them-raw.md) | RS004 | Journey slugs are not validated, and command hints print them raw | done | @viniciusteles | `mirror-ts-core` |
| — | [CR061](rs010-cv22-oracle-and-port-hygiene/cr061-snapshot-the-live-database-consistently-before-zipping.md) | RS010 | Snapshot the live database consistently before zipping | done | @viniciusteles | `mirror-ts-core` |
| — | [CR062](rs010-cv22-oracle-and-port-hygiene/cr062-write-backup-archives-owner-only.md) | RS010 | Write backup archives owner-only | done | @viniciusteles | `mirror-ts-core` |
| — | [CR060](rs010-cv22-oracle-and-port-hygiene/cr060-fail-loudly-when-a-silent-backup-fails.md) | RS010 | Fail loudly when a silent backup fails | done | @viniciusteles | `mirror-ts-core` |
| — | [CR010](rs003-revisable-refinement-lifecycle/cr010-replan-with-plan-history.md) | RS003 | Re-plan a reviewed Change Request without destroying plan history | rejected | — | — |
| — | [CR012](rs003-revisable-refinement-lifecycle/cr012-supersede-change-request.md) | RS003 | Close a Change Request superseded by another | rejected | — | — |
| — | [CR013](rs003-revisable-refinement-lifecycle/cr013-amend-story-and-request-text.md) | RS003 | Amend Refinement Story and Change Request text during refinement | rejected | — | — |
| — | [CR017](rs001-ariad-runtime-trust/cr017-projection-refresh-warning-on-every-command.md) | RS001 | Every mutating Ariad command warns that the Operational projection failed, and names no consequence | rejected | — | — |
| — | [CR102](rs010-cv22-oracle-and-port-hygiene/cr102-the-claude-code-mm-build-skill-lacks-the-builder-and-ariad-sections.md) | RS010 | The Claude Code `mm-build` skill carries no activation boundary, journey binding, or Ariad section | done | @viniciusteles | `mirror-ts-core` |
| — | [CR018](rs001-ariad-runtime-trust/cr018-story-titles-with-slashes-truncated-in-surfaces-and-scaffolds.md) | RS001 | Story titles containing `/` are truncated to the text after the last slash in surfaces and scaffolds | done | @viniciusteles | `mirror-ts-core` |
| — | [CR067](rs001-ariad-runtime-trust/cr067-render-the-refused-checkpoint-not-a-hardcoded-implement-stage.md) | RS001 | Render the refused checkpoint, not a hardcoded Implement stage | done | @viniciusteles | `mirror-ts-core` |
| — | [CR020](rs001-ariad-runtime-trust/cr020-no-read-only-way-to-re-render-the-active-checkpoint.md) | RS001 | No read-only way to re-render the active checkpoint, and the refusals name the wrong reason | done | @viniciusteles | `mirror-ts-core` |
| — | [CR019](rs001-ariad-runtime-trust/cr019-plan-checkpoint-states-untruths-about-the-target-project.md) | RS001 | The Plan checkpoint states things that are not true for the target project (parent as sibling; Mirror-only contract lines) | done | @viniciusteles | `mirror-ts-core` |
| — | [CR001](rs001-ariad-runtime-trust/cr001-scope-confirmation-checkpoint.md) | RS001 | Make scope confirmation an honest checkpoint | done | @viniciusteles | `mirror-ts-core` |
| — | [CR002](rs001-ariad-runtime-trust/cr002-cursor-sync-roadmap-selection.md) | RS001 | Builder's position and next-pull surfaces ignore the journey | done | @viniciusteles | `mirror-ts-core` |
| — | [CR079](rs001-ariad-runtime-trust/cr079-preserve-authored-content-in-every-lifecycle-artifact.md) | RS001 | Preserve authored content in every lifecycle artifact, not one at a time | done | @viniciusteles | `mirror-ts-core` |
| — | [CR004](rs001-ariad-runtime-trust/cr004-preserve-authored-story-index.md) | RS001 | Preserve authored story index during Plan materialization | done | @viniciusteles | `mirror-ts-core` |
| — | [CR008](rs001-ariad-runtime-trust/cr008-bind-lifecycle-commands-to-active-journey.md) | RS001 | Bind lifecycle commands to the active Builder journey | done | @viniciusteles | `mirror-ts-core` |
| — | [CR084](rs010-cv22-oracle-and-port-hygiene/cr084-the-bootstrap-lock-is-not-exclusive-while-it-is-being-written.md) | RS010 | The bootstrap lock is not exclusive during the window between creating it and writing it | done | @viniciusteles | `mirror-ts-core` |
| — | [CR093](rs010-cv22-oracle-and-port-hygiene/cr093-documented-invocations-name-a-python-entry-point-ts5-deletes.md) | RS010 | Every documented Mirror invocation names a Python entry point that TS5 deletes | promoted | — | `CV22.DS10.US3` |
| — | [CR092](rs010-cv22-oracle-and-port-hygiene/cr092-the-shim-template-resolves-python3-from-ambient-path.md) | RS010 | The extension shim template resolves `python3` from ambient PATH | rejected | — | — |
| — | [CR088](rs010-cv22-oracle-and-port-hygiene/cr088-python-embeds-attachment-queries-without-a-ledger-row.md) | RS010 | Python embeds attachment-search queries without writing a ledger row | rejected | — | — |
| — | [CR089](rs009-cv22-front-door-routing-correctness/cr089-the-journey-route-swallows-export-registry-and-mutate.md) | RS009 | The `journey` route swallows `export-registry` and `mutate` as journey slugs, exit 0 | done | @viniciusteles | `mirror-ts-core` |
| — | [CR075](rs010-cv22-oracle-and-port-hygiene/cr075-route-the-journal-embedding-through-the-safety-wrapper.md) | RS010 | Route the journal embedding through the safety wrapper | done | @viniciusteles | `mirror-ts-core` |
| — | [CR077](rs009-cv22-front-door-routing-correctness/cr077-route-and-runtime-disagree-on-a-half-replay-fixture.md) | RS009 | The route and the runtime disagree on a half-configured replay fixture | done | @viniciusteles | `mirror-ts-core` |
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
