# Review — CV22.DS8.US1

## Status

Reviewed

## Debt Findings

- Three findings from the post-validation panel review. Two were defects in this story's delivery and were FIXED before closure: the smoke script duplicated ranker.ts's cosine (a similarity harness must measure the way search measures), and nothing asserted that searchRoute builds the provider routing.ts announced (two files reading the same variables, so a route stuck on replay while the router said live would have been invisible). The third is NOT this story's code: contentTailRoute's journal embedding bypasses generateEmbeddingSafely, so it has no bounded retry, no AI-07 dimension guard, and writes no llm_calls row -- captured as CR075 (RS010), owned by DS8.US3 which flips journal live. Accepted scope boundaries, documented not coded around: Node's fetch ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY=1 and uses its own CA store, so a proxied install degrades where Python would not; the live timeout/auth/rate_limit/provider_error paths are covered only by hermetic tests with an injected fetch, since forcing them live means revoking a key or provoking a 429. No denial-of-wallet guard exists on the live embedding path; AI-19 assigns spend guards to DS9, and this leaf is one call per user-typed search.

## Debt Decision

defer

## Defer Reason

CR075 is real unlogged spend once journal goes live, but fixing it here means editing a leaf this story deliberately excluded from scope, and the fix belongs in the same commit as the flip so the ledger row exists the first time the call is billable.

## Revisit Trigger

DS8.US3, when journal / week plan / descriptor generate / soul harvest save flip to the live provider.

## Missing Decision

- none
