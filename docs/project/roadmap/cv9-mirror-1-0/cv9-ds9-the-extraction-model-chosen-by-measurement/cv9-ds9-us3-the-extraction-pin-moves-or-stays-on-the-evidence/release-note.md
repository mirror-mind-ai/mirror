[< Story](index.md)

# Release-note section — the extraction pin

This is the section for the release that carries the pin change, drafted here and
not under `docs/releases/`, because `mirror runtime release-notes latest` picks the
highest semver filename there, and a note for a version no one can install yet would
be shown as the latest. DS9's close names the version and moves this section into
`docs/releases/v<X.Y.Z>.md`, with the frontmatter digest and the other sections of
the canonical structure. If CR180 ships in the same release, the sentence marked
`[CR180]` is removed.

---

## Highlights (the pin's bullets)

- The model that writes your memories, tasks, titles, summaries, and tags is now
  Claude Haiku 5.5, chosen by measurement: on your own conversations, ranked blind, it
  came first on 16 of 26 surfaces, ahead of Gemini 2.5 Flash Lite and GPT-6 Luna; on
  the eval suite it fixes three failures Flash Lite had in every recorded run; and it
  drew no rate-limit error where Flash Lite drew one on a third of its attempts.
- Reasoning is off for it, the setting it was measured with. A pin now carries its
  own reasoning default, and `MEMORY_EXTRACTION_REASONING` still wins when set.
- Rolling back is one line in `~/.config/mirror/env` (see What Changed).

## What Changed (the pin's narrative)

Since mid-2025, one model, Gemini 2.5 Flash Lite, wrote everything Mirror writes about
a conversation after it ends. CV9.DS9 measured it against two newer models at about the
same price, first on the eval suite with reasoning on and off, then on 24 of the
Navigator's own conversations replayed through the product's own functions, with the
outputs ranked blind. The decision rests on those rankings, and it is Claude Haiku 5.5
at reasoning `none`, in one commit that changes the pin, its reasoning default, and
the price table together, behind a green `eval --all` on each side of the change.

What you will notice first: memories and tasks that invent less and classify better,
titles that name the topic, and no more conversations silently left untitled because
a model spent the title's token budget thinking. Background work after a conversation
ends is a little slower, about half a second more on reception, before a turn that
then waits seconds for the answering model; you will mostly not notice. The OpenRouter
bill for these calls goes up about 40% at typical volume, because Haiku counts more
tokens for the same text: about a dollar a month where Flash Lite cost seventy-five
cents. [CR180] Summaries sometimes open with "The conversation centered on…"; that
framing comes from the prompt, not the model, and CR180 fixes it.

**To roll back**, put this line in `${XDG_CONFIG_HOME:-~/.config}/mirror/env` (in a
clone, its `.env`):

```text
MEMORY_EXTRACTION_MODEL=google/gemini-2.5-flash-lite
```

Then run `mirror runtime status`: the models line names Flash Lite with no reasoning
clause, which is the request it was always sent. Rolling back also brings back Flash
Lite's upstream rate limits. Remove the line to return to the pin. Nothing in the
database changes either way; a model change is configuration, not a migration.

## Conscious Exclusions (the pin's bullets)

- One pin still serves every surface. The measurement favoured Luna for summaries
  and Haiku for everything else; a model per surface is a Change Request, not this
  release.
- The ledger does not record which reasoning effort a call carried
  ([CR181](../../../../refinement/rs010-cv22-oracle-and-port-hygiene/cr181-the-ledger-cannot-say-which-reasoning-effort-a-call-carried.md)):
  after the swap, the model column tells the two apart in practice.
- No provider routing or fallback: the move retired Flash Lite's rate-limit exposure
  for the pin; a rolled-back install takes it back.

## What We Learned (the pin's paragraph)

An LLM judge can agree with itself and not with the person. TS2's judge was
self-consistent (0.83) and agreed with the Navigator's blind rankings on 55% of
pairwise orderings, under the bar the plan had set, so the decision was made on the
Navigator's rankings instead. Calibrate the judge with the person on four to six
conversations before the full run; learning it afterwards cost six times as much.
