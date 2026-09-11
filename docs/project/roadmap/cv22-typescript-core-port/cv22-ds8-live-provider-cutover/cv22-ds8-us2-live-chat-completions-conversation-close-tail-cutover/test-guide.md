[< Story](index.md)

# Test Guide — CV22.DS8.US2

## Automated Validation

All hermetic; `fetch` injected everywhere.

```bash
cd ts && npm run typecheck && npm run lint && npm test
```

| Area | File | What it pins |
|------|------|--------------|
| Live chat | `ts/test/providers/llm.test.ts` | request body: exactly one message, role `user`, `content` byte-identical to `request.prompt` (a system prompt or prefill would pass every digest); defaults 0.7 / 4096; per-request overrides; response: `.trim()`, `null` content → `""`, usage int-or-null, `generationId` from `id`, empty `choices` → `malformed_output`; extraction-tier timeout; lazy config; error carries no body |
| **Write atomicity** | `ts/test/conversation/extraction.test.ts` | fake live embedding provider fails on memory 2 of 3 → **zero** `memories` rows, `extracted` unset, failed attempt recorded, the paid round-trips still in the ledger; `full` mode stores the messages envelope in `prompt` |
| Hook boundary | `ts/test/conversation/loggerCli.test.ts` | forced live failure through the CLI → stderr is the taxonomy kind + a fixed phrase, no provider body |
| CI property | `.github/workflows/tests.yml` | the TS job fails fast if `OPENROUTER_API_KEY` is set — "CI cannot spend" is asserted, not assumed |
| Provider resolution | `ts/test/conversation/loggerRuntime.test.ts` | revert → `LlmTailUnconfiguredError` (Python fallback); replay with both vars; **one replay var alone refuses by name and makes no call**; live builds both live providers; chat rows priced under a fake live provider, `null` under replay |
| Routing | `ts/test/frontDoor/routing.test.ts` | group 1 / group 2 live with nothing set; `MIRROR_TS_CONVERSATION_LLM_TAIL=0` reverts only the five; `MIRROR_TS_CONVERSATION_LOGGER=0` reverts all fifteen; replay without `MIRROR_TS_EXTERNAL_ROUTES` |
| Regression | existing | every golden incl. the close-tail prompt digests, and `conversation_lifecycle_smoke.ts`, byte-identical under replay |

## E2E Decision

**Required, staged.** The close tail runs unattended from hooks and writes
memories. A real session close is observed on a copy before the real home.

## Navigator Validation

Preconditions: real key in `.env`; a fresh copy
`cp ~/.mirror-minds/vinicius-ts/memory.db tmp/parity/real-copy.db`; pick an
**un-extracted conversation id** with ≥ 4 messages and a journey (the smoke
prints candidates when run without `--session-end`).

**Read this before step 2 — the test consumes its own corpus.** The chosen
conversation is extracted live on copy 1 (step 2) and again through Python
on copy 2 (step 3). On the **real home it is still un-extracted**, so the
first real-home close (step 4) will extract it a third time, live, alongside
the session you just ended. Expect **two** conversations closing in step 4's
evidence; that is the design, not a duplicate.

**Revert-first rule for the real home.** Steps 4 and 5 run unattended paths.
If anything looks wrong there, do **not** diagnose first:
`export MIRROR_TS_CONVERSATION_LLM_TAIL=0`, then read the front-door log's
`kind=` line. The revert exists so that diagnosis never happens while the
hook is still live.

| # | Route | Expected | Pass | Fail |
|---|-------|----------|------|------|
| 1 | `node --env-file=.env ts/parity/live_chat_smoke.ts --db tmp/parity/real-copy.db` | non-empty title-shaped content, generationId, one priced `conversation_title` row with empty bodies, key absent | `PASS` | any `FAIL`; key in output |
| 2 | `… --session-end <id>` on the copy | structural verdicts: `extraction_status=ok`, ≥ 1 memory with 1536-dim vector + provenance, title non-empty ≤ 60 code points, tags a list, summary present; ledger rows by role in Python's order, priced, bodies empty | every verdict `ok` | `parse_failed` on any role (**prompt-layer** — route to prompt-engineer, not transport); missing role; unpriced row; body persisted |
| 3 | same `<id>` on a second copy via `uv run python -m memory conversation-logger session-end …`; compare `SELECT role, cost_usd IS NULL FROM llm_calls WHERE conversation_id=? ORDER BY called_at` on both | same role sequence, same priced/unpriced shape. **This proves orchestration parity.** Content is two different model responses and is not compared; retrieval parity was proven in US1 | match | order or shape differs |
| 4 | **Real home:** end a real Pi session normally; then `tail -3 ~/.mirror-minds/vinicius-ts/front-door.log` and the newest ledger rows | `conversation-logger  ts  exit=0`; priced rows, empty bodies | both | `python` route; unpriced; error |
| 5 | Group 2: `session-maintenance` on a copy with ≥ 2 un-extracted conversations, then once on the real home | conversations closed, rows priced, no duplicate extraction on re-run | match | re-run adds rows |
| 6 | `MIRROR_TS_CONVERSATION_LLM_TAIL=0` → `session-end` → front-door log route `python`; `conversation-logger status` still `ts`. Then set only `MIRROR_TS_CONVERSATION_LLM_REPLAY` → refuses by name, no ledger row | as stated | as stated | a live call under a half fixture |
| 7 | `grep -c "<key>" ~/.mirror-minds/vinicius-ts/front-door.log` and `… llm_calls where prompt like '%<key>%'` | `0` / `0` | both zero | anything else |

**Stop rule.** If step 2 produces a ledger sequence Python does not (step 3),
do not flip on the real home; that is a `navigator_decision_needed` stop.

## Validation Evidence

Pending implementation and validation.
