[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR196 — A prompt typed while a turn runs loses its reply on Claude Code: the prompt hook fires at queue time, under the running turn's id

## Problem

Claude Code fires `UserPromptSubmit` when a prompt typed during a running turn **enters
the queue**, not when it runs, and the payload carries the **running** turn's
`prompt_id`. The queued prompt later runs as a turn of its own, under a new id that no
prompt hook ever sent. The session transcript shows it (`queue-operation` is Claude
Code's own record):

```text
14:33:34  user          promptId=P1   "question"
14:33:51  queue-operation                         <- prompt hook fires, payload prompt_id=P1
14:33:52  stop_hook_summary                       <- Stop for P1
14:33:52  user          promptId=P2   "[image]"   <- the queued prompt runs as P2
14:33:58  stop_hook_summary                       <- Stop for P2
```

What `messages` got, before this CR: the queued prompt tagged `turn_id: P1`; P1's reply
paired with `promptOfTurn(P1)`, which is the latest P1 row, the queued one; P2's Stop
finding no prompt and skipping as `nothing_waiting`, the reply lost. On one host, about
15 of 22 `nothing_waiting` lines in a week were this case (the other 5 were CR166's).

## Expected Behavior

- A prompt that arrives under a turn still owed its reply is recorded as queued during
  that turn, not as its prompt: the running turn's reply stays with its own question.
- The Stop of a turn whose id no prompt hook sent claims the oldest queued prompt no turn
  has claimed, and logs the reply beside it. Never for a turn the prompt hook skipped as
  a command. A queued prompt that an ordinary prompt has since followed is retired (Claude
  Code folded it into the running turn), so a Stop much later cannot take it.
- A turn id repeated after its reply was logged is still that turn's prompt; runtimes
  that mint one id per turn (Pi) are unaffected.
- `nothing_waiting` keeps its meaning: a reply nothing explains still writes the
  `hooks.log` line.

## Impact

High on Claude Code: every reply to a prompt typed during a running turn was lost, and
each loss was a `hooks.log` line that `runtime diagnose` counted as a hook failure, so
the finding meant to surface real failures was mostly this.

## Plan Or Decision

Captured at merge, 2026-11-03, at the Navigator's direction, for the half of
[PR #51](https://github.com/mirror-mind-ai/mirror/pull/51) (@alannascimento1, opened
2026-10-30) that no CR described; the other half is CR166. Driver `@alannascimento1`,
Delivery PR #51. The PR carries the fix as Expected Behavior states it, in
`ts/src/conversation/logger.ts`: `promptMetadata` (the `queued_in_turn` key, one more
optional key in `messages.metadata`, no schema change), `unclaimedQueuedPrompt` and
`claimQueuedPrompt`, and the reply rule's new branch between "by turn id" and "by
position", with the docblock updated.

Reviewed through four lenses on 2026-11-03 (engineer, database architect, quality
assurance, DevOps engineer); no amendments. Debt recorded, named by the author: in the
queued case P1's reply is still written after the queued prompt, because the prompt hook
fires at queue time; the rows are paired by `turn_id`, but a reader ordering by
`created_at` sees `Q1, Q2, A1, A2`. Rewriting `created_at` would make it lie about when
the prompt was typed; left as is.

## Evidence

- PR #51's description: the transcript above, the `messages` rows before the fix, and the
  week's count of `nothing_waiting` lines by cause.
- `ts/test/conversation/replyLogging.test.ts`, section "a prompt queued while a turn runs":
  seven tests, four of them red on `main` before the merge (the queued metadata; P1 and P2
  each paired with its own prompt and a repeat P2 Stop `already_answered`; two queued
  prompts claimed in typing order; the folded prompt retired by the next ordinary prompt),
  three pinning what must not change (an unseen id with nothing queued is still
  `nothing_waiting`; a command turn's reply never claims; a repeated id after its reply is
  that turn's prompt).
- On the merge with `main` at `83662a4e`, 2026-11-03: 575 conversation and hook tests
  pass; `tsc --noEmit` and `biome check` clean; CI green on the branch updated to `main`.

## Outcome

Done, 2026-11-03, merged as `a1807b4c`. For the next release.
