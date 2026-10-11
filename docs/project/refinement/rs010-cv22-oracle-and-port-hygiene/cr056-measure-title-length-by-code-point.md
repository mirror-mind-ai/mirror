[< RS010](index.md)

# CR056 — Measure title length by code point in titleNeedsImprovement

**Status:** captured
**RS:** RS010
**Driver:** —
**Delivery:** —

## Problem

`titleNeedsImprovement` in `ts/src/conversation/metadataLifecycle.ts` decides
one of its branches with `title.length >= 55`. JavaScript's `length` counts
UTF-16 code units; Python's `len(title) >= 55` in
`ConversationService.title_needs_improvement` counts code points. A title
containing astral characters (emoji are the common case) near the boundary
is measured longer by TypeScript than by Python, so the two cores can disagree
on whether the close tail regenerates the title — which changes how many model
calls the close tail makes, not just a stored string.

The same class of defect was found and fixed in `generateTitle` during
CV22.DS7.US10 slice E (`ts/src/util/pythonText.ts` now provides
`codePointLength` and `sliceCodePoints`). This site was left alone because it
sits under the slice-C′ metadata-lifecycle goldens, none of which carry an
astral character near 55, and a parity story does not change a graded surface
without a fixture that fails first.

## Expected Behavior

`titleNeedsImprovement` measures the title with `codePointLength`, and the
metadata-lifecycle golden carries at least two fixtures on the boundary — one
that is 55 code points but more than 55 code units, one that is 54 code
points but 55 or more code units — so the decision matches Python's on both.

## Impact

Low frequency, real consequence: a wrong decision here fires or skips a title
regeneration, so the ledger and the stored title diverge from Python's for
that conversation. It also silently weakens the close-tail call-sequence
golden's claim for any title with emoji.

## Plan Or Decision

1. Add the two boundary fixtures to `ts/parity/generate_metadata_lifecycle_golden.py`
   and regenerate; confirm the TypeScript decision fails on at least one.
2. Replace `title.length` with `codePointLength(title)`.
3. Mutation-check: revert the fix, the new fixture must fail.

One-line fix, two fixtures. No Python change, so no oracle baseline advance.

## Evidence

_Pending._

## Outcome

_Pending._

## Provenance

Recorded as debt observation 6 in CV22.DS7.US10's plan and captured at that
story's Debt Review on 2026-09-07.
