# Review — CV20.DS6.US2

## Status

Reviewed

## Debt Findings

- Natural-language composition now depends on /mm-build skill routing examples rather than a structured runtime intent parser. This is acceptable for the first composition slice but may be brittle across harnesses or phrasing variants.

## Debt Decision

defer

## Defer Reason

A structured conversational intent router should be designed after more Workbench dogfooding, not inside the first RS/CR composition command slice.

## Revisit Trigger

When implementing CV20.DS6.US3 Pull A Refinement Story, TS2 Refinement Flow Runtime, or when natural-language capture fails for common Navigator phrasing.

## Missing Decision

- none
