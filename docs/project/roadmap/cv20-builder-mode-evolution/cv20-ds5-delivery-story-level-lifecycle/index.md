[< CV20](../index.md)

# CV20.DS5 — Delivery Story Level Lifecycle

**Status:** 🟢 Active

---

## Outcome

Builder supports a Navigator-facing lifecycle at the Delivery Story level while still expanding Delivery Stories into User/Technical Stories for Driver planning, implementation traceability, and validation evidence.

The Navigator can choose whether a Delivery Story should be governed story-by-story or as one aggregate Delivery Story flow. In aggregate mode, the Navigator approves the DS-level plan up front, the Driver executes child work units internally, and the Navigator validates the coherent DS outcome at the end.

---

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| [CV20.DS5.US1](cv20-ds5-us1-choose-navigator-flow-unit/index.md) | Choose Navigator Flow Unit | User Story | Navigator can choose story-by-story or delivery-story lifecycle cadence after DS expansion | ✅ Done |
| [CV20.DS5.TS1](cv20-ds5-ts1-delivery-story-lifecycle-state/index.md) | Delivery Story Lifecycle State | Technical Story | Runtime stores and resumes DS-level lifecycle state, flow unit, child work package list, and aggregate checkpoint status | ✅ Done |
| [CV20.DS5.TS2](cv20-ds5-ts2-aggregate-delivery-story-plan-runtime/index.md) | Aggregate Delivery Story Plan Runtime | Technical Story | Runtime renders and approves DS-level Plan checkpoints while preserving child story traceability | 🟡 Planned |
| [CV20.DS5.US2](cv20-ds5-us2-delivery-story-plan-checkpoint/index.md) | Delivery Story Plan Checkpoint | User Story | Navigator can request and approve one aggregate DS plan through Builder Mode natural interaction | 🟡 Planned |
| CV20.DS5.US3 | Delivery Story Validation And Closure | User Story | Navigator validates the aggregate DS result before DS-level debt review, coherence, and done | 🟡 Planned |

---

## Policy Boundary

- Delivery Stories still expand into User/Technical Stories.
- Delivery Story lifecycle does not mean implementing an unexpanded DS as one opaque unit.
- Child story artifacts and evidence remain required for traceability.
- Navigator-facing checkpoints may occur at either child-story level or Delivery Story level.
- Hard gates remain hard in both modes: unsafe operations, scope changes, debt decisions, push, release, and Done/history boundaries.

---

## Done Condition

DS5 is done when Builder can ask for, persist, resume, and enforce the Navigator flow unit for a Delivery Story, allowing either story-by-story lifecycle or aggregate Delivery Story lifecycle without losing child-story traceability.
