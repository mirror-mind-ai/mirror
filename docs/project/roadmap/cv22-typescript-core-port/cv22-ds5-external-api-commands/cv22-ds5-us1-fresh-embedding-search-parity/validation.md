# Validation — CV22.DS5.US1

## Status

Passed

## Automated Checks

- cd ts && npm run typecheck && npm run lint && npm test; cd .. && git diff --check

Checks status: passed

## E2E

Decision: waived

Evidence: Runtime E2E/front-door cutover is intentionally deferred to CV22.DS5.US4. Core-level DB-copy fixture validation covered replayed embeddings, FTS lexical scores, grouped access counts, TS ranker integration, and logAccess side effects without live provider credentials.

## Navigator Validation

Route: Inspect ts/src/providers/embedding.ts, ts/src/search/memorySearch.ts, and ts/test/search/memorySearch.test.ts; confirm ts/src/frontDoor/routing.ts is unchanged; run cd ts && npm run typecheck && npm run lint && npm test; cd .. && git diff --check; inspect rg secret hits as intentional test/pattern strings only.

Navigator accepted: yes

Expected observation: TS fresh-search core composes replayed query embeddings, DB memory rows, FTS lexical scores, grouped access counts, existing ranker, and logAccess on DB copies; no live provider call or route cutover is required.

Pass condition: Automated checks pass; grouped access counts match per-id COUNT semantics; access logging side effects happen only on DB copies; no real provider credential or private payload is committed; front-door routing remains unchanged.

Fail condition: Ordered/ranking core behavior diverges, grouped access counts drift, live provider credentials are required in CI, production DB mutation occurs, or memories --search is routed before US4.

## Missing Evidence

- none
