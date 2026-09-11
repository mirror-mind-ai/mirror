[< Parent](../index.md)

# CV22.DS8.US2 — Live chat completions + conversation close-tail cutover

**Status:** 🟡 Planned
**Type:** User Story

---

## User Story

As the Mirror's owner ending a session on a real home with only
`OPENROUTER_API_KEY` configured,
I want the conversation close tail — title, tags, summary, memory extraction,
task extraction — to run from the TypeScript core against live chat calls,
So that the product's actual live LLM surface (the roles carrying nearly all
of my ledger's chat traffic) stops depending on the Python core, with every
call priced and bounded the way Python's is.

## Outcome

The five `conversation-logger` subcommands that cross the close tail
(`switch`, `session-end-pi`, `session-end`, `session-start` full run,
`session-maintenance`) answer from TS by default against a live
`LiveLlmProvider` reusing US1's transport. Ledger rows for every chat role are
priced from the cost authority as Python prices them. A tail-only revert sends
just these five back to Python without dragging the seven deterministic
subcommands with them. Replay stays the test transport.

## Why this is riskier than US1

US1 flipped one read-only leaf that fires when the owner types a search. US2
flips a **write path that fires unattended at every session end, including
from hooks** — a defect does not wait to be noticed, and extraction creates
memories. The plan therefore stages the flip in US10's proven dependency order
and requires a real session close observed on a **database copy** before the
real home sees a live call.

## Scope

- `ts/src/providers/llm.ts` — `LiveLlmProvider` over US1's OpenRouter client:
  `POST /chat/completions`, Python's `send_to_model` request/response shape,
  extraction-tier timeout, `MEMORY_LLM_MAX_RETRIES`.
- `ts/src/conversation/loggerRuntime.ts` — providers resolved through
  `resolveProviderTransport` (revert → replay → live) instead of replay-only;
  the `LlmTailUnconfiguredError` fallback becomes the explicit revert.
- `ts/src/conversation/extraction.ts` + `loggerRuntime.ts` ledger — chat rows
  priced via `computeCost` (today `costUsd: null`, a parity gap with Python's
  `build_llm_logger`).
- `ts/src/frontDoor/routing.ts` — the five subcommands flip in two groups;
  `MIRROR_TS_CONVERSATION_LLM_TAIL=0` as the tail-only revert.
- `ts/parity/live_chat_smoke.ts` — Navigator-run live chat contract.
- Docs: burn-down ledger, configuration.md, decision record if any rule
  changes.

## Out Of Scope

- `consult`, `fetchGenerationCost`, live credits (US3).
- `mirror load --query` reception (US3 — reception-tier timeout).
- `consolidate`, `shadow`, `soul harvest save`, `journal`, `week plan`,
  `descriptor generate` (US3), and **CR075** (US3, with the `journal` flip).
- Retiring `MIRROR_TS_EXTERNAL_ROUTES` globally (US3).
- Any prompt text change — prompts are digest-pinned; a change is a
  prompt-engineer story, not a transport story.
- Streaming, tool calls, provider fallback chains, spend/budget guards (AI-19,
  DS9), the `eval` runner (TS1).
- Python changes of any kind.

## Validation

Hermetic tests with injected `fetch`; every existing golden and the
conversation lifecycle smoke byte-identical under replay; a Navigator-run live
chat smoke on a copy; a real session close on a **copy**; then one real
session close on the real home; revert exercised. See [plan.md](plan.md) and
[test-guide.md](test-guide.md).
