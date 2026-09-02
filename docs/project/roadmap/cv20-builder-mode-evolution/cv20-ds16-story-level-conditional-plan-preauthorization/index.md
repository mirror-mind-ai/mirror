[< CV20 — Builder Mode Evolution](../index.md)

# CV20.DS16 — Story-Level Conditional Plan Preauthorization

**Status:** ✅ Done

---

## Outcome

A Navigator can naturally delegate creation and execution of one active User
Story or Technical Story Plan without reciting runtime policy, while accelerated
cadence continues through the same Plan gate by default. Ariad derives bounded
structural authority, consumes it only after the Driver-owned Plan is complete
and every story coordinate still matches, starts local implementation without a
redundant approval turn, and stops at Navigator Validation. Any mismatch
preserves ordinary Plan approval.

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| CV20.DS16.TS1 | Flow-Aware Story Plan Authorization Receipt | Technical Story | The existing bounded receipt safely represents either aggregate Delivery Story scope or one exact implementable story without weakening old receipts | ✅ Done |
| CV20.DS16.TS2 | Atomic Story Plan Preauthorization Lifecycle | Technical Story | `plan-item`, story Plan approval, cancellation, retries, and cursor transitions consume or invalidate story authority atomically and conservatively | ✅ Done |
| CV20.DS16.TS3 | Story Preauthorization Verification Matrix | Technical Story | Synthetic unit, CLI, privacy, malformed-state, mismatch, and subprocess-concurrency evidence proves exact single-use story authority | ✅ Done |
| CV20.DS16.US1 | One-Turn Conditional Story Orchestration | User Story | Natural delegation or accelerated cadence can plan, complete, conditionally approve, and start one US/TS without another Navigator turn, then stop at Navigator Validation | ✅ Done |

## Done Condition

An active User Story or Technical Story in `story_by_story` flow can receive
natural explicit delegation in stepwise/checkpoint cadence or automatic bounded
Plan authority in accelerated cadence, materialize and preserve a complete
Driver-owned Plan, consume authority exactly once after structural revalidation,
emit deterministic Plan/approval/start surfaces in order, and stop at Navigator
Validation. Missing authority, vague stepwise language, incomplete Plans, changed
coordinates, malformed receipts, retries, cancellation, and unsupported actions
remain blocked or fall back to ordinary approval. Delivery Story behavior remains
backward-compatible.

## Inputs

- [CV20.DS15 — Driver-Owned Conditional Plan Authorization](../cv20-ds15-driver-owned-conditional-plan-authorization/index.md)
- [CR015 — Preserve Driver-authored Plan before approval](../../../refinement/rs001-ariad-runtime-trust/cr015-preserve-driver-authored-plan-before-approval.md)
- [Conditional Plan Preauthorization exploration](../../../explorations/conditional-plan-preauthorization/index.md)
- Source investigation: `/Users/alissonvale/Desktop/investigations/2026-08-26-ariad-conditional-plan-preauthorization.md`
