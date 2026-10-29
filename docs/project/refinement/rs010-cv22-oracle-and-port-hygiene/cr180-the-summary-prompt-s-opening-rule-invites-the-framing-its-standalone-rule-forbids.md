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

### Plan (2026-10-28, selected after CV9.DS9 closed; approved by the Navigator after the prompt engineer's review)

**Objective.** The summary opens with its subject, never with a frame around the
conversation, on the pin that ships (`anthropic/claude-haiku-5.5` at `none`), with
no loss on the other rules, and the change measured on the prompt-change path.

**The diagnosis, from the review.** The prompt names the conversation as the thing
being described twice, early and heavily weighted ("summary of the conversation
below", "the topic or question the conversation addressed"), and forbids naming it
once, fourth in the list. Haiku violates the prohibition with it in view, so the fix
is in the positive instructions, not a longer forbidden list.

**The wording.** Three edits to `CONVERSATION_SUMMARY_PROMPT`
(`ts/src/extraction/prompts.ts`); everything else byte-identical:

```text
- Write a 3-4 sentence summary of the conversation below. Use flowing prose, not a list.
+ Write 3-4 sentences of flowing prose, not a list. It will be read on its own, months
+ from now, by someone deciding whether the full transcript is worth opening.

- - Open with the main topic or question the conversation addressed.
+ - Open with the subject itself, carrying its real status: a decision as decided, a
+   question as open. "The move to Porto is set for March; what stays open is whether
+   to sell the car."

  - Standalone: a reader six months from now must understand what happened from the
-   summary alone. Do not write "we discussed", "the user said", or "the conversation".
+   summary alone. Do not describe the conversation; record what it established. Do
+   not write "we discussed", "the user said", "the conversation", or "the discussion".
```

Why each: the first line puts the reader and the purpose first, which produces a
standalone note by itself; the opening rule shows one example instead of describing,
with modality in it (TS2 flagged 9 invented facts in Haiku's summaries, so "state it"
without status would trade framing for fidelity); the example's subject is one no eval
touches, because the first draft's example was the `conversation-summary` probe's own
topic and would have let a model pass by echoing it; no quoted negative is added to
the opening rule, since quoted prohibitions are the mechanism that did not work.

Deliberately unchanged: the tone rule, the trivial-conversation rule, the fence
paragraph and its closing line (CV9.E2.S25's injection defence, graded by a blocking
probe), and the `## Conversation` heading. Considered and excluded: more forbidden
phrases, moving the standalone rule first, a second example.

**Affected files.**

- `ts/src/extraction/prompts.ts`: the three edits.
- `ts/test/goldens/prompt-assembly.golden.json`: the five `conversation_summary`
  scenarios' `prompt` and `prompt_sha256`, edited by a script that replaces exactly
  the three strings and recomputes the digest, with asserted counts; a row in
  `ts/test/goldens/README.md`. The golden is frozen; this is a deliberate change.
- `ts/evals/extraction.ts`, probe `conversation-summary`: `isStandalone` also
  rejects "the discussion".
- `docs/project/decisions.md`: one short entry, because a prompt is a measured
  dependency and this changes its hash.

**Measurement (the playbook's prompt-change path).** `prompt_hash` moves for the
`extraction` and `conversation_summary` modules, the two that send this prompt.

1. Baseline, before the edit: US3's gate run of 2026-10-28 (Haiku at `none`,
   `conversation-summary` failed, "The conversation centered on…") and TS1's 14
   runs (4 of 14 passed). No new baseline run is needed; the probe is the failure.
2. After the edit: `eval extraction`, `eval conversation_summary`, and
   `eval title_tags` seven times each (n≥5, playbook step 5), in the development
   home. `title_tags` runs because the tags prompt takes the generated summary as
   input, though its own hash does not move.
3. Pass: `conversation-summary` passes at least 6 of 7; `summary-injection-resisted`
   (blocking, same prompt) passes 7 of 7; no other extraction or title_tags probe
   moves from US3's run. `eval extraction --history` labels the flip as a prompt
   change, with model and reasoning unchanged.

**Navigator validation.** End one substantive conversation in a Pi session on the
development home; its summary opens with the subject, carries the status of what it
reports, and nowhere says "the conversation" or "the discussion". The before is US3's
E2E conversation (`70f7dcda`), whose summary opened "The conversation asked which of
the open CRs…".

**Exclusions.** No other prompt changes; no change to the title, tags, or
extraction prompts; no model or reasoning change; the summaries already stored are
not rewritten. Commit, push, and the release that carries this stay separate gates.

**Driver and Delivery.** `@viniciusteles` on `main`, confirmed by the Navigator
2026-10-28.

### Implementation evidence (2026-10-28)

Three wordings of the standalone sentence, each measured seven times on `extraction`,
`conversation_summary`, and `title_tags` in the development home, on
`anthropic/claude-haiku-5.5` at `none`:

| Standalone sentence | `conversation-summary` | "the conversation" / "the discussion" | "the user" | blocking probe | `title_tags` |
|---|---|---|---|---|---|
| "Do not describe the conversation; record what it established." | 5/7 | 2 ("What the conversation established is…") | 1 | 7/7 | 7/7 |
| "Name people by name, never as "the user"." | 7/7 | 0 | 4, and one invented name | 7/7 | 7/7 |
| "Call the person by the name the transcript gives them." (shipped) | 7/7 | 0 | 7, correct: the fixture's label is `**User:**` | 7/7 | 7/7 |

Across all 21 runs every summary opened subject-first with its status; none said "the
conversation" or "the discussion"; no other extraction probe moved from US3's run. The
`conversation_summary` module's `prompt_hash` moved (`9ed1f1871294` → `f696bec2d17c` →
the shipped hash); the `extraction` module's did not, because its `EVAL_PROMPTS`
excludes this prompt (see Outcome). Residuals: one run in 21 attributed the fixture's
company to "Mirror Mind", from the unchanged system line; every summary closes with
"What stays/remains open is…", the example's shape.

The plan's pass condition "`eval extraction --history` labels the flip as a prompt
change" was impossible as written and is replaced by the `conversation_summary`
module's hash.

### Validation on a real conversation, and what it found (2026-10-28)

The Navigator ended a six-message conversation on the development home
(`a56727f4`, about a prior session's roadmap ranking). Its summary opened "The
conversation consists of the user asking… The assistant established…": a fail on
every count, after 21 clean fixture runs. Replaying that transcript showed two
causes the fixture could not show, and the Navigator directed both fixes into this CR:

1. **The prompts never saw the owner's name.** `createCloseHooks` was built without
   one, so every title, summary, and tags transcript labelled the speaker `**User:**`;
   and the extraction path's resolver matched only "You are talking to" while the
   shipped template writes "You are speaking with", so it fell back to `User` too
   (CR014's finding, confirmed live). With the name, "the user" went from 5 of 5 to
   0; the opening frame fell to 1 to 3 of 5. Fixed in `conversation/userName.ts`,
   fail-soft, used by both paths (`6ba6dbeb`). CR014 keeps the unification with the
   cultivation resolver.
2. **On a transcript that is itself about sessions, the frame is a model attractor
   wording cannot remove.** With the name and the new prompt, about half of the
   attempts still opened "The conversation centers on…". A blind regeneration
   recovered 2 of 5; a regeneration with a short positive note recovered 5 of 5. The
   guard is in `generateConversationSummary` (`7c8df441`): the frame nouns
   (conversation, discussion, session, exchange, chat, dialogue, transcript, user),
   one retry, the second kept only if it opens clean, every call in the ledger.

On the hard transcript after both fixes, 10 of 10 openings were clean ("Vinícius
asked Mirror to rank…", "The Mirror 1.0 readiness question is open: …"). Residuals,
recorded not fixed: a mid-text "the conversation" or "the assistant" in about 2 of
10 on that transcript and about 1 of 3 fixture runs (the probe checks the whole
text, so `conversation-summary` still fails at that rate; the module stays green);
and "The subject is <name>'s question…" as an opening in some runs, the opening
rule's own word, tolerated as a weak frame.

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

In progress since 2026-10-28.
