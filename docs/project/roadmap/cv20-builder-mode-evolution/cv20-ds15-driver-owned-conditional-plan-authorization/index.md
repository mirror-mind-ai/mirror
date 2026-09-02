[< CV20 — Builder Mode Evolution](../index.md)

# CV20.DS15 — Driver-Owned Conditional Plan Authorization

**Status:** ✅ Done

---

## Outcome

A Navigator can explicitly preauthorize approval of one future Delivery Story
Plan under exact structural conditions. Ariad carries that bounded authority
across materialization, but consumes it only after the Driver has preserved and
completed the actual Plan and the runtime revalidates Journey, active item,
cursor generation, flow unit, exact child-code set, Plan contract, and fixed
Navigator Validation stop. Any mismatch falls back to ordinary approval without
starting implementation.

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| CV20.DS15.TS1 | Driver-Owned Plan Fidelity And Completion | Technical Story | Plan materialization preserves authored content and exposes a blocking completeness check suitable for conditional approval | ✅ Done |
| CV20.DS15.TS2 | Cursor-Bound Exact-Scope Authorization Receipt | Technical Story | A bounded, private, single-use receipt binds Navigator authority to one Journey, cursor generation, Delivery Story, flow unit, exact child set, Plan contract, and stop boundary | ✅ Done |
| CV20.DS15.TS3 | Preauthorization Verification And Invalidation | Technical Story | Exact-scope consumption is atomic and idempotent, mismatch reasons are bounded, retries do not approve twice, and ordinary approval remains the fallback | ✅ Done |
| CV20.DS15.US1 | One-Turn Conditional Plan Orchestration | User Story | Explicit natural language can plan, complete, conditionally approve, and start local implementation without another Navigator turn, then stop at Navigator Validation | ✅ Done |

## Done Condition

A Delivery Story with an exact child-code set can receive explicit conditional
preauthorization, materialize and complete a Driver-owned Plan, consume authority
once after structural revalidation, emit deterministic Plan/approval/start
surfaces in order, and stop at Navigator Validation. Missing authorization,
incomplete Plans, changed authority coordinates, unsafe actions, and vague
requests preserve the current hard stop. Story-by-story flow and generalized
delegation remain deferred.

## Inputs

- [CR015 — Preserve Driver-authored Plan before approval](../../../refinement/rs001-ariad-runtime-trust/cr015-preserve-driver-authored-plan-before-approval.md)
- [Conditional Plan Preauthorization exploration](../../../explorations/conditional-plan-preauthorization/index.md)
- [CR001 — Make scope confirmation an honest checkpoint](../../../refinement/rs001-ariad-runtime-trust/cr001-scope-confirmation-checkpoint.md)
- [CR004 — Preserve authored story index during Plan materialization](../../../refinement/rs001-ariad-runtime-trust/cr004-preserve-authored-story-index.md)
