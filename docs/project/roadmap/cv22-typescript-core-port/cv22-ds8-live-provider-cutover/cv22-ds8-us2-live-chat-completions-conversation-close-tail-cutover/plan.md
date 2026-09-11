# Plan — CV22.DS8.US2

## Objective

Put the conversation close tail — the product's actual live LLM surface — on
TypeScript against live chat completions, reusing US1's substrate unchanged,
and flip the five `conversation-logger` subcommands that cross it in a staged
order with a tail-only revert. Nothing new is invented at the transport
layer; the new surface is the chat request/response shape, per-role cost on
the ledger, and the unattended-write validation route.

## Scope

### 1. `LiveLlmProvider` — `ts/src/providers/llm.ts`

Mirrors Python's `send_to_model` exactly, over `createOpenRouterClient`:

- Request: `POST /chat/completions` with
  `{ model, messages: [{ role: "user", content: prompt }], temperature,
  max_tokens }`. `model` = `request.model ?? resolveExtractionModel()`;
  `temperature` = `request.temperature ?? 0.7`; `max_tokens` =
  `request.maxTokens ?? 4096` (Python's defaults; callers already pass the
  per-role values US10 graded: 0.2/0.3, title `max_tokens: 40`).
- **The prompt is sent byte-for-byte, in Python's exact envelope.** US10
  pinned SHA-256 digests of every assembled close-tail prompt so a drift
  fails under replay; the live provider must not be a place where the graded
  prompt can be altered. The digests pin *content*, not *structure*, so the
  hermetic test asserts the envelope too: `messages.length === 1`,
  `messages[0].role === "user"`, `messages[0].content === request.prompt`.
  A system prompt, a second turn, or an assistant prefill would pass every
  digest and change what the model hears (prompt-engineer review).
- Response, branch for branch with Python:
  `content = (choices[0].message.content ?? "").trim()` — empty content is
  **not** an error (Python's `or ""`); `promptTokens`/`completionTokens` from
  `usage` when integers, else `null`; `generationId` from `id`; `latencyMs`
  measured around the call; `model` echoes the request model (what Python
  logs).
  Missing/empty `choices`, or `choices[0]` not an object → `malformed_output`
  (Python's `IndexError` — an exception, which the extraction driver records
  as a failed attempt).
- **Model output that is not JSON is NOT a transport error.** A 200 whose
  content fails `_parse_json_response` is the parser's concern
  (`parse_failed` status, unchanged). Conflating the two would turn a model
  behavior into a retry storm at the transport layer. The taxonomy's
  `malformed_output` means the HTTP body, never the model's text.
- Timeout: `resolveLlmTimeoutMs("extraction")` for every close-tail role —
  Python's callers pass no timeout and inherit `LLM_TIMEOUT_EXTRACTION`.
  Retries: `resolveLlmMaxRetries()`. Config resolves lazily (US1 rule).
- No streaming, no tool calls, no system message: Python sends none.

### 2. Provider resolution in the close tail — `loggerRuntime.ts`

`loadProviders()` today throws `LlmTailUnconfiguredError` when the two replay
paths are absent, which `loggerCli` turns into a Python fallback. That
mechanism becomes the explicit revert:

```text
CONVERSATION_TAIL_TRANSPORT = {
  revertVar: "MIRROR_TS_CONVERSATION_LLM_TAIL",
  replayVar: "MIRROR_TS_CONVERSATION_LLM_REPLAY",   // + EMBEDDING_REPLAY, both required for replay
  liveReason: "DS8.US2 conversation close tail live",
}
```

- `python` → `LlmTailUnconfiguredError` as today (fallback preserved,
  reason renamed to say *revert*, not *unconfigured*).
- `replay` → both replay providers, exactly as today. A single replay var
  set without the other is a **configuration error surfaced by name**, not a
  silent live call: half a fixture must never spend money.
- `live` → `LiveLlmProvider` + `LiveEmbeddingProvider` (US1).
- `llmTailConfigured` becomes `mode !== "python"`.

`MIRROR_TS_CONVERSATION_LOGGER=0` keeps reverting the **whole** family. The
new tail-only variable exists because the seven deterministic subcommands
have been on TS since 2026-09-02 and a live-provider scare must not drag them
back.

### 3. Priced ledger rows for chat roles

`loggerRuntime.ts`'s `ledger` and `extraction.ts`'s per-call hook both write
`costUsd: null`. Python's `build_llm_logger` prices every one of these rows
via `compute_cost` (the extraction pin is in the table). Both become
`computeCost(model, promptTokens, completionTokens)`; under replay tokens are
absent so cost stays `null` and every golden is unchanged. Rows for the
embedding calls inside extraction already go through `generateEmbeddingSafely`
and are priced since US1.

`prompt` column semantics under `MEMORY_LOG_LLM_CALLS=full`: Python stores
`json.dumps(messages)` — the envelope — while TS stores the bare prompt.
**Decision: match Python.** The column exists for cross-engine audit and must
mean one thing. Invisible in the default `metadata` mode; pinned by a test in
`full` mode (database-architect review).

### 3a. Extraction write atomicity — `ts/src/conversation/extraction.ts` (BLOCKER)

Python embeds **every** extracted memory first and only then inserts
(`conversation.py`: *"All embeddings succeeded — only local writes remain"*).
TS interleaves embed → insert per memory with no transaction
(`extraction.ts:131-138`). Under live, an embedding failure on memory 3 of 5
leaves memories 1–2 persisted with `extracted` unset and the attempt recorded
as failed; the retry re-extracts and inserts 1–2 again — duplicate memories,
each with paid embeddings. Replay embeddings never fail, which is why no test
has ever seen this, and why it belongs to the story that makes it reachable.

Fix: embed all, collect vectors, then insert — Python's contract, no schema
change, no locking story. Pinned by a test with a fake live embedding
provider that fails on the **second** memory: zero rows in `memories`, the
failed attempt recorded, and the ledger showing the paid round-trips that
did happen (real spend stays visible). The summary embedding, when enabled,
joins the same embed-first group.

### 4. Staged route flip — `routing.ts`

Two plateaus, in the order US10 proved and flipped them, each with its own
Navigator observation before the next:

- **Group 1:** `switch`, `session-end-pi`, `session-end` — they compose only
  the close tail. The `session-end` hook is the path that fires unattended,
  so it is validated first, on a copy, then on the real home.
- **Group 2:** `session-start` (full run), `session-maintenance` — they
  compose the close tail with backfill and orphan handling (slices D/E) and
  can close several conversations in one run.

Each group's decision reads `resolveProviderTransport(env,
CONVERSATION_TAIL_TRANSPORT)`; `MIRROR_TS_EXTERNAL_ROUTES` stops being
required for these five (same reasoning as US1). The routing reason names the
story and the group.

### 5. Live chat smoke — `ts/parity/live_chat_smoke.ts`

Navigator-run, never CI, copy-guarded. One `conversation_title`-shaped call
(`max_tokens: 40`) → non-empty content, `generationId` present, usage
reported-not-asserted, latency > 0, one priced ledger row with bodies
withheld, key absent from output. Then, with `--session-end <conversation-id>`,
runs the real close tail on the copy against an un-extracted conversation and
reports **structural verdicts, not just counts** (ai-engineer review):
`extraction_status` (`ok` vs `parse_failed`), memory count, title non-empty
and within the AI-24 60-code-point bound, tags parsed as a list, summary
present, ledger rows by role in order — never content. A run that yields
`parse_failed` on every role would pass a count-only check and be a real
regression; when that happens the diagnosis is prompt-layer and routes to
the prompt engineer, not to the transport.

### 5a. Hook-boundary redaction — `loggerCli.ts`

The transport's error shape (no body, no key) was designed for a log line.
In US2 the boundary that matters is the **hook's stderr**: a `session-end`
hook runs inside Pi, and what it prints can land in the transcript the next
close tail logs and extracts. A hermetic test forces a live failure through
`loggerCli` and asserts stderr carries only the taxonomy kind and a fixed
phrase — never a provider body (security review).

### 5b. CI cannot spend — `.github/workflows/tests.yml`

After the flip, any TS test or smoke that runs a close-tail subcommand
without both replay variables would try to go live; today it fails safe only
because the key happens to be absent. Make it a property: the TS job asserts
`OPENROUTER_API_KEY` is unset before `npm test` (security review).

### 6. Documentation

Burn-down ledger (five leaves leave the replay-gated block: 15 → 10, the
`conversation-logger` detail table's five rows become flipped-ungated with the
tail revert), `configuration.md` (`MIRROR_TS_CONVERSATION_LLM_TAIL`),
story package handoff.

## Non-Goals

- `consult`, `fetchGenerationCost`, live credits; `mirror load --query` and
  the reception-tier timeout; `consolidate`, `shadow`, `soul harvest save`,
  `journal`, `week plan`, `descriptor generate`; **CR075** — all US3.
- Retiring `MIRROR_TS_EXTERNAL_ROUTES` for other families (US3).
- Any prompt text change. Prompts are digest-pinned oracle artifacts.
- Streaming, tool calls, system messages, provider fallback, model routing.
- Spend/budget guards on the close tail (AI-19 → DS9). The per-session cost
  is bounded today only by the fixed number of roles and Python's same retry
  arithmetic (`MEMORY_EXTRACTION_MAX_ATTEMPTS` 3 × transport retries 3).
- Live exercise of `timeout`/`auth`/`rate_limit` classes (hermetic only, as
  US1).
- Python changes.

## Acceptance Behavior

```text
Given a DB copy holding a real, un-extracted conversation with >= 4 messages and a journey
When `session-end` runs on the copy with OPENROUTER_API_KEY set and no MIRROR_TS_* variables
Then the conversation gains a title, tags, and summary
And at least one memory is created with a 1536-dim embedding and provenance
And llm_calls gains rows for conversation_title, conversation_tags, conversation_summary,
    extraction (and task_extraction / summary when enabled) and embedding, each with
    model = the pin, cost_usd priced, prompt = "" and response = ""
And the front-door log shows engine=ts with the DS8.US2 reason

Given the same conversation on a second copy run through Python
When the two ledger sequences are compared
Then the ROLE ORDER and the priced/unpriced shape match (content equality is NOT asserted;
    model output is nondeterministic)

Given a real Pi session on the real home ending normally
When the session-end hook fires
Then the front-door log shows conversation-logger ts exit=0 and priced rows appear

Given MIRROR_TS_CONVERSATION_LLM_TAIL=0
When any of the five subcommands runs
Then it routes to Python, and the seven deterministic subcommands still route to TS

Given only one of the two replay variables set
When a close-tail subcommand runs
Then it refuses by name and makes no live call

Given the injected-fetch client receives 401 / 429x3 / 500,500,200 / abort / empty choices
When LiveLlmProvider.complete runs
Then auth / rate_limit / success / timeout / malformed_output, with no body in any error
```

## Validation Route

### Automated (CI, hermetic)

- `cd ts && npm run typecheck && npm run lint && npm test`, with the TS job
  asserting `OPENROUTER_API_KEY` is unset.
- `llm.test.ts`: `LiveLlmProvider` request shape (single `user` message,
  byte-identical prompt, defaults 0.7/4096, per-request overrides), response
  branches (content trim, `null` content → "", usage int-or-null,
  generationId, empty choices → `malformed_output`), extraction-tier timeout,
  lazy config, no body in errors.
- `extraction.test.ts`: **embed-all-then-insert** — fake live embedding
  provider failing on the second memory → zero `memories` rows, failed
  attempt recorded, paid round-trips visible in the ledger; `prompt` column
  holds the messages envelope in `full` mode.
- `loggerCli.test.ts`: forced live failure → stderr carries kind + fixed
  phrase only.
- `loggerRuntime.test.ts`: three transport modes; half-configured replay
  refuses by name; ledger rows priced under a fake live provider, `null`
  under replay.
- `routing.test.ts`: group 1 and group 2 precedence; tail revert leaves the
  seven deterministic subcommands on TS; `MIRROR_TS_CONVERSATION_LOGGER=0`
  still reverts everything.
- Regression proof: every golden, the close-tail golden with its prompt
  digests, and `conversation_lifecycle_smoke.ts` byte-identical under replay.

### Navigator-run (never CI), in this order

1. Live chat smoke on `tmp/parity/real-copy.db`.
2. `--session-end <id>` on the copy — the first live close tail, off the real
   home. **Gate for plateau A's flip on the real home.**
3. Same conversation through Python on a second copy; compare role order and
   priced shape of the ledger sequences.
4. Real home: end a real Pi session; observe the front-door log and the
   newest ledger rows. **Gate for group 2.**
5. Group 2 on a copy (`session-maintenance` with two un-extracted
   conversations), then on the real home.
6. Tail revert and half-configured-replay refusal.

E2E decision: **required**, staged. The close tail is unattended and writes;
fixture-level evidence cannot stand in for a real session close.

## Implementation Contract

- TDD: transport branches, provider resolution, and routing groups red first.
- Plateaus, each committable: (1) **extraction atomicity fix** (the blocker,
  first, so no later plateau can be flipped over it); (2) `LiveLlmProvider` +
  envelope test; (3) priced chat ledger rows + `prompt` envelope in `full`
  mode; (4) provider resolution + tail revert + half-replay refusal +
  hook-stderr test + CI key assertion; (5) smoke script with structural
  verdicts; (6) **flip group 1 + Navigator steps 1–4**; (7) flip group 2 +
  step 5; (8) docs. A session that must stop between plateaus records it in
  the package.
- Plan review (2026-09-11) findings folded in: database-architect
  (atomicity blocker, `prompt` column semantics), ai-engineer (structural
  verdicts; orchestration-not-content parity stated), security (hook-stderr
  redaction, CI key-absence property), prompt-engineer (message envelope),
  QA (corpus-consumption sequence, real-home revert-first rule).
- The plan review (security + ai-engineer mandatory) runs before approval.
  Handoff review after validation.
- No prompt text changes; no Python changes; `uv run` for Python; story-scoped
  `git add`; English commit messages explaining why.

## Stop Conditions

- scope_change_detected — e.g. the close tail needs a request shape Python
  does not send.
- plan_rule_conflict — e.g. a golden or prompt digest moves under replay.
- failing_required_check_without_clear_fix.
- navigator_decision_needed — e.g. step 2 shows a ledger sequence Python
  does not produce.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- the multi-persona Plan review is a precondition of approval.
