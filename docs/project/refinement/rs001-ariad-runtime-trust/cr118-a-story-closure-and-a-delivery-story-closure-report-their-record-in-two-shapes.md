[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR118 — A story's closure and a Delivery Story's report their record in two shapes

## Problem

The four closure verbs write a record, `validation.md`, `review.md`, `coherence.md`, or
`done.md`, at both levels, and report it in two different shapes:

- **A story.** `validate-item`, `review-item`, `coherence-item`, and `done-item` print
  their checkpoint, whose last block names the record (`validation artifact`, `review
  artifact`, `coherence artifact`, `done artifact`), or `not materialized` without a
  project, with CR079's note in prose when the record was preserved. They print no
  `ARTIFACTS_MATERIALIZED`.
- **A Delivery Story.** `validate-delivery-story`, `review-delivery-story`,
  `coherence-delivery-story`, and `done-delivery-story` print
  `DELIVERY_STORY_CLOSURE_CHECKPOINT`, which names no file, and then
  `ARTIFACTS_MATERIALIZED`, which reports the record with the glyphs and words every
  other write report uses: `✓ created`, `✎ updated`, `↻ existing`, `⊘ preserved`.

The renderers are `closure.ts` for a story and `runDeliveryStoryClosure` in
`commands.ts` for a Delivery Story. Every other lifecycle write, Plan's and Expand's
included, is reported on `ARTIFACTS_MATERIALIZED`.

## Expected Behavior

One shape for one event: a closure reports the record it wrote, at either level, the
way the rest of the lifecycle reports a write. Which shape is the decision this request
asks for. The likely one is the artifacts card for a story too, with the record block
leaving the story checkpoint; the reverse would put a record block on the Delivery
Story's card and leave Plan and Expand as the only users of the artifacts card.

## Impact

Low, and it is the consistency kind. Neither card says anything untrue. A Navigator
reading a story's closure and a Delivery Story's sees two ways of saying that a record
was written, kept, or not written, and the row
[CR009](cr009-name-the-target-project-in-artifact-surfaces.md) adds lives in two
renderers instead of one.

## Plan Or Decision

Captured 2026-10-01 while planning
[CR082 with CR009](cr082-lifecycle-surfaces-print-absolute-paths.md), by the
Navigator's approval of that plan's decision D6. The product-designer lens raised it in
the panel review, as the alternative to CR082's D3. Outside the Ariad trust floor: the
floor is a list, and this request is the consistency kind
([Decisions](../../decisions.md#the-cv22-release-is-gated-on-an-ariad-trust-floor-worked-before-us3)).
Not planned.

## Evidence

CR082's characterization route, at `7e1fbd17`: steps 4 to 7 print a story's four
closure checkpoints, each with its record block and no artifacts card. In the same
characterization, `validate-delivery-story` printed `DELIVERY_STORY_CLOSURE_CHECKPOINT`
with no file named, then `ARTIFACTS_MATERIALIZED` with `✓ created validation`.

## Outcome

Pending.
