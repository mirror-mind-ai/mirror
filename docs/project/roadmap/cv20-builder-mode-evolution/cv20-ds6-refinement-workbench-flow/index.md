[< CV20](../index.md)

# CV20.DS6 — Refinement Workbench And Flow

**Status:** ✅ Done

---

## Outcome

Builder supports Ariad Refinement Work as a first-class work field outside the
roadmap. The Workbench holds Refinement Stories and Change Requests. Builder
activation can surface both roadmap and workbench state. The Navigator can create
or compose a Refinement Story, add Change Requests, pull the Refinement Story,
traverse Change Request cycles, review the whole refinement arc, check coherence,
and close the Refinement Story with outcomes preserved.

This story implements the Mirror runtime shape for Ariad's Refinement work area,
based on the Ariad branch `ariad-refinement-workbench` at commit `2447705`.

---

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| [CV20.DS6.US1](cv20-ds6-us1-builder-home-work-fields/index.md) | Builder Home Work Fields | User Story | Navigator sees current Delivery and Refinement fields during Builder activation, including roadmap state, workbench summary, active RS, and available moves | ✅ Done |
| [CV20.DS6.TS1](cv20-ds6-ts1-workbench-storage-model/index.md) | Workbench Storage Model | Technical Story | Runtime persists Refinement Stories and Change Requests outside the roadmap, with status, ordering, association, provenance, and active RS state | ✅ Done |
| [CV20.DS6.US2](cv20-ds6-us2-compose-refinement-story/index.md) | Compose A Refinement Story | User Story | Navigator can create an RS and add CRs to it during use, receiving visible Change Request Captured and Refinement Story Overview surfaces | ✅ Done |
| [CV20.DS6.US3](cv20-ds6-us3-pull-refinement-story/index.md) | Pull A Refinement Story | User Story | Navigator can pull an RS from the Workbench and Builder resumes into Refinement Work instead of Delivery Work | ✅ Done |
| [CV20.DS6.TS2](cv20-ds6-ts2-refinement-flow-runtime/index.md) | Refinement Flow Runtime | Technical Story | Runtime supports RS-level flow and CR-level cycles, from RS pull through CR done notes and RS review, coherence, and close | ✅ Done |
| [CV20.DS6.US4](cv20-ds6-us4-traverse-change-request-cycles/index.md) | Traverse Change Request Cycles | User Story | Navigator can work through one CR at a time with confirmation, short plan, implementation, validation evidence, and done note | ✅ Done |
| [CV20.DS6.US5](cv20-ds6-us5-close-refinement-story/index.md) | Close A Refinement Story | User Story | Navigator can review the RS as a whole, record debt or follow-up without mutating during review, run coherence, and close the RS with CR outcomes preserved | ✅ Done |

---

## Policy Boundary

- Roadmap items remain Delivery Work.
- Workbench items are Refinement Work.
- A Change Request says what should change.
- A Refinement Story tells the story of the refinement and is the unit that flows.
- Quick refinement creates a minimal RS with one CR and pulls it immediately.
- Review does not mutate files directly. Mutations happen only through CR cycles.
- If a CR grows into a product promise, public contract, broad architecture
  change, or release-governing policy, it is promoted to Delivery Work.

---

## Conscious Non-Goals

- No Signal Field implementation.
- No automatic CR clustering or AI-suggested RS composition.
- No web UI for Workbench.
- No full debt ledger implementation.
- No release and push policy implementation.
- No method preference override system.
- No requirement that the Ariad Refinement branch be merged to Ariad `main`
  before Mirror can dogfood the runtime shape.

---

## Done Condition

DS6 is done when Builder can show a Workbench-aware activation surface, persist
Refinement Stories and Change Requests, compose an RS from CRs, pull an RS into
active Refinement Work, traverse CR cycles with validation evidence and done
notes, review and check coherence at the RS level, and close the RS with CR
outcomes preserved.

The first dogfooding target after DS6 is `RS-001 — Builder lifecycle end-to-end
refinement`, which should live in the Workbench rather than the roadmap.

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
- [Validation](validation.md)
- [Debt Review](review.md)
- [Coherence](coherence.md)
- [Done](done.md)
