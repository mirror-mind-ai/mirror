# Review — CV22.DS10.US1

## Status

Reviewed

## Debt Findings

- scene.jsonl keeps six runs of eval history for a retired module, including the run that produced D-017's evidence. Deleting the module did not delete its record, and no story has decided whether history follows the harness to ts/evals/ or stays behind.
- routing is now the only module between the eval suite and green. It has failed since v0.31.0 on D-005's stale persona fixtures, and DS10's eval gate already calls it the obvious retirement. US1 did not cause it and does not own it, but shrinking the denominator made it conspicuous.
- No debt introduced by the deletion itself: every surviving eval module matched its 2026-09-13 baseline probe for probe, no guard was weakened, the shared fencing helpers are untouched, and check_retired_surfaces.py now asserts mechanically what this story removed.

## Debt Decision

defer

## Defer Reason

Both belong to CV22.DS10.TS3, which owns the eval harness transfer and already carries scene's disposition, D-005's retirement question, and D-017's harness-contract fix. Deciding either here would take that story's decision from inside a deletion story, and the second one is not even a defect — it is a pre-existing red that US1 made easier to see.

## Revisit Trigger

CV22.DS10.TS3, at plan time: it decides whether eval history follows the harness, and whether routing is retired or its fixtures updated.

## Missing Decision

- none
