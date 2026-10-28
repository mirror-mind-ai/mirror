[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR180 — The summary prompt's opening rule invites the framing its standalone rule forbids

## Problem

`CONVERSATION_SUMMARY_PROMPT` (`ts/src/extraction/prompts.ts`, ported verbatim from
Python) gives two rules that pull against each other:

- **The opening rule:** "Open with the main topic or question the conversation
  addressed."
- **The standalone rule:** "Do not write "we discussed", "the user said", or "the
  conversation"."

Models follow the first rule's wording and open with "The conversation addressed…" or
"The conversation centered on…". That breaks the second rule, and the summary reads
as a description of a conversation rather than a note about its content.

Measured on 2026-10-26 and 2026-10-28 by CV9.DS9:

- **TS2, on 24 of the Navigator's own conversations:** Kimi K3.1 Pro, judging blind,
  flagged every Flash Lite summary as not standalone (24 of 24). Haiku drew 17 such
  flags and Luna 6. Flash Lite scored 2.21 of 5 on the standalone criterion, Haiku 3.58,
  and Luna 4.5.
- **TS1, in the eval suite:** `extraction/conversation-summary` fails for Flash Lite in
  every recorded run. Haiku with reasoning off failed it in 10 of 14 runs, every
  failure opening "The conversation centered on…".

## Expected Behavior

Every model writes the summary as a standalone note, opening with the topic itself
("Pricing moves from per-seat to usage-based…"), not with a frame around a
conversation. The prompt's rules agree with each other, and the opening rule says what
to write, not what the conversation did.

## Impact

Medium for anyone who reads summaries later, which is what they are for. Every
summary the current pin writes carries the framing. It is independent of the model:
changing the pin does not remove it, and it lowers whichever model is pinned.

## Plan Or Decision

Captured, unassigned, 2026-10-28, from CV9.DS9.TS2's Debt Review (E1), at the
Navigator's direction. DS9 keeps prompts fixed so its comparison stays attributable to
the models, so the fix is this CR's.

A wording change moves the extraction eval's `prompt_hash`. It therefore runs through
the model upgrade playbook's prompt-change path: a baseline on the old wording, then
the new wording, compared probe by probe.

**Revisit:** after CV9.DS9.US3 decides the pin, so the fix is measured on the model
that ships.

## Evidence

- `ts/src/extraction/prompts.ts`, `CONVERSATION_SUMMARY_PROMPT`: the two rules quoted
  above.
- CV9.DS9.TS2's
  [evidence](../../roadmap/cv9-mirror-1-0/cv9-ds9-the-extraction-model-chosen-by-measurement/cv9-ds9-ts2-the-candidates-judged-on-the-navigator-s-own-conversations/evidence/2026-10-26-replay/README.md):
  `not_standalone` flags and standalone scores per model, in `results.md`.
- CV9.DS9.TS1's
  [evidence](../../roadmap/cv9-mirror-1-0/cv9-ds9-the-extraction-model-chosen-by-measurement/cv9-ds9-ts1-extraction-calls-carry-a-reasoning-setting-and-the-candidates-are-re-measured-wi/evidence/2026-10-26-reasoning-off/README.md):
  `extraction/conversation-summary` per model, with reasoning on and off.

## Outcome

Pending: captured, not planned.
