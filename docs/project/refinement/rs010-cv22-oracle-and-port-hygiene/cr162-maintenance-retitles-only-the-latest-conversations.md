[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR162 — Startup maintenance retitles only the 50 most recently ended conversations, so an older weak title is never improved

## Problem

A conversation's first title is provisional: its first user turn, cut to fit
(`generateTitle`). Startup maintenance improves weak titles through the provider
(`retitlePendingConversations`, `maybeGenerateTitle`), and `titleNeedsImprovement`
says which titles are weak: provisional, cut (`...`), 55 characters or more, or born
of a skill block (`<skill…`). But maintenance chooses its candidates from the 50 most
recently ended conversations only (`max(limit × 10, 50)`, with `RETITLE_LIMIT = 5`
titles per run). A conversation that ended before that window is never considered,
however weak its title.

That is why the production home's 25 `<skill…` titles stood from April to October. And
the titles CR160's repair rebuilt from each conversation's first remaining user turn,
provisional, some of them weak ("A", "quit", "Yes, check", "mirror"), will stand too.

## Expected Behavior

Every conversation whose title needs improvement is eventually reached, with the
per-run limit on provider calls kept: for example, maintenance draws its batch from
every candidate rather than from the newest fifty, or a command improves titles on
request.

## Impact

Low to moderate. Conversation lists, recall, and the welcome card show weak titles for
older conversations, and nothing will ever improve them. The provider cost stays
bounded by the per-run limit whichever way it is fixed.

## Plan Or Decision

Captured, unassigned, 2026-10-23, at the Navigator's direction, from CR160's debt
review (item 5), in RS010 beside it. Not planned. Current Focus unchanged.

## Evidence

- `ts/src/conversation/sessionComposites.ts`, `retitlePendingConversations`: the
  candidates are `ORDER BY c.ended_at DESC, c.started_at DESC LIMIT max(limit * 10,
  50)` among ended conversations with a user and an assistant turn; `RETITLE_LIMIT`
  is 5. `ts/src/conversation/metadataLifecycle.ts`, `titleNeedsImprovement`, decides
  which of them are weak.
- The production home, 2026-10-23, read with `?immutable=1`, counts only, by that rule
  approximated in SQL (manual titles excluded): 164 ended conversations whose title
  needs improvement; 2 inside the 50 most recently ended, 162 outside them.
- CR160's repair, run on a copy of the production home: 13 titles rebuilt from the
  first remaining user turn, provisional, among them "A", "quit", "Yes, check", and
  "mirror".

## Outcome

Open.
