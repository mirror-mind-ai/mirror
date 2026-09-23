# Review — CV22.DS10.TS4

## Status

Pending debt decision

## Debt Findings

- THREE FINDINGS, none blocking. (1) Orphaned execution profiles: backfill_safe and backfill_force in metadata_lifecycle.py are unreachable in BOTH engines now the backfill is deleted, but the file is a ported oracle graded byte-for-byte by metadata-lifecycle.golden.json with a mirror table in metadataLifecycle.ts. Removing them is a three-file cross-engine change plus a golden regeneration, and the DS index assigned TS4 the CLI face, not the engine. Cost of leaving: two unreachable profiles ship into the npm artifact unless TS5 prunes them. (2) The DS10 candidate table's US1 row reads 'Planned' while its own Workspace And Web Retirement Gate says 'Satisfied 2026-09-19 by US1' and the roadmap DS10 row counts US1 as done. Not TS4's to change -- a status claim about another story -- but the DS-level Done preflight refuses closure while any authored candidate row is non-Done, so it blocks DS10 until decided. (3) The seed-CR scan still reads a hard-coded path into Mirror Mind's own roadmap (cv20-ds6-refinement-workbench-flow/plan.md) inside the USER's project; inherited by the DS7.US8 port, untouched here, and now the only remaining oddity in a field that otherwise has one state.

## Debt Decision

pending

## Defer Reason

none

## Revisit Trigger

none

## Missing Decision

- Navigator debt decision is required
