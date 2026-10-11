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
| 1 | `node --env-file=.env ts/parity/live_embedding_smoke.ts --db tmp/parity/demo-memory.db` | Redacted summary: dim 1536, all finite, self-sim ≥ 0.999, distant-sim lower, 3 `embedding` rows with empty bodies and `latency_ms>0` (tokens/cost reported, not asserted) | exit 0 | any assertion; key visible in output; script accepts the production DB path |
| 2 | On the real home via Pi: `/mm-memories --search "<discriminating query>"` — a paraphrase with zero FTS overlap against a known memory; **record the query and the memory id here before running** | That memory is returned; no degraded note; front-door log `engine=ts` reason `DS8.US1 fresh semantic search live`; newest `llm_calls` row: role `embedding`, model = pin, `length(prompt)=0` | all four | memory absent; degraded note; non-empty prompt column; `engine=python` |
| 3 | `node --env-file=.env ts/parity/live_embedding_smoke.ts --db <copy of the real db> --cross-check <memory-id>` | Cosine between the TS live re-embedding and the stored Python-era BLOB ≥ 0.99 | ≥ 0.99 | below — TS vectors are not in the corpus's space; stop, do not flip |
| 4 | Same query via `uv run python -m memory memories --search "<discriminating query>"`, then compare the two newest `embedding` rows | Same model; `prompt_tokens` and `cost_usd` both null or both non-null; equal `cost_usd` when priced | parity | any column disagrees in nullity or value |
| 5 | Same search with `OPENROUTER_API_KEY` unset | Python's exact degraded note, lexical results, **no** new ledger row; front-door `detail` shows `kind=auth` | matches | a live attempt, a row, or a detail carrying message text |
| 6 | Same search with `MIRROR_TS_SEARCH=0` | Front-door log `engine=python`, reason names the revert | routes to Python | routes to TS |
| 7 | `grep -c "<key>" <front-door log>` and `sqlite3 memory.db "select count(*) from llm_calls where prompt like '%<key>%' or response like '%<key>%'"` | `0` and `0` | both zero | anything else |

**Discriminating query (chosen 2026-09-10, verified against the real-DB copy):**

```text
What counterpart should an assistant embody to deserve a conversation?
```

Verified property: this phrase matches **zero** rows in `memories_fts` on the
real corpus, so lexical-only search returns *nothing*. A non-empty result set
therefore proves the semantic term ran — a far stronger signal than the
absence of a degraded note. Semantically it is a paraphrase of memory
`ddf1d328` ("the ego layer is a negative image of the user… what someone
talking to the AI needs to become to be worth talking to").

**Cross-check memory (step 3):** `ddf1d328` — current-pin provenance
(`openai/text-embedding-3-small`), 6144-byte vector. Note the smoke re-embeds
`title. content Context: <context>`; every current-pin memory on this home has
a non-empty `context`, and omitting it would compare two different sentences
and report a meaningless cosine.

**Known accepted risk:** an install behind an HTTP proxy that worked on Python
will degrade to lexical after this flip unless `NODE_USE_ENV_PROXY=1` is set;
the degraded note will say "offline or no API key". Documented in REFERENCE.md.

## Validation Evidence

Run 2026-09-11, real home (`~/.mirror-minds/vinicius-ts`), live OpenRouter,
against `ts/parity/real-copy.db` for the copy-only steps. Total spend: four
embedding calls, well under one cent.

**1. Live smoke + vector-space parity — PASS**

```text
live embedding smoke -- model=openai/text-embedding-3-small db=tmp/parity/real-copy.db
  ok  dimension (1536 == 1536)
  ok  all values finite (no NaN or Infinity would reach the corpus)
  ok  self-similarity (cos=1.000000 >= 0.999)
  ok  an unrelated sentence is further away (cos=0.0321 < 1.0000)
  ..  first-call latency 1533ms, usage prompt_tokens=14
  ok  vector-space parity with the stored Python-era vector (cos=1.000000 >= 0.99)
  ok  ledger rows written (1 new llm_calls rows)
  ok  every row names the configured pin (openai/text-embedding-3-small)
  ok  bodies withheld (metadata mode never persists the query text)
  ok  latency recorded (a real round-trip took measurable time)
  ..  usage reported on 1/1 rows
PASS live embedding smoke
```

`cos=1.000000` against a stored Python-era vector is the load-bearing result:
TS embeds into the same space as the existing corpus, so no ranking moves.

**2. Live search, real home — PASS.** The discriminating query returned 20
results with no degraded note, and `ddf1d328` — the memory the query was
built to paraphrase — ranked #2 at 0.401. The query matches zero rows in
`memories_fts`, so lexical-only would have returned nothing; results at all
prove the semantic term ran.

**3. Ledger row — PASS.** Exactly one new row (451 → 452):

```text
role|model|prompt_tokens|cost_usd|latency_ms|prompt_len|resp_len
embedding|openai/text-embedding-3-small|11|2.2e-07|1264|0|0
```

Priced (11 tokens x $0.00002/1k = 2.2e-07), bodies withheld. Front-door log:
`memories  ts  exit=0`.

**4. Cross-engine parity — PASS.** The same query through
`uv run python -m memory memories --search`, then the two newest rows:

```text
Python: openai/text-embedding-3-small | 11 | 2.2e-07 | 1346ms | 0 | 0
TS:     openai/text-embedding-3-small | 11 | 2.2e-07 | 1264ms | 0 | 0
```

Identical in every column except latency. The `> 0` assumption the plan
review replaced with a parity criterion was the right call, but in the event
OpenRouter does report usage for embeddings, so both engines price the row.

**5a. Unconfigured install — PASS.** Python's exact degraded note, lexical
results, and **zero** new ledger rows — the `ProviderConfigError` bypass
holding. Front-door log carries the class, not a guess:
`embedding_degraded kind=config`.

**5b. Revert — PASS.** `MIRROR_TS_SEARCH=0` routes to Python
(`{"engine":"python","reason":"MIRROR_TS_SEARCH=0 revert to Python"}`) and the
front-door log records route `python`.

**Two harness defects found and fixed while preparing this route** (neither in
product code): the cross-check embedded a null `context` where Python appends
`Context: ...`, which would have reported a low cosine and looked exactly like
the vector-space failure whose documented response is to abort the cutover;
and the smoke asserted ledger rows while calling the provider directly,
bypassing the layer that writes them.

**Not exercised.** Live `timeout`, `auth`, `rate_limit`, and `provider_error`
paths against a real provider — covered only by hermetic tests with an
injected `fetch`. Forcing them live would mean revoking a key or provoking a
429, which costs more than it proves at this stage.
