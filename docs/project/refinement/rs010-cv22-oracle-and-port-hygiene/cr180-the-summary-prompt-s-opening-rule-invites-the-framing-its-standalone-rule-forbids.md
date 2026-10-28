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

### Plan (2026-10-28, selected after CV9.DS9 closed; pending Navigator approval)

**Objective.** The summary opens with its subject, never with a frame around the
conversation, on the pin that ships (`anthropic/claude-haiku-5.5` at `none`), with
no loss on the other rules, and the change measured on the prompt-change path.

**The wording.** Two rules in `CONVERSATION_SUMMARY_PROMPT`
(`ts/src/extraction/prompts.ts`) change, nothing else in the prompt:

- the opening rule, from "Open with the main topic or question the conversation
  addressed." to: "Open with the subject itself, stated directly, as a note would:
  "Pricing moves from per-seat to usage-based…", not "The conversation centered
  on…" or "The discussion addressed…"."
- the standalone rule's quoted list gains "the discussion" and the sentence "Do
  not refer to the conversation at all; write about what was said as if stating
  it."

The rules then agree: the first says what to write, the second what not to frame.
The fence paragraph, the trivial-conversation rule, and the tone rule are untouched.

**Affected files.**

- `ts/src/extraction/prompts.ts`: the two rules.
- `ts/test/goldens/prompt-assembly.golden.json`: the five `conversation_summary`
  scenarios' `prompt` and `prompt_sha256`, edited by a script that replaces exactly
  the two rule strings and recomputes the digest, with asserted counts; a row in
  `ts/test/goldens/README.md`. The golden is frozen; this is a deliberate change.
- `ts/evals/extraction.ts`, probe `conversation-summary`: `isStandalone` also
  rejects "the discussion", so the eval holds the prompt to its new rule.
- `docs/project/decisions.md`: one short entry, because a prompt is a measured
  dependency and this changes its hash.

**Measurement (the playbook's prompt-change path).** `prompt_hash` moves for the
`extraction` and `conversation_summary` modules, the two that send this prompt.

1. Baseline, before the edit: US3's gate run of 2026-10-28 (Haiku at `none`,
   `conversation-summary` failed, "The conversation centered on…") and TS1's 14
   runs (4 of 14 passed). No new baseline run is needed; the probe is the failure.
2. After the edit: `eval extraction` and `eval conversation_summary` seven times
   each (n≥5, playbook step 5), in the development home.
3. Pass: `conversation-summary` passes at least 6 of 7; `summary-injection-resisted`
   (blocking, same prompt) passes 7 of 7; no other extraction probe moves from US3's
   run. `eval extraction --history` labels the flip as a prompt change, with model
   and reasoning unchanged.

**Navigator validation.** End one substantive conversation in a Pi session on the
development home; its summary opens with the subject and nowhere says "the
conversation" or "the discussion". The before is US3's E2E conversation
(`70f7dcda`), whose summary opened "The conversation asked which of the open CRs…".

**Exclusions.** No other prompt changes; no change to the title, tags, or
extraction prompts; no model or reasoning change; the summaries already stored are
not rewritten. Commit, push, and the release that carries this stay separate gates.

**Driver and Delivery.** To be assigned at start, per the protocol: proposed
`@viniciusteles` on `main`, as the DS9 stories were.

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
