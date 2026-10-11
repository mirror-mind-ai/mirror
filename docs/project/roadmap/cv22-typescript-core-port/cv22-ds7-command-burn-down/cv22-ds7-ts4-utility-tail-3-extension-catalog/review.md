# Review — CV22.DS7.TS4

## Status

Reviewed

## Debt Findings

- Three items, all measured and none repaired here. (1) A --global capability binding is not idempotent: _ext_bindings' primary key includes a nullable target_id and SQLite does not treat two NULLs as equal, so INSERT OR IGNORE ignores nothing and duplicates accumulate, where the persona and journey kinds are correctly idempotent. Reproduced in BOTH cores; the fix is a product decision that changes an on-disk constraint (a partial unique index or a sentinel target_id). (2) The two ledger inspect leaves ride the MIRROR_TS_EXTENSIONS gate rather than being ungated as decision D2 wrote them, a deliberate narrowing so that reverting the extension catalog work does not leave two of its leaves on the new engine; one line to undo. (3) A mutant that removes RELEASE SAVEPOINT on the migration success path survives both the corpus and the write probe, because the final rows are identical either way; the failure path's rollback IS graded. Separately, CR085 was captured against RS009 for the .env asymmetry the validation route exposed, so it has an owner outside this story.

## Debt Decision

defer

## Defer Reason

None of the three is repairable inside this story's authority. The binding idempotence fix changes a shipped on-disk constraint and must be decided as product, not corrected as a port defect, while both cores still write the table. The gate narrowing is a Navigator preference about D2's literal wording, not a defect. The savepoint survivor is unobservable by construction, so paying it now would mean inventing an assertion for a state no engine can reach.

## Revisit Trigger

The binding idempotence: when DS10 leaves TypeScript as the only writer of _ext_bindings, or earlier if a duplicate global binding is observed on a real home. The gate narrowing: at the next Navigator review of the CV22 revert controls, or immediately on request. The savepoint: only if a savepoint leak is ever observed in practice.

## Missing Decision

- none
