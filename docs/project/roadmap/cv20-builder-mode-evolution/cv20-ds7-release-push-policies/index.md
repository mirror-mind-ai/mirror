[< CV20](../index.md)

# CV20.DS7 — Release And Push Policies

**Status:** 🟡 Planned

---

## Outcome

Builder distinguishes release intent, commit, push, and release publication as separate delivery concerns governed by explicit Ariad policy.

Release intent belongs primarily to a Delivery Story or parent delivery boundary. It may be planned near DS pull/expand, revised as the DS becomes clearer, or emerge naturally when the final child story closes. Release intent does not authorize push, tag creation, stable promotion, or release publication.

---

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| [CV20.DS7.US1](cv20-ds7-us1-define-delivery-story-release-intent/index.md) | Define Delivery Story Release Intent | User Story | Builder can optionally record release intent at the Delivery Story level without authorizing release actions | 🟡 Planned |
| CV20.DS7.US2 | Show Release Intent Progress | User Story | Builder shows release-boundary progress after child story Done events, including completed/remaining stories and blocked release actions | 🟡 Planned |
| CV20.DS7.US3 | Decide Release At Delivery Collapse | User Story | Builder surfaces prepare/defer/no-release choices when a Delivery Story completes, including emergent release intent when none was planned | 🟡 Planned |
| CV20.DS7.TS1 | Commit Push Release Policy Resolver | Technical Story | Runtime resolves effective commit, push, and release policies from method defaults, project settings, journey state, and overrides | 🟡 Planned |
| CV20.DS7.US4 | Push Checkpoint Or Autopush | User Story | Builder asks before push by default and supports configured auto-push only when effective policy allows it | 🟡 Planned |
| CV20.DS7.US5 | Release Authorization Checkpoint | User Story | Builder separates release preparation from tag creation, stable promotion, push, and publication authorization | 🟡 Planned |

---

## Policy Boundary

- Release intent is not release authorization.
- Commit approval is not push approval.
- Push approval is not release approval.
- Release preparation is not release publication.
- DS9 may later make these policies configurable through method preferences and overrides.

---

## Done Condition

DS7 is done when Builder can define and track release intent for Delivery Stories, record local history, push remote history, and prepare/publish release work without conflating those actions or bypassing Navigator authorization.
