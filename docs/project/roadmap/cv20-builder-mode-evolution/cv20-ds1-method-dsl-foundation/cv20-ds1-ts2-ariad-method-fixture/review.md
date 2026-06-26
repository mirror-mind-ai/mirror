[< Story](index.md)

# Review — CV20.DS1.TS2 Ariad Method Fixture

## Changed Surface

- Added `src/memory/builder/ariad_method.py` with the built-in Ariad `MethodDefinition` fixture.
- Added `tests/unit/memory/builder/test_ariad_method.py` covering fixture validity, identity, resolution layers, taxonomy, lifecycle, checkpoint, policies, surfaces, and open questions.
- Updated `test-guide.md` with validation evidence.

## Refactoring Done

- Kept Ariad as declarative data using the existing `MethodDefinition` model.
- Avoided parser, registry, override resolution, CLI, persistence, adoption, resume, or lifecycle execution behavior.
- Preserved policy and open-question payloads as generic data instead of Ariad-specific code branches.

## Refactoring Considered But Not Done

- Extracting lifecycle, taxonomy, policies, and surfaces into separate private builder functions. Deferred because the fixture is still readable as a single declarative object and premature decomposition would add indirection before a second method exists.
- Adding a method registry now. Deferred to avoid introducing lookup semantics before `CV20.DS1.US1 — Inspect effective method` clarifies the inspection path.
- Extending the model with richer event/action contracts. Deferred because this story only needs to prove that the current DSL spine can be represented as data.

## Debt Paid

None. This story adds the first Ariad fixture.

## New Debt Introduced

None identified during review.

## Debt Carried Forward

None.

## Review Decision

Recommendation: no debt action required. Proceed to Coherence after Navigator confirmation.
