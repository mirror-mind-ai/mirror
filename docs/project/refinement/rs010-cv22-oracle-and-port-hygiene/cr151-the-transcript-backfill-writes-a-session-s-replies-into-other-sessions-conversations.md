[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR151 — The transcript backfill writes a session's replies into other sessions' conversations

## Problem

At SessionEnd, when the payload carries a transcript, `handleSessionEndHook` runs
`backfillAssistantMessages` (`ts/src/conversation/transcriptBackfill.ts`). It picks the
conversations to fill by **time window alone**:

```sql
SELECT id, started_at, ended_at FROM conversations
 WHERE started_at <= ? AND (ended_at >= ? OR ended_at IS NULL)
```

— the transcript's last and first timestamps — with no filter on the ending session,
its bound conversation, or the runtime. Every conversation in that window with no
assistant message yet receives every assistant reply in the transcript whose timestamp
falls between the conversation's start and the transcript's end. An **open**
conversation (`ended_at IS NULL`) that started earlier is always in the window.

So a reply from one session is copied into another session's conversation whenever
that other conversation is open and reply-less: a session killed mid-first-turn (the
prompt logged, Stop never fired, the conversation waiting for maintenance to reap it as
a stale orphan), or a concurrent session on another runtime still inside its first
turn. The copy is inserted with the backfill's own clock (`deps.nowIso()`), not the
transcript's timestamp, so it reads as a reply that arrived when the other session
ended.

The behavior is a faithful port of the Python transcript fallback the TypeScript core
replaced; no test pins the scoping, because the fallback was written when one session
at a time was the only case.

## Expected Behavior

A session's transcript fills only the conversation that session is bound to
(`runtime_sessions.conversation_id` for its `session_id`, the row `endSession` just
closed), and only with replies inside that conversation's own window. The session-less
route (no `session_id`, a transcript alone) fills nothing it cannot attribute — or, if
it must keep a fallback, conversations of the transcript's own runtime only. An
inserted reply carries the transcript's timestamp.

## Impact

Conversation history is the mirror's memory: extraction, recall, and every later
session read it. A reply attributed to the wrong conversation is wrong memory,
silently, and it can cross runtimes. The precondition is ordinary — a Ctrl-C during a
first turn — so it happens on real homes, not only in tests.

## Plan Or Decision

Captured, unassigned, 2026-10-20, from CV21.DS5.US3's live route, at the plan's stop
condition ("a product defect the route finds: stop, capture a CR, and ask whether to
fix it here or there"). Not one line: the fix scopes a query and re-times an insert,
with tests for the orphan and the concurrent cases. Current Focus unchanged.
The Navigator decided the same day: fixed here, in its own Change Request, not inside
US3, whose measurements read the ledger and the ping table rather than conversation
history.

## Evidence

CV21.DS5.US3 route, 2026-10-20, scratch home from the registry's `mirror-mind@0.36.0`,
claude 2.1.304. A hand-run diagnostic at 18:17 UTC called `mirror-hook
claude:user-prompt` with `session_id: probe-direct`, which created an open
`claude_code` conversation with one user message and no Stop — the orphan shape. At
20:41 the route's Claude probe session (`09da44c2…`, one plain prompt, `claude -p`)
ended; its conversation `3cda2aba` got its reply `ready`, and so did the unrelated
orphan `6f0eaea0`, at the same instant (20:41:17.309), from the SessionEnd backfill.
The Stop hook binds by `session_id` and is not the path (`handleStopHook`,
`logger.ts`).

## Outcome

Open.
