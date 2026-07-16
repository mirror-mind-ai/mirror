# Validation — CV22.DS5.US2

## Status

Passed

## Automated Checks

- cd ts && npm run typecheck && npm run lint && npm test; cd .. && git diff --check

Checks status: passed

## E2E

Decision: waived

Evidence: Runtime E2E/front-door extraction cutover is intentionally deferred to CV22.DS5.US4. Core-level replay and DB-copy validation covered LLM replay, fenced JSON parsing, memory/task extraction semantics, optional curation, summary/embedding persistence, metadata.extracted writes, task-failure fail-open behavior, and no live provider credentials.

## Navigator Validation

Route: Inspect ts/src/providers/llm.ts, ts/src/extraction/*, ts/src/conversation/extraction.ts, ts/test/extraction/*, and ts/test/conversation/*; confirm ts/src/frontDoor/routing.ts is unchanged; run cd ts && npm run typecheck && npm run lint && npm test; cd .. && git diff --check; inspect rg secret hits as intentional fake test strings/schema names/patterns only.

Navigator accepted: yes

Expected observation: TS extraction core can run against replayed LLM and embedding providers on a DB copy, producing memory/task/summary/embedding/metadata persistence effects without live provider calls or front-door routing.

Pass condition: Automated checks pass; parser and orchestration match Python fail-open/default/backfill behavior; DB-copy persistence works; no real provider credential, raw private transcript, or provider payload is committed; front-door routing remains unchanged.

Fail condition: Extraction semantics diverge, malformed provider responses crash where Python fails open, live credentials/network are required in CI, production DB mutation occurs, or extraction routing is cut over before US4.

## Missing Evidence

- none
