[< RS010](index.md)

# CR057 — Stop paying for the discarded summary in the close tail

**Status:** captured
**RS:** RS010
**Driver:** —
**Delivery:** —

## Problem

In `ConversationService.apply_generated_metadata_lifecycle`
(`src/memory/services/conversation.py`), when the tags action is
`apply`/`regenerate`, no summary was generated in the same pass, and the
summary field's decision is `refine_candidate`, the engine calls
`suggest_summary` a second time purely to pass the result into
`_suggest_tags(conversation_id, generated_summary)` — a parameter that method
declares and never reads. The result is one real model call per affected
close whose output is discarded.

The TypeScript port reproduces it deliberately: the close-tail call-sequence
golden pins the branch as `double_summary_when_generation_is_blank` (four
calls, zero bytes changed), because a parity story must match the oracle's
call graph, not improve it.

## Expected Behavior

The close tail makes no model call whose result is discarded. Either
`_suggest_tags` uses the summary it is handed to condition the tags prompt
(if that was the intent), or the second `suggest_summary` call is removed.
Whichever it is, the decision is recorded here, the close-tail golden's
`double_summary_when_generation_is_blank` scenario is regenerated to the new
sequence, and the TypeScript close tail follows in the same change under the
moving-target rule.

## Impact

Cost, on every close that hits the branch: `session-end`, `switch`, and each
stale orphan `session-maintenance` closes. Bounded per close, unbounded across
`close_stale_orphans` (US10 debt observation 1). Removing it is a strict
reduction in live spend with no user-visible change.

## Plan Or Decision

1. Decide whether `generated_summary` was meant to condition the tags prompt.
   `generate_conversation_tags` takes only messages today, so the simpler
   reading is that the parameter is vestigial.
2. Fix Python first; regenerate `close-tail.golden.json` and
   `prompt-assembly.golden.json` if the tags prompt changes; advance the
   oracle baseline in the same commit.
3. Reconcile `ts/src/conversation/closeTail.ts` to the new sequence; the
   call-sequence golden must fail before and pass after.

## Evidence

_Pending._

## Outcome

_Pending._

## Provenance

Found while porting the close tail in CV22.DS7.US10 slice C′, recorded as debt
observation 2, and captured at that story's Debt Review on 2026-09-07.
