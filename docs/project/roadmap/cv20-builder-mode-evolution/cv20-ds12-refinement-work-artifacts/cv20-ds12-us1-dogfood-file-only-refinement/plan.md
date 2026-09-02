# Plan — CV20.DS12.US1 Dogfood File-Only Refinement

## Objective

Exercise the canonical Workbench on one real selection and planning transition, then
judge the document model from observed use rather than hypothetical automation needs.

## Scope

Change only:

```text
docs/project/refinement/index.md
docs/project/refinement/rs001-ariad-runtime-trust/cr001-scope-confirmation-checkpoint.md
```

The US1 roadmap package may change only for lifecycle evidence.

## Transition

Apply one coherent file-only transition:

```text
current RS: none  → RS001
current CR: none  → CR001
RS001: proposed   → active
CR001: captured   → planned
```

The root index remains the only canonical status authority. Do not add status metadata
to the RS or CR document.

## CR001 Plan Content

Replace the pending decision with a bounded, reproduction-first plan:

1. Reproduce the scope-confirmation ordering under checkpoint cadence against the
   current runtime.
2. If it no longer reproduces, record current evidence and close the CR without code.
3. If it reproduces, characterize the emitted surface and filesystem writes before any
   change.
4. Choose the smallest honest behavior: a real pre-materialization stop or explicitly
   non-gating wording. Do not implement both.
5. Add focused regression evidence for ordering and disk effects.
6. Preserve existing authorization and publication boundaries.

US1 records this plan only; it does not execute it.

## Dogfooding Observation

After the transition, record in the US1 validation evidence whether:

- the next action was obvious from the root index;
- changing focus and two statuses in one place was understandable;
- the CR document held enough context to plan without SQLite;
- any friction justifies changing the document contract now.

Observed inconvenience alone is not authorization for automation.

## Non-Goals

- No CR001 implementation or runtime source/test changes.
- No changes to CR002 or CR003.
- No generated state, parser, schema, database, synchronization, or handoff.
- No migration or removal of CV20.DS6 records.
- No new status vocabulary.

## Acceptance Behavior

```text
Given docs/project/refinement/index.md is the sole status authority
When CR001 is selected and planned
Then the root focus and statuses reflect that transition
And CR001 contains a concrete reproduction-first plan
And a fresh reader can identify CR002 as next without local runtime state
```

## Validation Route

Run:

```bash
python scripts/check_doc_links.py
git diff --check
```

Then read only `docs/project/refinement/index.md` and CR001 to answer:

1. What is active?
2. What is planned but not implemented?
3. What comes next?
4. What evidence gate precedes CR001 implementation?

E2E decision: required as this file-only transition and navigation exercise. No full
software suite is warranted.

## Implementation Contract

- Make the transition as one reviewable documentation change.
- Preserve the exact status vocabulary approved in TS1.
- Record observed friction; do not solve hypothetical friction.
- Commit only the Workbench transition and US1 lifecycle documentation.
- Do not push, publish, merge, tag, or release.

## Stop Conditions

- Planning CR001 requires SQLite or conversation-only context.
- Status must be duplicated outside the root index.
- The transition requires code or automatic machinery.
- The selected CR cannot be bounded without implementation.

## Approval Gate

Implementation begins only after Navigator approval of this dogfooding transition.
