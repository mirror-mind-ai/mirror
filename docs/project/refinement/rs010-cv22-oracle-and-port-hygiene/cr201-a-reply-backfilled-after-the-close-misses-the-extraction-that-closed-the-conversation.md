[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR201 — A reply backfilled after the close misses the extraction that closed the conversation

## Problem

When a session's `SessionEnd` arrives after session maintenance has already closed its
conversation, `endSession` takes its "already ended" branch: it deactivates the runtime
session and calls the backfill, and nothing else. The transcript's replies are written into
the closed conversation, and no close tail runs again.

The close that came first ran the tail on a conversation that held prompts and no replies.
Maintenance closes an idle orphan with `endConversation(..., { extract: true })`
(`loggerRuntime.ts`, `maintenanceDeps`), so its memories were extracted, and its title,
summary, and tags generated, from the person's side of the exchange alone. The replies
arrive afterwards and are read by no extraction. Recall, the MCP read model, and a
re-extraction see the complete conversation; the memories drawn from it never did.

The window is real but narrow. The idle-orphan threshold is thirty minutes
(`MIRROR_STALE_ORPHAN_MINUTES`), and a Claude Code `SessionEnd` normally fires within
seconds of exit, so it takes a session whose hook was delayed, or a runtime whose hook
fires late: Codex 0.163.0 fires `SessionEnd` when its daemon reaps the idle thread, thirty
minutes after `/quit`, which is the very case the "already ended" branch was written for
(CV21.DS4.US4). Whether a Codex conversation reaches the backfill with replies still
missing, given that its Stop hook logs them, was not measured here.

## Expected Behavior

A conversation that gains replies after its close tail ran is not left with a record richer
than its memories. Either the late backfill leaves the conversation as it found it, or it
owes the tail again: the conversation is flagged so the next session start's maintenance
re-extracts it and finishes its metadata, as `close_tail_pending` already does for a close
cut short. Which of the two is the Navigator's decision (see Plan).

## Impact

Extracted memories are what the mirror carries into later sessions; the conversation is the
evidence they were drawn from. A memory extracted from prompts alone can state the person's
question as if it were their conclusion, and the reply that corrected it is in the same
conversation, unread. Silent, and bounded by how often the late path is taken, which has not
been counted.

## Plan Or Decision

Captured, unassigned, 2026-11-06, from [CR151](cr151-the-transcript-backfill-writes-a-session-s-replies-into-other-sessions-conversations.md)'s
debt review, where it was named as a known risk and left out of scope: CR151 scopes the
backfill to the session's own conversation, and its test for the late `SessionEnd` pins
that the replies land in that conversation, not what then reads them. Current Focus
unchanged.

Options, undecided:

- **Re-owe the tail.** After a backfill that adds rows to an already-ended conversation, mark
  it `close_tail_pending`, so maintenance re-extracts and re-titles it. One more LLM spend per
  late conversation, and the extraction's own idempotence on an already-extracted conversation
  has to be checked first.
- **Skip the backfill on an ended conversation.** The conversation stays prompts-only, as
  extraction saw it. Consistent, and it loses replies the transcript still has.

Measure first how often the branch is taken on a real home: conversations ended by the orphan
close whose runtime session later closed with a transcript.

## Evidence

Read from code, 2026-11-06: `endSession`'s "already ended" branch (`logger.ts`), maintenance's
`closeConversation` with `extract: true` (`loggerRuntime.ts`), and CR151's test "a late
SessionEnd on a conversation maintenance already closed fills only it", which constructs the
state and asserts the rows, not the memories. Not reproduced against a live extraction.

## Outcome

Open.
