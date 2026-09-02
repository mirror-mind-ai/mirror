[< RS001](index.md) · [Refinement Workbench](../index.md)

# CR016 — Verify authored roadmap state before Delivery Story Done

## Problem

`done-delivery-story` closed CV20.DS16 in the runtime cursor, materialized
`done.md`, and rendered “Closure coherence passed” even though the canonical
Delivery Story index, all four child package statuses, and the CV20 Delivery Arc
row still said `In Progress`.

The agent repaired those files deterministically after the surface, but the
runtime had already made a false coherence claim. A Done checkpoint that cannot
prove authored roadmap closure should stop instead of declaring coherence.

## Expected Behavior

Before mutating the cursor or materializing Delivery Story Done, the runtime
verifies that authored roadmap state already represents closure:

- the resolved Delivery Story package status is Done;
- every known child work package status is Done; and
- canonical roadmap table rows that reference the Delivery Story report Done.

If evidence is missing or stale, Done fails before mutation with an actionable,
payload-free error naming the project-relative files that need alignment. The
agent remains responsible for semantic Markdown updates; Python verifies the
closure precondition rather than inventing project meaning.

When the authored state is aligned, Done proceeds and may truthfully render its
coherence statement.

## Impact

This closes a runtime-trust gap at the strongest Delivery closure boundary. It
prevents cursor state, Done artifacts, roadmap documents, and the visible
coherence claim from contradicting one another.

## Plan Or Decision

1. Add a deterministic authored-roadmap closure preflight for the active Delivery
   Story and known child work packages.
2. Resolve packages by heading through the existing story-path authority; do not
   derive paths from titles.
3. Inspect only explicit status fields and canonical Markdown table rows; do not
   rewrite roadmap prose in Python.
4. Run the preflight in `cmd_done_delivery_story` before cursor mutation and
   `done.md` materialization.
5. On stale state, fail with project-relative evidence and preserve runtime state.
6. Add unit and CLI regression tests for stale DS status, stale child status,
   stale parent row, no-mutation failure, and successful aligned closure.
7. Preserve existing Ariad surfaces and the rule that push/release remain
   separate gates.

## Acceptance Criteria

- Done cannot render coherence passed while the DS package says In Progress.
- Done cannot render coherence passed while a known child package or candidate
  row says In Progress.
- Done cannot render coherence passed while a canonical parent roadmap row for
  the DS says In Progress.
- A failed preflight creates no Done artifact and leaves the delivery cursor
  unchanged.
- Aligned authored state still closes and renders Done plus Project Position.
- No production database, commit, push, release, or external system is touched.

## Validation Route

Run focused closure and CLI tests, then the complete non-live unit/integration
suite. Reproduce against a synthetic roadmap whose DS and child statuses start
stale, confirm bounded refusal and no cursor/artifact mutation, align the statuses,
and confirm Done succeeds.

## Evidence

Plan approved by the Navigator. Implementation assigned to `@alissonvale` with
Delivery `main`.

Captured from CV20.DS16 dogfood: runtime Done reported coherence passed before
`docs/project/roadmap/cv20-builder-mode-evolution/cv20-ds16-story-level-conditional-plan-preauthorization/index.md`, its child indexes, and the CV20 Delivery Arc row were updated. The files were repaired manually after the false-positive surface.

Implementation adds a read-only authored-roadmap preflight before the CLI calls
the mutating Delivery Story closure core. Package identity resolves through the
existing heading authority. The preflight checks explicit DS and known-child
package statuses plus every canonical Code/Status table row for those items. It
reports only project-relative paths and performs no Markdown rewrite.

Validation evidence:

- focused closure and CLI suite: 99 tests passed;
- complete non-live `tests/unit tests/integration` suite: passed;
- scoped Ruff and mypy on changed Python modules: passed;
- docs links, duplicate roadmap headings, and `git diff --check`: passed;
- repository-wide Ruff remains blocked only by four pre-existing findings under
  `spikes/ts-search-parity/`, outside this CR;
- isolated `sandbox-pet-store` dogfood refused stale DS/child statuses with exit
  1, preserved the cursor, and created no `done.md`;
- after authored statuses were aligned, the same natural Done command completed,
  materialized `done.md`, and advanced the cursor to
  `delivery_story_done_complete`; the sandbox was then restored to
  `ariad-ready`.

## Outcome

Navigator accepted the natural validation route. CR016 is validated.

Proportionality/debt review finds no blocking debt: the change adds one bounded,
read-only verifier; reuses heading-based package resolution; keeps semantic
Markdown mutation with the agent; and introduces no database schema, parser
framework, compatibility layer, or external dependency. Repository-wide Ruff's
four unrelated spike findings remain pre-existing baseline rather than debt
created by this CR.

Navigator accepted the no-action debt review and authorized terminal closure.
CR016 is Done with no follow-up debt action. Commit, push, publication, and
release remain separately gated.

## Authority Boundary

Driver and Delivery are confirmed for start only after Plan approval:
`@alissonvale` on `main`. This CR authorizes local implementation and validation;
it does not authorize commit, push, merge, publication, or release.
