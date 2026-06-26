[< Story](index.md)

# Review — CV20.DS1.US1 Inspect Effective Method

## Changed Surface

- Added `src/memory/builder/method_inspection.py` to render Builder method inspection surfaces.
- Extended `src/memory/cli/build.py` with `inspect-method`.
- Updated `.pi/skills/mm-build/SKILL.md` so natural-language Builder method questions route to the contained inspection command.
- Extended `tests/unit/memory/cli/test_build.py` for method inspection, no-active-journey behavior, active Builder journey behavior, unknown method, and unknown journey.
- Updated story docs and validation guidance for natural-language Pi/Mirror validation.

## Refactoring Done

- Kept rendering logic outside `src/memory/cli/build.py` so the CLI remains orchestration rather than formatting-heavy code.
- Added explicit no-active-journey rendering after Navigator feedback showed Mirror may start without an active journey.
- Kept inspection read-only and separate from adoption, persistence, override merge, resume, and lifecycle execution.

## Refactoring Considered But Not Done

- A full visual card renderer using Ariad visual grammar. Deferred because this slice only needs deterministic inspection behavior; visual polish belongs later when surfaces are consolidated.
- A method registry. Deferred because Ariad is the only built-in method and DS1 only needs inspection of current built-in data.
- Persisted adoption state. Deferred to CV20.DS2 Ariad Adoption.

## Debt Paid

None.

## New Debt Introduced

None identified during review.

## Debt Carried Forward

None.

## Review Decision

No debt action required.
