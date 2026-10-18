[< Parent](../index.md)

# CV21.DS7.TS3 — The session logs as antigravity from the transcript

**Status:** ✅ Done
**Type:** Technical Story

---

## Technical Story

In order to meet the last item of the successor bar,
As the plugin's agy-native layer,
I want the `Stop` handler to read agy's JSONL transcript and log the turn's
user and assistant messages labelled `antigravity`, beside their prompts,
closing the conversation so its memories are extracted,
So that a Gemini CLI user loses nothing in the move to Antigravity, and US4
can measure all five bar items together.

## Outcome

agy's hook payloads carry no prompt or reply text (DS12.TS3 L7): the `Stop`
payload names `conversationId` and `transcriptPath` and the termination
reason, nothing more. So logging reads the transcript agy writes — the
JSONL whose step records TS2 already saw (`step_index`, `source`, `type`,
`status`, `created_at`, `content`; a user turn is a `USER_INPUT` step, the
model's answer an `AGENT_MESSAGE` step). agy fires `Stop` at the end of each
execution loop (each user turn), and has **no SessionEnd hook** — so the
handler logs the turn on each `Stop` and the conversation is closed the way
Codex's is, by session maintenance's stale-orphan path
(`MIRROR_STALE_ORPHAN_MINUTES`), unless the probe shows a cleaner close
agy affords. Turns are labelled `antigravity`; `runtimeDetection` already
has the label.

## Acceptance Behavior

```text
Given a Stop payload naming a conversationId and a readable transcriptPath
When the Stop handler runs at the end of a user turn
Then the turn's user message and the model's final answer are logged,
  labelled antigravity, the reply beside its prompt
And re-running Stop on the same transcript logs nothing new (idempotent)
When the transcript is absent, empty, or unreadable
Then the handler answers agy's contract and records nothing, never failing
  the turn
And the conversation is closed so its memories extract, by the stale-orphan
  path or the measured close
And a command turn ($-skill) is handled as every runtime handles it
```

## Scope

- The `agy:stop` hook entry: read `transcriptPath`, extract the latest
  user turn and assistant answer, log them as `antigravity` through the
  existing conversation-logger seam, idempotently.
- A transcript reader for agy's JSONL (its own step shape), beside the Pi
  and Claude transcript readers.
- The third generated `agy`-form wrapper and the grown `hooks.json` `Stop`
  array.
- The close model: stale-orphan by default, or the measured alternative.

## Out Of Scope

- US4's five-item measurement and DS8's Gemini removal.
- The cross-session write defect (DS12.TS2 L9): a core defect, routed.
- Changing Claude, Gemini, or Codex logging.

## Validation

Automated: transcript-reader and Stop-handler units over fixtures shaped
from a captured agy transcript; the full suite. Navigator-visible: the live
route logs a two-turn session as `antigravity` on the installed agy, with
sanitized evidence.
