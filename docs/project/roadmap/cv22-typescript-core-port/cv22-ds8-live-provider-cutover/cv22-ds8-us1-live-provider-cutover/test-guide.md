[< Story](index.md)

# Test Guide — CV22.DS8.US1

## Automated Validation

All hermetic; no test reaches the network — `fetch` is injected everywhere.

```bash
cd ts && npm run typecheck && npm run lint && npm test
```

| Area | File | What it pins |
|------|------|--------------|
| Transport | `ts/test/providers/openrouter.test.ts` | one case per `LlmTransportError.kind`; 401 not retried; 429 retried `MEMORY_LLM_MAX_RETRIES` times then `rate_limit`; 500→500→200 succeeds on attempt 3; backoff sequence through injected `sleep`; `retry-after` ≤ 60s wins; abort → `timeout`; 3xx → `provider_error` with `redirect: "error"`; single `Authorization` header; key planted in a 401 body comes back `[REDACTED]`; `JSON.stringify(error)` carries only `kind/status/retryable/message` and no key or body |
| Transport mode | `ts/test/providers/transport.test.ts` | `resolveProviderTransport`: revert var → `python`; replay var → `replay` (with and without `MIRROR_TS_EXTERNAL_ROUTES`); nothing → `live`; each with its reason string |
| Config | `ts/test/providers/config.test.ts` | timeout/retry resolvers: defaults, env override, non-numeric fails as Python's `float()`/`int()` would |
| Cost | `ts/test/providers/cost.test.ts` | golden from `ts/parity/generate_cost_golden.py`: exact float equality; unknown model → `null`; missing prompt usage → `null`; missing completion → 0 |
| Live embeddings | `ts/test/providers/embedding.test.ts` | `LiveEmbeddingProvider`: happy path returns vector + `promptTokens`; empty `data`/payload → empty vector (transient for `generateEmbeddingSafely`); non-numeric → `malformed_output`; embedding-tier timeout passed through; construction with no key does **not** throw (lazy config); `generateEmbeddingSafely` rethrows `ProviderConfigError` without firing `onAttempt` |
| Ledger | `ts/test/search/memorySearch.test.ts` | fake live provider → row with `prompt_tokens` and `cost_usd`; replay provider → both `null` (existing goldens byte-identical); provider throwing `ProviderConfigError` → degraded **and zero rows** |
| Routing | `ts/test/frontDoor/routing.test.ts` | consumes `resolveProviderTransport`; on degraded live search the front-door `detail` is `embedding_degraded kind=<kind> status=<n\|->` and contains no message text |

Regression proof that replay did not move: every existing golden and the
real-DB-copy harness (`uv run python ts/parity/real_db_copy_parity.py`
against `tmp/parity/demo-memory.db`) stay green, and the CI determinism gate
regenerates the new cost golden.

## E2E Decision

**Required.** First story where TS makes a paid provider call; a fixture-level
route cannot stand in for it.

## Navigator Validation

Preconditions: real `OPENROUTER_API_KEY` in the shell; a demo or copied DB at
`tmp/parity/demo-memory.db` (`uv run python
ts/parity/generate_demo_memory_db.py --out tmp/parity/demo-memory.db`).

| # | Route | Expected observation | Pass | Fail |
|---|-------|----------------------|------|------|
| 1 | `node ts/parity/live_embedding_smoke.ts --db tmp/parity/demo-memory.db` | Redacted summary: dim 1536, all finite, self-sim ≥ 0.999, distant-sim lower, 3 `embedding` rows with empty bodies and `latency_ms>0` (tokens/cost reported, not asserted) | exit 0 | any assertion; key visible in output; script accepts the production DB path |
| 2 | On the real home via Pi: `/mm-memories --search "<discriminating query>"` — a paraphrase with zero FTS overlap against a known memory; **record the query and the memory id here before running** | That memory is returned; no degraded note; front-door log `engine=ts` reason `DS8.US1 fresh semantic search live`; newest `llm_calls` row: role `embedding`, model = pin, `length(prompt)=0` | all four | memory absent; degraded note; non-empty prompt column; `engine=python` |
| 3 | `node ts/parity/live_embedding_smoke.ts --db <copy of the real db> --cross-check <memory-id>` | Cosine between the TS live re-embedding and the stored Python-era BLOB ≥ 0.99 | ≥ 0.99 | below — TS vectors are not in the corpus's space; stop, do not flip |
| 4 | Same query via `uv run python -m memory memories --search "<discriminating query>"`, then compare the two newest `embedding` rows | Same model; `prompt_tokens` and `cost_usd` both null or both non-null; equal `cost_usd` when priced | parity | any column disagrees in nullity or value |
| 5 | Same search with `OPENROUTER_API_KEY` unset | Python's exact degraded note, lexical results, **no** new ledger row; front-door `detail` shows `kind=auth` | matches | a live attempt, a row, or a detail carrying message text |
| 6 | Same search with `MIRROR_TS_SEARCH=0` | Front-door log `engine=python`, reason names the revert | routes to Python | routes to TS |
| 7 | `grep -c "<key>" <front-door log>` and `sqlite3 memory.db "select count(*) from llm_calls where prompt like '%<key>%' or response like '%<key>%'"` | `0` and `0` | both zero | anything else |

**Discriminating query (fill in before step 2):** query = `…`, expected memory id = `…`.

**Known accepted risk:** an install behind an HTTP proxy that worked on Python
will degrade to lexical after this flip unless `NODE_USE_ENV_PROXY=1` is set;
the degraded note will say "offline or no API key". Documented in REFERENCE.md.

## Validation Evidence

Pending implementation and validation.
