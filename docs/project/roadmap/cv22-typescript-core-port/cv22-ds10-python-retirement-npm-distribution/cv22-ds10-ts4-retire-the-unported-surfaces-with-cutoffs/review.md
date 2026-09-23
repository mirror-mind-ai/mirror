# Review — CV22.DS10.TS4

## Status

Reviewed

## Debt Findings

- PAID NOW (was finding 2): the DS10 candidate table's US1 row read 'Planned' while US1's own package, its retirement gate, and the CV22 roadmap row all read Done. US1's done.md had recorded that row update as completed work that never landed. Corrected with the missing link; DS10 count moved 2/8 -> 4/8 so the correction would not contradict the same table. This unblocked the DS-level Done preflight. TWO FINDINGS CARRIED. (1) backfill_safe and backfill_force in metadata_lifecycle.py are unreachable in BOTH engines now the backfill is deleted, but the file is a ported oracle graded byte-for-byte by metadata-lifecycle.golden.json with a mirror table in metadataLifecycle.ts; removing them is a three-file cross-engine change plus a golden regeneration, and the DS index assigned TS4 the CLI face rather than the engine. (2) The seed-CR scan still reads a hard-coded path into Mirror Mind's own roadmap (cv20-ds6-refinement-workbench-flow/plan.md) inside the USER's project; inherited by the DS7.US8 port. NO DEBT INTRODUCED: ~7,700 lines removed, one route shape added with three tested safety properties (no stdin read, no argv echo, static anchor), database untouched.

## Debt Decision

defer

## Defer Reason

Both are carried, not introduced: pre-existing conditions this story exposed rather than created, and neither changes behavior for any user today. Paying them now would widen a deletion story into the ported lifecycle engine and its golden - precisely the cross-engine edit the DS index kept out of TS4's scope by assigning it the CLI face. Deferring costs nothing operationally; the only real cost is the risk of forgetting, which the trigger below is meant to carry.

## Revisit Trigger

CV22.DS10.TS5, which deletes the Python core: at that point the orphaned profiles become a single-file TypeScript pruning with no oracle left to keep in sync, and the hard-coded seed-CR path can be fixed or deliberately kept once the Python seam is gone. TS5 must check both before packaging, because after it there is no second engine to force the question and the profiles would ship into the npm artifact unreachable.

## Missing Decision

- none
