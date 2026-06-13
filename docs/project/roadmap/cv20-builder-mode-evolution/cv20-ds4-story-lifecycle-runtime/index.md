[< CV20](../index.md)

# CV20.DS4 — Story Lifecycle Runtime

**Status:** 🟢 Active

---

## Outcome

Builder can guide Ariad delivery work through Pull, Prepare, Expand/Plan, Approval, Implement, Validation, Review, Coherence, and Done using deterministic lifecycle gates and explicit cadence policy.

---

## Planning Done Target

Before DS4 continues into implementation/validation stages, Builder must reach a methodologically consistent Plan Done state:

- Ariad knows which work item levels are implementable by default.
- Delivery Stories always expand into implementable User/Technical Stories before Plan.
- Runtime cadence distinguishes stepwise testing from normal checkpoint flow.
- Plan materializes a complete story package, not only `plan.md`.
- Plan approval and implementation guard are deterministic runtime transitions.

---

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| [CV20.DS4.TS1](cv20-ds4-ts1-surface-routing-definitions/index.md) | Surface Routing Definitions | Technical Story | Ariad method data declares which surfaces roadmap inspection emits | ✅ Done |
| [CV20.DS4.TS2](cv20-ds4-ts2-lifecycle-contract-definitions/index.md) | Lifecycle Contract Definitions | Technical Story | Ariad method data declares phase-specific lifecycle contracts for runtime gates | ✅ Done |
| [CV20.DS4.TS3](cv20-ds4-ts3-deterministic-ariad-surface-delivery/index.md) | Deterministic Ariad Surface Delivery | Technical Story | Ariad runtime surfaces are wrapped as deterministic transport artifacts | ✅ Done |
| [CV20.DS4.US0](cv20-ds4-us0-inspect-pull-candidates/index.md) | Inspect Pull Candidates | User Story | Navigator can ask to see the roadmap and pull candidates before selecting active work | ✅ Done |
| [CV20.DS4.US1](cv20-ds4-us1-pull-and-prepare/index.md) | Pull and Prepare | User Story | Navigator can pull DS/US/TS work and see Prepare assess context, risks, rules, and granularity | ✅ Done |
| [CV20.DS4.TS4](cv20-ds4-ts4-work-item-levels-and-expand-contract/index.md) | Work Item Levels And Expand Contract | Technical Story | Ariad declares implementability and mandatory Delivery Story expansion before Plan | ✅ Done |
| [CV20.DS4.TS5](cv20-ds4-ts5-cadence-profiles-and-stop-policy/index.md) | Cadence Profiles And Stop Policy | Technical Story | Builder distinguishes stepwise testing from checkpoint cadence without changing Ariad lifecycle order | ✅ Done |
| [CV20.DS4.TS6](cv20-ds4-ts6-surface-transport-contract/index.md) | Surface Transport Contract | Technical Story | Ariad surfaces are DSL-declared verbatim runtime artifacts across every lifecycle phase | ✅ Done |
| [CV20.DS4.US2](cv20-ds4-us2-plan-package-and-granularity-gate/index.md) | Plan Package And Granularity Gate | User Story | Builder expands Delivery Stories, recommends a child story, and materializes index/plan/test-guide for implementable stories | ✅ Done |
| [CV20.DS4.US3](cv20-ds4-us3-approval-and-implementation-guard/index.md) | Approval And Implementation Guard | User Story | Navigator approval is a deterministic transition and implementation refuses without it | ✅ Done |
| [CV20.DS4.US4](cv20-ds4-us4-validation-checkpoint/index.md) | Validation Checkpoint | User Story | Builder presents automated evidence, E2E decision/evidence, and Navigator validation route | 🟢 Active |
| [CV20.DS4.US5](cv20-ds4-us5-accelerated-and-autonomous-cadence/index.md) | Accelerated And Autonomous Cadence | User Story | Navigator can opt into higher-autonomy cadence profiles while hard gates remain enforced | 🟡 Planned |
| [CV20.DS4.US6](cv20-ds4-us6-coherence-and-done-gate/index.md) | Coherence And Done Gate | User Story | Builder verifies debt/coherence/history, closes the story, and recommends next Pull/collapse/release | 🟡 Planned |

---

## Done Condition

DS4 is done when a non-trivial story can move through the Ariad lifecycle without the Driver silently skipping checkpoints, treating non-implementable work as implementable, or declaring progress without required artifacts and evidence.
