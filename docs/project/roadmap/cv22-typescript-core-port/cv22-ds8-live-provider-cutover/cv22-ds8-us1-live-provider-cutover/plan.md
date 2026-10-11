# Plan — CV22.DS8.US1

## Objective

Build the TS `live` transport substrate once, prove it on the simplest and
highest-traffic provider call — the search query embedding — and cut
`memories --search` over to TypeScript by default on real homes, with a
one-variable revert to Python. Chat, credits, and the other fifteen leaves
reuse this substrate in US2/US3; they are not touched here.

## Scope

### 1. OpenRouter HTTP client — `ts/src/providers/openrouter.ts`

One fetch-based client shared by every later live provider. Node ≥ 24 ships
global `fetch`, so no SDK dependency is added (Python carries the OpenAI SDK
only for its retry policy; we port the policy, not the package).

- `createOpenRouterClient(config, { fetch?, sleep?, now? })` — every
  side-effect injectable so tests never reach the network.
- `postJson(path, body, { timeoutMs, maxRetries })`:
  - `Authorization: Bearer <key>` from `resolveProviderConfig("openrouter")`
    (env only; `rejectArgvSecrets` already refuses argv-shaped keys). No
    other header carries anything derived from the key.
  - `redirect: "error"`. The base URL is a constant and there is no
    legitimate redirect; a key must never be replayed to a host we did not
    name. Pinned by test (security review).
  - Timeout via `AbortSignal.timeout(timeoutMs)`; an abort maps to
    `kind: "timeout"`.
  - Retry policy mirrors what Python inherits from the OpenAI SDK with
    `max_retries=LLM_MAX_RETRIES`: retry on network/connection errors, 408,
    409, 429, and 5xx; never on other 4xx. Backoff `0.5s * 2^attempt` with
    jitter, capped at 8s; a `retry-after` header ≤ 60s wins. `maxRetries`
    defaults to `MEMORY_LLM_MAX_RETRIES` (2) — three attempts total, as Python.
  - Error taxonomy (AI-18), `LlmTransportError { kind, status?, retryable }`:
    `timeout` (abort), `auth` (401/403), `rate_limit` (429 after retries),
    `malformed_output` (non-JSON body or JSON lacking the documented shape),
    `provider_error` (everything else, including exhausted 5xx and network).
    The error object carries **only** those three fields plus a redacted
    message — no `Response`, body, headers, or `cause` chain — because error
    objects get serialized whole by loggers and test reporters. Asserted
    structurally: `JSON.stringify(error)` with a planted key contains no key.
  - Every message passes through `redactString(message, { secrets: [apiKey] })`
    before it leaves the client. Response bodies are never included in error
    messages — only status and a fixed phrase — because provider error bodies
    can echo request content.
  - The client logs nothing. Observability stays with `logLlmCall` in
    metadata mode; the front-door log records routing, never payloads.
- Base URL: a module constant, never env-derived. Recorded as a rule in the
  decision record so a later "custom provider" request meets a documented no.
- TLS: Node's bundled CA store. Python pins `certifi`; the difference is
  documented in REFERENCE.md (`NODE_EXTRA_CA_CERTS`), not papered over.
- Proxy: Python's httpx honors `HTTPS_PROXY`; Node's `fetch` does not unless
  `NODE_USE_ENV_PROXY=1` (Node ≥ 24). Documented beside the TLS note and
  named as a known risk in the handoff: an install behind a proxy that worked
  on Python would degrade to lexical after this flip, and the degraded note
  would misattribute it.

### 2. Per-role timeout + retry resolvers — `ts/src/providers/config.ts`

`resolveLlmTimeoutMs("extraction" | "reception" | "embedding")` from
`MEMORY_LLM_TIMEOUT_EXTRACTION` (60s), `MEMORY_LLM_TIMEOUT_RECEPTION` (10s),
`MEMORY_LLM_TIMEOUT_EMBEDDING` (15s), and `resolveLlmMaxRetries()` from
`MEMORY_LLM_MAX_RETRIES` (2). Same names, same defaults, same
`os.getenv`/`float()`/`int()` failure semantics as `parsePythonInt` already
enforces (a present non-numeric value fails loudly, as Python's import would).
All three timeouts ship now so US2/US3 add no config surface.

### 3. Live embedding provider — `ts/src/providers/embedding.ts`

- `EmbeddingProvider.embed(text)` widens from `readonly number[]` to
  `EmbeddingResult { vector: readonly number[]; promptTokens: number | null }`.
  Replay providers return `promptTokens` from the fixture's optional
  `response.usage.prompt_tokens`, else `null`. Existing fixtures stay valid.
  The four direct `.embed(` callers and `generateEmbeddingSafely` adapt; no
  behavior change under replay.
- `LiveEmbeddingProvider` → `POST /embeddings { input, model }` with the
  embedding-tier timeout. **Config resolves lazily on the first `embed()`**,
  never at construction: a missing key must surface inside
  `generateEmbeddingSafely`'s try, not crash the route before it.
- `generateEmbeddingSafely` gains one branch: a `ProviderConfigError` is
  rethrown **without** firing `onAttempt`. Python raises its `RuntimeError`
  before the attempt loop and writes no ledger row; without this branch TS
  would log an unpriced `embedding` row for an unconfigured install. Pinned by
  test in `memorySearch.test.ts` (no row when the key is unset).
- Response contract, mirroring `_extract_embedding`:
  - `data` missing/empty, or `data[0].embedding` missing/empty → **return an
    empty vector**, so `generateEmbeddingSafely` treats it as transient and
    retries within its own budget (Python's "No embedding data received" /
    "Empty embedding payload received" branch). Not a throw: a throw here is
    terminal at that layer and would invert the taxonomy.
  - Non-numeric elements → `malformed_output` (terminal).
  - Wrong length is **not** checked here; `generateEmbeddingSafely` owns the
    permanent dimension-mismatch diagnostic (AI-07), unchanged.
- `EmbeddingAttemptInfo` gains `promptTokens` so the ledger hook can price.

### 4. Cost authority — `ts/src/providers/cost.ts`

Port `cost.py` verbatim: `MODEL_PRICES` (two pins), `computeCost(model,
promptTokens, completionTokens)` → `number | null`. Unknown model or missing
prompt usage → `null`, never `0`. Golden: a generated table of
(model, prompt, completion) → Python's float, checked to full precision —
Python and JS both compute in IEEE-754 doubles, so exact equality is the
right assertion. `observability/llmCalls.ts`'s header comment that
deliberately did not port `compute_cost` is updated to point here.

### 5. Ledger parity for the search embedding — `ts/src/search/memorySearch.ts`

`logQueryEmbeddingAttempt` writes `promptTokens` and
`costUsd = computeCost(resolveEmbeddingModel(), promptTokens, null)`. Under
replay both stay `null` (unchanged rows in every existing golden). A failed
live attempt logs `null` usage → unpriced row, as Python's
`_log_embedding_call(None)` does.

### 6. Route cutover — `ts/src/frontDoor/routing.ts`, `searchRoute.ts`

The precedence below is written **once**, as
`resolveProviderTransport(env, { revertVar, replayVar })` in
`ts/src/providers/transport.ts`, returning a closed union
`{ mode: "python" | "replay" | "live", reason }`. `routing.ts` and
`searchRoute.ts` both consume it; US2/US3 reuse it for every family instead
of re-deriving it per leaf (the `LLM_ROLES` drift lesson from US11).

`memories --search` resolves in this precedence, each branch with its own
reason string and a routing test:

1. `MIRROR_TS_SEARCH=0` → **python**, "search family reverted to Python".
2. `MIRROR_TS_SEARCH_EMBEDDING_REPLAY` set → **ts** (replay), "DS5 fresh
   semantic search under replay transport". `MIRROR_TS_EXTERNAL_ROUTES` is no
   longer required for this branch — the variable was the DS5 safety gate for
   a replay-only route, and after this story the replay path is a test
   transport, not a production one.
3. otherwise → **ts** (live), "DS8.US1 fresh semantic search live".

`searchRoute.ts` picks `LiveEmbeddingProvider` or the replay provider by the
same rule. A missing key surfaces as `ProviderConfigError` inside
`generateEmbeddingSafely`'s provider-exception branch → `degraded=true` →
Python's exact degraded note. The observable behavior of an unconfigured
install is therefore identical on both engines, and TS no longer needs Python
for that case.

On a degraded live search, the front-door log line's `detail` carries the
taxonomy — `embedding_degraded kind=<kind> status=<status|->` — kind and
status only, never message text. `frontDoorLog.ts` already defines `detail`
as a content-free error category; this is the first consumer that has one.
Without it the taxonomy dies inside `catch { degraded = true }` where no
operator can see it.

Other families are untouched: `externalRoutesEnabled` and every other
`*_REPLAY` gate keep their current meaning until US2/US3.

### 7. Live smoke contract — `ts/parity/live_embedding_smoke.ts`

Navigator-run, never in CI. Refuses to start without `OPENROUTER_API_KEY`
and without `--db <copy>`; refuses a path that matches the configured
production database (reuse `copyGuard`). Embeds a fixed short sentence twice,
then a semantically distant one, and asserts:

- dimension 1536; every element finite;
- cosine(self, self) ≥ 0.999; cosine(self, distant) < cosine(self, self);
- one `llm_calls` row per call: role `embedding`, model = configured pin,
  `latency_ms > 0`, `prompt` and `response` empty; token and cost columns are
  reported, not asserted absolute (see cross-engine parity below);
- nothing on stdout/stderr contains the key (the script greps its own output
  with the key as the needle before exiting 0).

Prints redacted evidence only (counts, dimension, similarity, latency).

Two checks the smoke cannot do on the demo DB (its vectors are synthetic)
run on the real home in the Navigator route:

- **Vector-space parity.** Pick one memory, re-embed its
  `memoryEmbedText(title, content)` through the TS live provider, and assert
  cosine against the **stored BLOB** ≥ 0.99. Dimension and self-similarity
  prove the pipe; only this proves TS vectors live in the same space as the
  ~171 Python-era vectors the ranker compares them to. The script exposes
  this as `--cross-check <memory-id>` and prints only the cosine.
- **Cross-engine ledger parity.** Run the same query through
  `uv run python -m memory memories --search` and through the TS front door;
  compare the two newest `embedding` rows: same model, same nullity on
  `prompt_tokens` and `cost_usd`, and equal `cost_usd` when both are priced.
  `> 0` was an assumption about OpenRouter's embeddings `usage`; parity with
  Python is the actual criterion.

### 8. Documentation

- Burn-down ledger: `memories --search` leaves the "replay-gated" block;
  the "External under replay" family row becomes flipped-ungated with
  `MIRROR_TS_SEARCH=0` as revert; a dated ledger entry.
- `mm-memories` skill (`.pi`, `.claude`, `plugins/mirror-mind`): the sentence
  claiming `--search` falls back to Python is removed.
- REFERENCE.md: `MIRROR_TS_SEARCH`, the three timeout variables,
  `MEMORY_LLM_MAX_RETRIES`, the TLS note (`NODE_EXTRA_CA_CERTS`), the proxy
  note (`NODE_USE_ENV_PROXY=1`).
- Decision record: "DS8 live transport is fetch-based, no SDK" with the
  retry-policy rationale, the constant-base-URL rule, and `redirect: "error"`,
  in `docs/project/decisions.md`.
- Handoff: proxy divergence named as a known, accepted risk.

## Non-Goals

- Live chat completions, `LiveLlmProvider`, and the conversation close tail
  (US2). The client is built to serve chat, but no chat code lands here.
- Live credits, `fetchGenerationCost`, and `consult` (US3).
- Flipping `mirror load --query`, `consolidate`, `shadow`, `soul harvest
  save`, `journal`, `week plan`, `descriptor generate`, or the
  `conversation-logger` close tail. Their gates and reasons do not change.
- Retiring `MIRROR_TS_EXTERNAL_ROUTES` globally (US3); it is only dropped
  from the search branch.
- Closing the `descriptor` ledger gap; the `eval` runner decision.
- Any change to ranking, MMR, FTS querying, access logging, or the
  real-DB-copy search probe (which stays replay-based by design — parity
  against Python is proven with a monkeypatched `generate_embedding` on both
  sides, never with live calls).
- Committing any live fixture or recording mode. `record` remains a future
  transport mode; nothing here writes provider responses to disk.
- Python changes of any kind. Python's `memories --search` is the oracle and
  stays product authority only through the revert control.

## Acceptance Behavior

```text
Given a real home with OPENROUTER_API_KEY set and no MIRROR_TS_* variables
When `memories --search "<query>"` runs through the front door
Then the routing decision is engine=ts, reason "DS8.US1 fresh semantic search live"
And the results carry no "⚠ Degraded" note
And exactly one new llm_calls row has role=embedding, model=<pin>,
    prompt_tokens>0, cost_usd>0, latency_ms>0, prompt="" and response=""
And the API key appears in no log line, ledger column, or error text

Given the same home with OPENROUTER_API_KEY unset
When the same search runs
Then output begins with Python's degraded note and lexical results follow
And no llm_calls row is written (no call was attempted)
And the front-door log detail names the kind (auth/config) and no message text

Given a query with zero FTS overlap against a memory known to exist
When it runs live
Then that memory is returned (lexical-only would return nothing for it)

Given one real memory re-embedded through the TS live provider
When compared with its stored Python-era vector
Then cosine ≥ 0.99

Given the same query run through Python and through TS
When the two newest embedding ledger rows are compared
Then model matches and token/cost nullity matches

Given MIRROR_TS_SEARCH=0
When the same search runs
Then the front door routes to Python with the revert reason

Given MIRROR_TS_SEARCH_EMBEDDING_REPLAY=<fixture>
When CI, the parity harness, or a test runs a search
Then the replay provider answers and no fetch is issued

Given the client receives 401 / 429×3 / 500 then 200 / an aborted request /
      a non-JSON body / a 3xx
When postJson is called with an injected fetch
Then it raises auth (no retry) / rate_limit (after 2 retries) /
     succeeds on the third attempt / timeout / malformed_output /
     provider_error (redirects are never followed)
And every error message has the key replaced by [REDACTED]
And JSON.stringify(error) contains no key and no response body
```

## Validation Route

### Automated (CI, hermetic)

- `cd ts && npm run typecheck && npm run lint && npm test`.
- New tests: `openrouter.test.ts` (one test per taxonomy class, retry budget,
  backoff sequence via injected sleep, `retry-after` precedence, header
  shape, `redirect: "error"`, redaction with a fake key planted in a 401
  body, structural serialization check), `cost.test.ts` (golden),
  `embedding.test.ts` additions (`LiveEmbeddingProvider` response contract:
  happy path, empty `data` → empty vector, non-numeric → malformed; lazy
  config; `ProviderConfigError` bypasses `onAttempt`), `memorySearch.test.ts`
  additions (priced ledger row under a fake live provider; unchanged rows
  under replay; **no row when the key is unset**), `transport.test.ts`
  (`resolveProviderTransport` three-branch precedence), `routing.test.ts`
  additions (consumes it; degraded detail carries kind/status only).
- Existing goldens and the real-DB-copy harness unchanged and green — this
  is the regression proof that replay behavior did not move.
- CI determinism gate regenerates the cost golden.

### Navigator-run (never CI)

1. `node ts/parity/live_embedding_smoke.ts --db tmp/parity/demo-memory.db`
   with the real key. Expected: the contract above passes and the redacted
   summary prints. Fail: any assertion, or the key appears in output.
2. On the real home, through Pi: `/mm-memories --search "<discriminating
   query>"` — a paraphrase with **zero FTS overlap** against a memory you know
   exists, recorded in the test guide so the check is repeatable. Expected:
   that memory is returned (lexical-only would return nothing), no degraded
   note; the front-door log shows `engine=ts` with the live reason; `sqlite3
   memory.db "select role, model, prompt_tokens, cost_usd, length(prompt)
   from llm_calls order by called_at desc limit 1"` shows an embedding row
   with `length(prompt)=0`. Fail: degraded note with a key present, the
   memory absent, or a non-empty prompt column.
3. `node ts/parity/live_embedding_smoke.ts --db <real-db-copy>
   --cross-check <memory-id>` → cosine against the stored vector ≥ 0.99.
4. Same query through `uv run python -m memory memories --search` → compare
   the two newest embedding rows: same model, same token/cost nullity.
5. `OPENROUTER_API_KEY` unset → same search → degraded note, no new row,
   front-door detail shows `kind=auth`.
6. `MIRROR_TS_SEARCH=0` → same search → front-door log shows `engine=python`.

E2E decision: **required**. This is the first story in CV22 where TS spends
real money; the fixture-level route alone is not sufficient evidence.

## Implementation Contract

- TDD: each taxonomy class and each routing branch is written red first.
  `LiveEmbeddingProvider` is characterized against Python's
  `_extract_embedding` branches before the route flips.
- Order of plateaus, each committable on its own: (1) config resolvers +
  cost port, (2) OpenRouter client, (3) live embedding provider + interface
  widening, (4) priced ledger row, (5) smoke script, (6) route flip + docs.
  A session that must stop between plateaus records where in the story
  package's handoff section.
- No test reaches the network; `fetch` is always injected in tests. Any test
  file importing `openrouter.ts` without injecting `fetch` is a review
  finding.
- No `any`; `LlmTransportError.kind` and the transport mode are closed
  unions; the precedence lives in one function.
- Plan review (2026-09-09) findings folded in: engineer (lazy config,
  `ProviderConfigError` bypass, single precedence resolver), QA
  (discriminating query, automated no-row test), security (`redirect:
  "error"`, structural error shape, constant base URL), devops (degraded
  kind in front-door detail, proxy note), ai-engineer (stored-vector
  cross-check, cross-engine ledger parity). database-architect,
  prompt-engineer, experience-designer, product-designer: no dissent.
- Keep changes scoped to `CV22.DS8.US1`; Python is not modified.
- `uv run` for every Python command; `git add` only story-scoped files;
  English commit messages explaining why.
- Multi-persona Plan review (engineer, quality-assurance, database-architect,
  devops-engineer, security-engineer, **ai-engineer**) runs on this Plan
  before approval; findings land in this file's review section. Handoff
  review runs after validation.

## Stop Conditions

- scope_change_detected — e.g. a chat call turns out to be needed for search.
- plan_rule_conflict — e.g. replay precedence cannot be kept without
  breaking an existing golden.
- failing_required_check_without_clear_fix.
- navigator_decision_needed — e.g. the panel disagrees on retry policy or
  the `MIRROR_TS_EXTERNAL_ROUTES` drop for the search branch.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval, and the Plan
  review above is a precondition of that approval.
