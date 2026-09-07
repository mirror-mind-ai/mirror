[< Refinement Workbench](../index.md)

# RS001 — Ariad Runtime Trust

## Framing

Ariad surfaces are intended to let the Navigator trust what the runtime says happened,
what is active, and what must happen next. Dogfooding found a small set of cases where
the visible checkpoint or roadmap position did not match the operation actually
performed or the intended project context.

This story groups those trust-boundary refinements. It does not redesign the Ariad
lifecycle and does not treat every presentation preference as a runtime defect.

## Outcome

Ariad checkpoint and position surfaces describe real state and stop when the runtime
cannot choose safely.

## Boundaries

- Preserve deterministic Ariad surface transport.
- Prefer honest refusal over inferred roadmap intent.
- Do not add authority to commit, push, merge, publish, or release.
- Keep document backlog status in the canonical [Workbench index](../index.md).

## Change Requests

- [CR001 — Make scope confirmation an honest checkpoint](cr001-scope-confirmation-checkpoint.md)
- [CR002 — Refuse ambiguous roadmap selection during cursor sync](cr002-cursor-sync-roadmap-selection.md)
- [CR003 — Make artifact materialization surfaces truthful](cr003-surface-materialization-truth.md)
- [CR004 — Preserve authored story index during Plan materialization](cr004-preserve-authored-story-index.md)
- [CR008 — Bind lifecycle commands to the active Builder journey](cr008-bind-lifecycle-commands-to-active-journey.md)
- [CR009 — Name the target project in artifact materialization surfaces](cr009-name-the-target-project-in-artifact-surfaces.md)
- [CR015 — Preserve Driver-authored Plan before approval](cr015-preserve-driver-authored-plan-before-approval.md)
- [CR016 — Verify authored roadmap state before Delivery Story Done](cr016-verify-authored-roadmap-before-ds-done.md)
- [CR017 — Every mutating Ariad command warns that the Operational projection failed, and names no consequence](cr017-projection-refresh-warning-on-every-command.md)
- [CR018 — Story titles containing `/` are truncated to the text after the last slash in surfaces and scaffolds](cr018-story-titles-with-slashes-truncated-in-surfaces-and-scaffolds.md)
- [CR019 — The Plan checkpoint states things that are not true for the target project](cr019-plan-checkpoint-states-untruths-about-the-target-project.md)
- [CR020 — No read-only way to re-render the active checkpoint, and the refusals name the wrong reason](cr020-no-read-only-way-to-re-render-the-active-checkpoint.md)
