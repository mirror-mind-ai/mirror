[< Story](index.md)

# Review — CV20.DS4.US2 Plan Package And Granularity Gate

## Changed Surface

- Delivery Stories are no longer plannable or implementable units.
- Pulling a Delivery Story now runs Pull, Prepare, and Expand, then stops with a recommended child User Story.
- Plan now accepts only User Stories or Technical Stories.
- Plan materializes the full story package:
  - `index.md`
  - `plan.md`
  - `test-guide.md`
- Plan approval is a deterministic runtime transition before implementation is allowed.

## Refactoring Done

- Moved Ariad surface preservation into deterministic runtime markers.
- Added item-level metadata to the delivery cursor.
- Added work item level and cadence concepts to the Builder method DSL.
- Removed the earlier “Delivery Story as single implementable story” path to preserve one canonical Ariad lifecycle.

## Debt

- Expand currently creates a conservative first recommended User Story. Richer multi-child expansion heuristics remain future product work.
- Accelerated/autonomous cadence remains planned separately in CV20.DS4.US5.

## Decision

Plan Done is methodologically consistent and manually validated.
