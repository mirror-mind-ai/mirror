[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR015 — Preserve Driver-Authored Plan Before Approval

## Problem

Ariad Plan commands can materialize a generic checkpoint scaffold before the
Driver has composed the implementation contract. Earlier dogfooding also showed
`plan-item` replacing an existing detailed `plan.md`, losing persistence,
storage/API, acceptance, and boundary decisions. The candidate was recorded in
the CV20.DS6 Plan but never entered the canonical Refinement Workbench.

This becomes more dangerous with conditional Plan preauthorization: carrying
Navigator authority across materialization must not automatically approve the
runtime's generic placeholder document before the Driver has completed and
preserved the actual Plan.

## Expected Behavior

Plan materialization distinguishes runtime checkpoint state from Driver-authored
implementation content. Existing non-empty Plans are preserved. A conditionally
preauthorized Plan cannot consume approval authority until every required Plan
section is complete and the exact authorized Delivery Story/work-package boundary
still matches.

## Impact

Without this boundary, Plan approval can become ceremonial: a generic document is
approved first and the real design is authored afterward, outside the checkpoint
that was supposed to govern implementation. Silent replacement additionally
destroys reviewable decisions and weakens trust in uninterrupted Ariad cadence.

## Plan Or Decision

Promoted to [CV20.DS15 — Driver-Owned Conditional Plan Authorization](../../roadmap/cv20-builder-mode-evolution/cv20-ds15-driver-owned-conditional-plan-authorization/index.md).

The Delivery Story separates four concerns:

1. preserve and complete the Driver-owned Plan;
2. persist a cursor-generation-bound, single-use exact-scope receipt;
3. verify completeness, scope, invalidation, privacy, and retry idempotency before
   consuming authority; and
4. route explicit natural language through Plan, approval, implementation start,
   and the fixed Navigator Validation stop without another Navigator turn.

The initial CV20.DS15 scope was Delivery Story flow only. Child order is
presentational; exact aggregate scope compares the canonical child-code set.
[CV20.DS16 — Story-Level Conditional Plan Preauthorization](../../roadmap/cv20-builder-mode-evolution/cv20-ds16-story-level-conditional-plan-preauthorization/index.md)
subsequently extends the same bounded authority to one exact User Story or
Technical Story in `story_by_story` flow. Semantic prose equivalence,
generalized delegation policies, cross-story authority, and every hard gate
after implementation start remain excluded.

## Evidence

- Candidate record: `docs/project/roadmap/cv20-builder-mode-evolution/cv20-ds6-refinement-workbench-flow/plan.md`, section “CR: Ariad plan command can overwrite detailed human-authored plan content”.
- Adjacent canonical work: [CR001](cr001-scope-confirmation-checkpoint.md) and
  [CR004](cr004-preserve-authored-story-index.md).
- Historical dogfooding: AF-003 in
  `docs/project/roadmap/cv20-builder-mode-evolution/ariad-dogfooding-ledger.md`.
- Exploration handoff:
  `docs/project/explorations/conditional-plan-preauthorization/`.
- Source investigation:
  `/Users/alissonvale/Desktop/investigations/2026-08-26-ariad-conditional-plan-preauthorization.md`.

## Outcome

CV20.DS15 delivered Driver-owned aggregate Plan preservation and exact Delivery
Story authority. CV20.DS16 carries the same hard-gate-preserving contract into
one implementable US/TS without inventing child scope or weakening the ordinary
approval fallback.

Promoted to Delivery Work because the correction changes Ariad lifecycle
authority, cursor persistence, CLI contracts, deterministic surfaces, and Pi
natural-language routing rather than remaining a localized refinement.
