[< CV24](../index.md)

# CV24.DS7 — Learn From a Conversation's Newest Stretch

**Status:** 🟠 Implemented — on branch `desktop/library-seam-1a`, not released
**Consumer:** Mirror Desktop's CV-010.DS-005, phase 4, slice 4a.

## Outcome

A host turns its Conversations into memories while they stay open. One call finds the host's idle
Conversations, extracts memories and tasks from the messages each gained since it was last learned
from, stores them against the Conversation, and moves a watermark past them. The Conversation is
never ended.

## Why

The terminal learns from a Conversation once, when it ends: extraction runs only on an ended
Conversation with a Journey and at least 4 messages (`extractionDriver.ts`), over its whole
transcript. A Mirror Desktop Conversation is one Mirror Conversation for its whole life, and a host
appends every turn to it. Measured on 2026-10-30:

- Mirror Desktop 0.3 never ends a Conversation, so none is ever extracted.
- Ending one by idleness does not help. Appending to an ended Conversation is accepted silently
  (`append.ts` checks the row and the Journey, not `ended_at`). On Mirror Desktop 0.2's production
  home, 38 Desktop Conversations received 5,602 messages after they were ended, 36 of them already
  extracted, and nothing of those messages became a memory.
- A Desktop Conversation reached 1,278 messages and 3.05 MB of text. Extraction formats the whole
  transcript into one prompt, unbounded.

## The Call

`learnFromConversations(dbPath, { interface, idleMinutes?, limit? }, { apiKey })`, exported from
`mirror-mind/desktop`. It returns a report of counts only: pieces learned, memories, tasks, pieces
failed, pieces skipped, and Conversations still waiting.

1. **Which Conversations.** Those whose `interface` is the one the host names, with a Journey, not
   ended, whose newest message is at least `idleMinutes` old (default 30, the terminal's orphan
   threshold), oldest first. An ended Conversation belongs to the terminal's extraction and is never
   touched.
2. **Which messages.** Those after the Conversation's watermark, `learned_through` in its metadata
   (the `created_at` and `id` of the last message learned), in `created_at`, `id` order. No
   watermark means from the first message. Fewer than 4 waits for more, the terminal's rule.
3. **Pieces.** The stretch is cut in order into pieces of at most 40 messages and 60,000 characters;
   a message longer than 20,000 characters is cut for the prompt, not in the database. A remainder
   of fewer than 4 joins the piece before it.
4. **Per piece.** Memory extraction and task extraction with the terminal's own prompts; every
   embedding staged before any write; then, in one transaction, the memories and the watermark. A
   crash leaves either both or neither. Tasks follow, best-effort and de-duplicated, as on the
   terminal. Every provider call is written to `llm_calls` as the terminal writes it.
5. **Budget.** At most `limit` pieces per call (default 10, the terminal's AI-05 budget; at most 50).
6. **Failure.** A failed piece adds to `learning_attempts` and stops that Conversation for this call.
   At the terminal's maximum (3), the piece is skipped: the watermark moves past it and
   `learning_skipped_messages` grows, so one bad stretch never blocks the next.
7. **Refusals.** An invalid request is refused (`invalid_request`). With work to do and no key, the
   call is refused before any write (`no_key`); with nothing to learn, no key is needed. A database
   that is not `current` is refused, as by every host call.

The call reads no environment variable of its own; the key is an argument. The write goes through
`openLiveWriteDatabase`, behind the same verified snapshot `mirror doorman` and DS6 take, once per
call.

## What Changes in Existing Code

Only additions, so the terminal's behaviour cannot change:

| File | Change |
|---|---|
| `ts/src/conversation/extraction.ts` | `export` on three existing helpers: `insertMemory`, `persistExtractedTasks`, `resolveUserName`. No body changes. |
| `lib/desktop.js` | Re-exports `learnFromConversations` and `LearningRejectedError`. |

Everything else is new: `ts/src/conversation/learnFromConversations.ts` and its test. No terminal
test changes; the one existing test touched is the entry's own name list (`desktopEntry.test.ts`),
which gains the two names. Considered and rejected: a "stretch only" option inside `runConversationExtraction`.
The terminal's function also writes the summary, its embedding and `extracted`, none of which a
stretch should touch, so the option would have added branches to the terminal's path.

## Metadata Keys (on the Conversation)

| Key | Meaning |
|---|---|
| `learned_through` | `{ "created_at", "id" }` of the last message learned or skipped |
| `learning_status` | the last piece's outcome: `ok`, `no_signal`, `parse_failed`, `llm_failed` or `skipped` |
| `learning_attempts` | failed attempts on the current piece; removed when it is learned or skipped |
| `learning_skipped_messages` | messages skipped after repeated failure, in total |

No terminal code reads these keys.

## Exclusions

- Ending a Conversation, its title, summary, tags or `extracted` flag.
- Curation against existing memories (the terminal's two-pass is off by default).
- Learning from ended Conversations, including the 0.2 line's unlearned messages; the consumer's
  migration phase decides that.
- Coexistence with the terminal on one home: the terminal's orphan close could end a host's
  Conversation and extract it whole. Recorded for the consumer's migration phase.

## Validation

Tests with a home `createHome` made and fake providers: the idle rule, the interface and ended
filters, the watermark and the 4-message rule, the cut and the tail rule, the budget, staging (a
failed embedding writes nothing), failure counting and the skip at 3, the key refusal before any
write, the report's counts, and that the snapshot is taken. Mutation controls as in DS1–DS6. The
whole suite passes with no terminal test changed.
