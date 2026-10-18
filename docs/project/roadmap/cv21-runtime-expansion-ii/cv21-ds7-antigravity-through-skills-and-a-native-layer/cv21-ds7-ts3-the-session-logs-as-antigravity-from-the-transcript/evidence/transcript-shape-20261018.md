# TS3 probe — agy 1.4.2 transcript shape, 2026-10-18

Read-only inspection of real agy transcripts under
`~/.gemini/antigravity-cli/brain/<cid>/.system_generated/logs/transcript.jsonl`.
**No user content reproduced** — only the step structure.

## The record shape
Each line: `{step_index, source, type, status, created_at, content}`.

## The steps that matter for logging
| type | source | content | role |
|---|---|---|---|
| `USER_INPUT` | `USER_EXPLICIT` | string, wrapped `<USER_REQUEST>…</USER_REQUEST>` plus `<ADDITIONAL_METADATA>…` | the user turn — extract the USER_REQUEST body |
| `PLANNER_RESPONSE` | `MODEL` | string, **usually empty** (intermediate tool steps); non-empty on the turn's final answer | the assistant answer |
| `EPHEMERAL_MESSAGE` | `SYSTEM_SDK` | the injected context (TS2) | not logged |
| `CHECKPOINT`, `CONVERSATION_HISTORY` | — | bookkeeping | not logged |

## What the probe corrected (why probe-first)
- The answer step is **`PLANNER_RESPONSE`**, not `AGENT_MESSAGE` as the plan
  guessed.
- Most `PLANNER_RESPONSE` steps are **empty** — the reader must take the
  non-empty response text in the turn, not every PLANNER_RESPONSE.

## step_index — the high-water key is sound
Globally monotonic across the whole transcript (0, 3, 7, 9, … 49, …, 485 in
a real 18-turn session). Stable across reads. One non-empty
`PLANNER_RESPONSE` per user turn in every turn observed; the reader joins
non-empty responses within a turn for safety.

## Turn boundaries
A turn is `USER_INPUT` at step S to just before the next `USER_INPUT`. The
turn's user message is that USER_INPUT; its answer is the non-empty
`PLANNER_RESPONSE`(s) in the span; the high-water mark is the max
step_index logged.
