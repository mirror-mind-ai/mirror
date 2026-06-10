[< Story](index.md)

# Review — CV20.DS2.US1 Adopt Ariad For A Journey

## Changed Surface

- Extended `/Users/alissonvale/Code/mirror-dev/src/memory/cli/build.py` with `memory build adopt --method ariad` and `memory build adopt --journey <slug> --method ariad`.
- Updated `/Users/alissonvale/Code/mirror-dev/src/memory/builder/method_inspection.py` so journey inspection reports adopted Ariad when adoption state exists and renders adoption reports.
- Updated `/Users/alissonvale/Code/mirror-dev/.pi/skills/mm-build/SKILL.md` so natural-language adoption requests route to the contained command.
- Extended `/Users/alissonvale/Code/mirror-dev/tests/unit/memory/cli/test_build.py` with adoption, active-journey adoption, idempotency, error, and inspection-after-adoption tests.
- Updated story docs and validation evidence under `/Users/alissonvale/Code/mirror-dev/docs/project/roadmap/cv20-builder-mode-evolution/cv20-ds2-ariad-adoption/cv20-ds2-us1-adopt-ariad-for-journey/`.

## Refactoring Done

- Kept adoption as a read/write method-state operation only.
- Preserved separation between method adoption and template generation.
- Preserved separation between method adoption and delivery lifecycle execution.
- Reused `CV20.DS2.TS1` adoption state helpers rather than adding a second persistence path.

## Refactoring Considered But Not Done

- A richer adoption service object. Deferred because the first adoption behavior is small and the CLI remains understandable with helper functions.
- A dedicated visual surface module for adoption reports. Deferred until DS2.US2 or resume surfaces create more pressure for a shared Builder surface layer.
- Recording template inventory during adoption. Deferred to `CV20.DS2.US2 — Adoption Template Generation`.

## Debt Paid

None.

## New Debt Introduced

None identified during review.

## Debt Carried Forward

None.

## Review Decision

No debt action required.
