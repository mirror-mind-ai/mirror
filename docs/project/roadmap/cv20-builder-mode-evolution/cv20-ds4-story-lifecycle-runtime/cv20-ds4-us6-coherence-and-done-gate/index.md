[< CV20.DS4](../index.md)

# CV20.DS4.US6 — Coherence And Done Gate

**Status:** ✅ Done
**Type:** User Story

---

## Outcome

Builder closes an Ariad story only after Review, Coherence, and history policy are satisfied, producing a deterministic Done surface and next-pull recommendation.

---

## Acceptance Behavior

```text
Given validation has been accepted
When Builder performs Debt Review and Coherence
Then it records debt paid, introduced, and carried forward
And verifies Process, Project, and Product alignment
And surfaces any local-guide-vs-Ariad differences
```

```text
Given Review and Coherence are satisfied
When Builder reaches Done
Then it renders a Done surface
And records history according to policy
And updates roadmap/worklog/story package as needed
And recommends next Pull, parent collapse, or release boundary
```

---

## Scope

- Add Debt Review surface/operation. ✅ Covered by CV20.DS8.US1.
- Add Coherence surface/operation.
- Add Done surface/operation.
- Enforce required trace/doc/history policy before closure.
- Recommend next Ariad movement.

---

## Out Of Scope

- Accelerated/autonomous cadence.
- Release execution unless local policy requires it.

---

## Validation

Focused tests plus end-to-end Pi/Mirror lifecycle validation on sandbox-pet-store after Plan and Validation stories are complete.

Manual validation confirmed:

```text
COHERENCE_CHECKPOINT -> status coherent -> missing coherence ✓ none
DONE_CHECKPOINT -> status done -> missing done ✓ none
```
