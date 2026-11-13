[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR208 · The doorman delivers a matching attachment whole on every turn, however large and however often it was delivered before

## Problem

Mirror Mode puts a journey's attachments before the model on two paths:

- **the full folder** (`loadMirrorContext` in `ts/src/mirror/context.ts`), on the turn
  Mirror Mode starts or after a compaction;
- **the delta** (`runDelta` in `ts/src/mirror/doorman.ts`), on every ordinary turn while
  Mirror Mode is on.

Both call `relevantAttachments`, which keeps the top five attachments for a journey
(eight without one) whose score is above 0.4, and both paste each attachment's whole
`content` into the block. There is no size limit.

The delta keeps track of the memories it delivered (`doorman_delivered`) and of the
personas it delivered (`doorman_personas`), so neither is sent twice. It keeps no such
record for attachments. An attachment that scores above 0.4 again is pasted again, while
the earlier copy is still in the transcript.

The score is a raw cosine. A long architecture document scores 0.40 to 0.45 against
almost any prompt in its domain, so the documents most likely to match are also the
largest.

## Expected Behavior

- A session delivers an attachment once. A later turn that matches it names it and does
  not paste it again, the way memories already work, until a compaction's `--forget`
  starts the list over.
- An attachment in a delivery has a size limit. Above that limit the block carries the
  attachment's name, its description and an excerpt, or a command the model can run to
  print the rest, not the whole document. The limit is set in the plan from measurement.
- The full folder and the delta follow the same rule. Desktop's `deliverMirrorContext`
  gets it through the same doorman.

## Impact

In a home with large attachments, Mirror Mode turns carry tens of thousands of tokens of
context nobody asked for, and repeat them. Each block stays in the transcript. An agentic
runtime sends the transcript again with every model call that follows: every tool call,
in every later turn.

A home without attachments is not affected. Whether the users who reported runaway token
use (see CR211) have attachments is not known yet.

## Plan Or Decision

Captured, unassigned, 2026-11-09, at the Navigator's direction. This CR came out of
investigating two reports from Codex users whose small requests used up a five-hour usage
window.

Not planned.

## Evidence

Measured on 2026-11-09 with `mirror` 0.44.0 from this checkout (`11712d26`, through
`~/.local/mirror-dev/bin/mirror` → `bin/mirror.js`), against a copy of the `vinicius-dev`
home under `/tmp`. The session variables were unset, and the same session was named on
every turn:

```bash
mirror mirror doorman --mirror-home <copy> --session-id probe-d --prompt "<prompt>"
```

| Turn | Prompt | Kind | Bytes | Attachments pasted (score) |
|-----:|--------|------|------:|----------------------------|
| 1 | `/mm-mirror kia desktop architecture: explain the overall architecture and the main components` | full | 147,562 | `2026-01-jan-architecture-exploration` (0.450), `2026-06-12-first-rafael-meeting` (0.431), `kia-architecture` (0.420), `2026-06-17-rafael-architecture-meeting` (0.404), `kia-architecture-ide` (0.401) |
| 2 | `which components does the architecture have and how do they communicate?` | delta | 1,044 | none |
| 3 | `and how do the components communicate with the IDE side of the architecture?` | delta | 157 | none |
| 4 | `summarize the kia architecture components again` | delta | 90,536 | `2026-06-12-first-rafael-meeting` (0.457), `2026-01-jan-architecture-exploration` (0.434), `kia-architecture` (0.403) |

At about four bytes a token, turn 1 is about 37K tokens and turn 4 about 22K. Every
attachment in turn 4 was already in the transcript from turn 1.

After the walk, the session's metadata held only `doorman_delivered` and
`doorman_personas`, with no attachment record.

The attachments in that home are `kia-architecture` (75,551 bytes),
`kia-architecture-ide` (34,365 bytes), and five meeting and exploration notes of 3.2 to
4.8 KB.

Code:

- `ts/src/mirror/context.ts`, `relevantAttachments`:
  `scored.slice(0, journey ? 5 : 8).filter((item) => item.score > 0.4)`.
  `loadMirrorContext` appends `row.content` for each attachment.
- `ts/src/mirror/doorman.ts`, `runDelta`: it filters memories by
  `deliveredMemoryIds`, but passes attachments through `relevantAttachments` unfiltered
  and appends `row.content` for each.

## Outcome

Pending: captured, not planned.
