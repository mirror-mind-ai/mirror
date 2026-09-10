[< Parent](../index.md)

# CV22.DS8.US1 — Live transport substrate + live embeddings + `memories --search` cutover

**Status:** 🟡 Planned
**Type:** User Story

---

## User Story

As the Mirror's owner running `/mm-memories --search "..."` from a real home
with only `OPENROUTER_API_KEY` configured,
I want the fresh semantic search to answer from the TypeScript core against a
live OpenRouter embedding call,
So that the highest-volume LLM role in my ledger stops depending on the Python
core, and the TS `live` transport exists for every later cutover to reuse.

## Outcome

`memories --search` routes to TS by default. With a key it runs a live
embedding (1536-dim, finite, self-consistent) and writes an `llm_calls` row
shaped and priced like Python's; without a key it degrades to lexical-only
with Python's exact note; `MIRROR_TS_SEARCH=0` sends the family back to Python;
the replay path keeps working for CI and the parity harness.

## Acceptance Behavior

```text
Given a real memory.db home, OPENROUTER_API_KEY set, no MIRROR_TS_* variables
When the owner runs `memories --search "<query>"` through the front door
Then the front-door log records engine=ts with a "live" routing reason
And the results are semantic (no "⚠ Degraded" note)
And one new llm_calls row exists: role=embedding, model=<configured pin>,
    prompt_tokens > 0, cost_usd > 0, latency_ms > 0, prompt="" and response=""
And no log line, ledger column, or error message contains the API key

Given the same home with OPENROUTER_API_KEY unset
When the owner runs the same search
Then the "⚠ Degraded: lexical-only search (embedding unavailable — offline or
    no API key)." note is printed and lexical results follow (Python parity)

Given MIRROR_TS_SEARCH=0
When the owner runs the same search
Then the front door routes to Python with a revert reason

Given MIRROR_TS_SEARCH_EMBEDDING_REPLAY=<fixture>
When CI or the real-DB-copy harness runs a search
Then the replay provider answers exactly as before this story (no live call)
```

## Scope

- `ts/src/providers/openrouter.ts` — one fetch-based OpenRouter HTTP client:
  Authorization from `resolveProviderConfig`, `AbortSignal.timeout`, bounded
  retries on the same classes the OpenAI SDK retries for Python
  (connection errors, 408, 409, 429, 5xx), exponential backoff with
  injectable sleep, `redirect: "error"`, `LlmTransportError` with the AI-18
  taxonomy and a structurally minimal shape, key redaction.
- `ts/src/providers/transport.ts` — `resolveProviderTransport`, the single
  revert → replay → live precedence every later family reuses.
- `ts/src/providers/config.ts` — `MEMORY_LLM_TIMEOUT_EXTRACTION|RECEPTION|EMBEDDING`
  and `MEMORY_LLM_MAX_RETRIES` resolvers mirroring Python's names/defaults.
- `ts/src/providers/embedding.ts` — `LiveEmbeddingProvider` (lazy config);
  `EmbeddingProvider` widened to return usage so the ledger row can be
  priced; `ProviderConfigError` bypasses the ledger hook, as Python's
  pre-loop `RuntimeError` does.
- `ts/src/providers/cost.ts` — port of `cost.py` (`MODEL_PRICES`, `computeCost`).
- `ts/src/search/memorySearch.ts` — ledger row carries `prompt_tokens` and
  `cost_usd` like Python's `build_llm_logger`.
- `ts/src/frontDoor/routing.ts` + `searchRoute.ts` — live-by-default search
  route, `MIRROR_TS_SEARCH=0` revert, replay precedence preserved; degraded
  taxonomy kind/status in the front-door log detail.
- `ts/parity/live_embedding_smoke.ts` — Navigator-run live smoke contract,
  plus `--cross-check <memory-id>` for vector-space parity against a stored
  Python-era vector.
- Docs: burn-down ledger, `mm-memories` skill copies, REFERENCE.md env table
  (incl. `NODE_EXTRA_CA_CERTS`, `NODE_USE_ENV_PROXY`), decision record.

## Out Of Scope

- Live **chat** completions and the conversation close tail (US2).
- Live credits / `fetchGenerationCost` and `consult` (US3).
- Flipping any of the other fifteen replay-gated leaves (US2/US3).
- Retiring `MIRROR_TS_EXTERNAL_ROUTES` for families other than search (US3).
- The `descriptor` ledger gap and the `eval` runner decision (US3/TS1).
- Any change to ranking, MMR, FTS, or access logging.

## Validation

Hermetic tests with an injected `fetch` (no network in CI); the replay path
unchanged in CI and the harness; a Navigator-run live smoke contract on a DB
copy; one real search on the real home; revert exercised. See
[plan.md](plan.md) and [test-guide.md](test-guide.md).

---

## Handoff — plateau 1–6 implemented, Navigator validation pending (2026-09-10)

**What is now true.** The live transport substrate exists and the search leaf
is cut over. Five commits, CI green at `7e00bed` (Tests + Docs):

| Plateau | Commit | Landed |
|---|---|---|
| 1 | `400494f` | `cost.ts` port + golden; per-role timeout/retry resolvers |
| 2 | `fbd1004` | `openrouter.ts` fetch client; `transport.ts` precedence |
| 3–4 | `8251456` | `LiveEmbeddingProvider`; `EmbeddingResult` widening; priced ledger row |
| 6 | `cde5a30` | route flip, degraded taxonomy in the front-door log, skill doc |
| 5 | `7e00bed` | `live_embedding_smoke.ts` with `--cross-check` |

1890 TS tests pass; every existing golden and the parity harness are unchanged,
which is the evidence that replay behavior did not move.

**Two things the writing corrected.** A response with no `data` is *transient*
in Python (`_extract_embedding` raises without `permanent=True`), not
malformed — TS must retry where I first expected it to fail hard; only a
present-but-wrong `data` shape is malformed. And `generateEmbeddingSafely` had
to grow an explicit `ProviderConfigError` bypass, because without it an
unconfigured install would write an unpriced ledger row where Python writes
none — a parity break invisible to every replay test, since replay always has
a "key".

**What remains intentionally undone.**

1. **Navigator validation** — the seven-step route in `test-guide.md`. Steps 2
   and 4 need a *discriminating query* (zero FTS overlap against a known
   memory) recorded in the guide before running; step 3 needs a real-DB copy
   and a memory id for `--cross-check`. Nothing about the cutover is proven
   against a real provider yet: **no live call has ever been made from this
   code.**
2. **Docs** — burn-down ledger (move `memories --search` out of the
   replay-gated block, family row to flipped-ungated, dated entry), REFERENCE
   env table (`MIRROR_TS_SEARCH`, three timeouts, `MEMORY_LLM_MAX_RETRIES`,
   `NODE_EXTRA_CA_CERTS`, `NODE_USE_ENV_PROXY`), decision record (fetch-based,
   no SDK; constant base URL; `redirect: "error"`).
3. **Handoff persona review** — the post-validation checkpoint.

**Known risk, accepted and unmitigated in code.** Node's `fetch` ignores
`HTTPS_PROXY` unless `NODE_USE_ENV_PROXY=1`. An install behind a proxy that
worked on Python will degrade to lexical after this flip, and the degraded
note will misattribute it to "offline or no API key". The front-door log now
carries the real class (`kind=provider_error`), which is how it would be
diagnosed. Documented, not coded around.

**Unrelated pre-existing failure.** `tests/unit/memory/web/test_server.py::
test_operations_run_api_executes_runtime_diagnose_through_controlled_command`
fails on this machine and reproduces on a clean tree. No Python file is
touched by this story.

**Next plateau.** Run the Navigator route; if step 3 (`cos >= 0.99`) fails,
stop — the vectors are not in the corpus's space and the flip must be reverted
with `MIRROR_TS_SEARCH=0` rather than debugged in production.
