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

Run 2026-09-11. Live OpenRouter throughout; copy-only steps against
`tmp/parity/real-copy.db`. Total spend across all validation: well under $0.05.

**1. Live chat smoke — PASS.** One title-shaped call: content returned within
the 160-char cap, generation id present, latency 1.5–2.4s, usage reported.

**2. Live close tail on a copy — PASS.** `--session-end 833ab86e`:

```text
extraction_status ok · 4 memories, all 1536-dim · title 52 chars ·
tags array(6) · summary 660 chars · 10 ledger rows, bodies withheld
role sequence: extraction -> task_extraction -> embedding x5 ->
               conversation_title -> conversation_summary -> conversation_tags
```

The first run of this step reported **7/10 rows priced** and found the
unpriced close-tail metadata roles (fixed in plateau 5); the re-run after the
fix is 10/10.

**3. Group 1 on the real home — PASS.** A real Pi session close, unattended
through the hook. Front-door log: `conversation-logger  ts  exit=0` (twice),
`backup  ts  exit=0`. Conversation `6272710d`: full tail, `extracted: true`,
`extraction_status: ok`, **6 memories all at 1536 dims**, title/summary/tags
all `generated` via `close_time_metadata_finalization`, every row priced,
every body length 0. Close cost ≈ $0.0118.

A second conversation the same evening (`fe665e10`, a short "list the
journeys" exchange) received a title only — correct: Python's metadata profile
grants short conversations a title without summary, tags, or extraction. Read
from a bare `LIMIT 10` this looked like a missing summary/tags divergence; it
was a window spanning two conversations. Worth recording, because that is the
shape a real divergence would also take.

**4. Group 2 on a copy — PASS, after a false start worth keeping.** The first
`session-maintenance` run on an untouched copy returned `exit 0` with a clean
report and made **zero live calls** (ledger 472 → 472): no work was due.
Reporting that as validation would have proved nothing. With two conversations
reset to pending, one run extracted both:

| Conversation | Roles logged | Memories |
|---|---|---|
| `4f5cdf70` | extraction, task_extraction, embedding ×3 | 2 → 4 |
| `85a60561` | extraction, task_extraction, embedding ×4 | 3 → 6 |

11 rows, every one priced, every body empty, both `extraction_status=ok`. Each
conversation's embedding count equals one summary embedding plus one per new
memory — the plateau-1 atomicity contract holding under a real
multi-conversation run rather than a fixture. Run cost $0.0032.

**5. Reverts — PASS.** `MIRROR_TS_CONVERSATION_LLM_TAIL=0` routes the five
close-tail subcommands to Python while `status`, `log-user`, and the rest of
the deterministic seven stay on TypeScript; `session-start --fast` also stays,
because it makes no model call. `MIRROR_TS_CONVERSATION_LOGGER=0` still
reverts all fifteen. A replay fixture still wins over live, and the
conversation lifecycle smoke passes unchanged — the evidence that replay
behavior did not move.

**6. Half-configured replay — PASS.** One fixture variable without the other
refuses by name and makes no call.

**Not exercised.** Live `timeout`, `auth`, `rate_limit`, and `provider_error`
against a real provider — hermetic tests with an injected `fetch` only, as in
US1. Real-home `session-maintenance` was not run separately: the real home had
already exercised the identical close-tail code path through `session-end`,
and the multi-conversation case was covered on the copy.

**Observed, not a defect.** Three conversations on this home carry a historical
`extraction_status=parse_failed` (2026-07-21, 2026-07-23, 2026-09-09), from
before this story. `session-maintenance` surfaces them as a standing warning.
Nothing in DS8 changed their state.
