# Validation — CV22.DS8.US1

## Status

Passed

## Automated Checks

- cd ts && npm run typecheck && npm run lint && npm test -- 1893 tests pass; CI green on Tests + Docs workflows

Checks status: passed

## E2E

Decision: required

Evidence: Live OpenRouter calls on the real home and a real-DB copy, 2026-09-11: vector-space parity cos=1.000000 against a stored Python-era vector; live search returned 20 results with the target memory ddf1d328 at #2 for a query matching ZERO rows in memories_fts (lexical-only returns nothing, so results prove the semantic path ran); ledger row embedding|openai/text-embedding-3-small|11|2.2e-07|0|0; same query through Python produced an identical row except latency; keyless run degraded with zero ledger rows and logged kind=config; MIRROR_TS_SEARCH=0 routed to Python.

## Navigator Validation

Route: Five steps in test-guide.md: (1) node --env-file=.env ts/parity/live_embedding_smoke.ts --db tmp/parity/real-copy.db --cross-check ddf1d328; (2) live search on the real home with the discriminating query; (3) inspect the newest llm_calls row; (4) same query through Python and compare the two rows; (5) keyless degrade and MIRROR_TS_SEARCH=0 revert.

Navigator accepted: yes

Expected observation: Cross-check cosine >= 0.99; search returns results with no degraded note; one priced embedding row with empty bodies; Python and TS rows agree; keyless run writes no row and logs kind=config; revert routes to Python.

Pass condition: All five steps observed as above. Navigator personally ran steps 2-4 and reported matching output.

Fail condition: Cross-check below 0.99 (stop and revert, do not debug in production); degraded note with a key present; non-empty prompt/response columns; ledger rows disagreeing across engines; a ledger row written with no key.

## Missing Evidence

- none
