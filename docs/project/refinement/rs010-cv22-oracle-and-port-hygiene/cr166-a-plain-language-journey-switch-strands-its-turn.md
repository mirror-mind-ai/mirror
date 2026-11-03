[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR166 — A plain-language journey switch strands its turn: the prompt alone in a journey-less conversation, the reply lost

## Problem

`mirror build load <slug>` switches the session to a new conversation for the journey
(`switchConversation`, `ts/src/conversation/logger.ts`, reached from
`ts/src/frontDoor/buildLoadRuntime.ts`): it ends the session's current conversation and
binds a new one with the journey set. It does that in the middle of the turn that asked
for it.

When the activation arrives as a slash command, the turn is a command turn and nothing
is lost: the prompt is not logged and its reply is skipped as `command_turn`. When it
arrives in plain language — "Change to journey mirror", how a session is often opened —
the prompt is a conversation turn:

1. the prompt hook logs it in the session's current conversation, which has no journey;
2. the model runs `mirror build load <slug>`, which ends that conversation and starts
   the journey's;
3. the turn's `Stop` looks for its prompt in the new conversation, finds none, and skips
   the reply as `nothing_waiting`.

So the old conversation is left with one user message, no reply, and no journey, and
can never become a memory (extraction needs a journey and four messages). The reply is
stored nowhere. On Claude Code the skip is also written to `hooks.log`, and
`runtime diagnose` counts it as a hook failure, which is a false warning.
`conversation-logger switch` (`/mm-new`) switches mid-turn the same way.

## Expected Behavior

A turn that switches the session's conversation keeps its prompt and its reply
together, in the conversation the switch opens (the journey's), or the switch takes
effect after the turn's reply is logged. No conversation is left holding only the
activating prompt, the reply is logged, and the `Stop` finds its prompt, so no
`nothing_waiting` line is written for this case.

## Impact

Medium. Every plain-language journey switch loses one exchange and leaves one orphan
conversation. On the production home that was 7 of the conversations started on one
afternoon. On Claude Code each one also raises a false `hook_failures_recorded` in
`runtime diagnose`.

## Plan Or Decision

Captured, unassigned, 2026-10-24, from CV21.DS11's Debt Review, at the Navigator's
direction. Filed in RS010 beside CR100, which covers the same function on a *guessed*
session. Here the session is the right one; the switch's timing is the defect. Not
planned. Current Focus unchanged.

## Evidence

- The production home, 2026-10-24, 14:00–14:14 UTC, read-only (counts only): 7
  conversations titled "Change to journey …", interface `pi`, each with 1 user
  message, 0 assistant messages, and no journey; each followed 3–4 s later by a
  conversation with the journey set. Three of the seven were followed first by an empty
  conversation (0 messages, journey set) and a third one seconds later; why a second
  switch happens, and whether one window or two, is not established.
- CV21.DS11's route, Claude Code 2.1.310, scratch home: in drives 1 and 3 the session
  that ran `mirror build load personal-growth` as a plain-language turn wrote
  `claude:stop: reply skipped: nothing_waiting` to `hooks.log` (14:06:48 and 14:16:16
  UTC); drive 2, whose session never ran it, wrote none. `runtime diagnose` on that home
  reported `hook_failures_recorded: 2`.
- `handleStopHook` (`ts/src/conversation/logger.ts`) reads the session's *current*
  conversation for the waiting prompt; `claudeStop` (`ts/src/hooks/claude.ts`) writes
  the `nothing_waiting` line that diagnose reads as a failure.

## Outcome

Open.
