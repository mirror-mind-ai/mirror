[< Story](index.md)

# Review — CV20.DS4.US6 Coherence And Done Gate

## Changed Surface

- Added deterministic `COHERENCE_CHECKPOINT` surface.
- Added deterministic `DONE_CHECKPOINT` surface.
- Added `coherence-item` and `done-item` commands for Ariad-adopted journeys.
- Coherence verifies Process, Project, and Product alignment after Debt Review.
- Done records history action, roadmap/story package update, and next Ariad recommendation.

## Runtime Behavior

- Coherence requires `last_delivery_event=review_complete`.
- Successful Coherence records `last_delivery_event=coherence_complete`.
- Done requires `last_delivery_event=coherence_complete`.
- Successful Done records `last_delivery_event=done_complete`.
- Both commands materialize story package artifacts when a package path is available:
  - `coherence.md`
  - `done.md`

## Manual Validation

Validated against `/Users/alissonvale/Code/sandbox-pet-store` after Debt Review completed.

Coherence produced:

```text
status
coherent

missing coherence
✓ none

boundary
Coherence is complete; Builder may proceed to Done.
```

Done produced:

```text
status
done

missing done
✓ none

boundary
Story closure is complete; Builder may recommend the next Pull.
```

## Debt

- Done currently records history intent and artifact state, but repository commits remain governed by project/git availability and future effective preferences work.
- Parent Delivery Story collapse remains future work.

## Decision

Done. The full happy-path lifecycle now reaches coherent story closure.
