# Review — CV22.DS10.TS5

## Status

Reviewed

## Debt Findings

- TS5's own debt, none left open: D-023, D-024 and D-025 were paid at plateaus 1-2. The handoff review's twelve findings, including blocker B1 (migrate-on-open never ran the bootstrap schema, so a v0.7.0 home broke in Mirror Mode after migrating), were paid 2026-09-25 from e400d395 to 9a3bf1ef.
- PAID NOW, CR084. Its revisit trigger fired on TS5's own CI: migrateOnOpenConcurrency failed on both attempts for 9a3bf1ef, and had also failed on CI at 9503b7d8, before B1. Fixed in 1b947cdd as the CR specified. The record is linked into place, so the lock is never visible empty. Unreadable content ages out instead of reading as abandonment. A release or a reclaim removes only the lock it judged. The tests were red first, 240/240 races pass under load, and CI is green on both legs at 1b947cdd. CR084 is done.
- Decided by the Navigator: CR088 and CR092 rejected, their subjects deleted with the Python core. CR093 promoted to CV22.DS10.US3. CR063, CR069 and CR070 stay captured, with the fired trigger noted in each. DS7.TS4's global-binding duplicates captured as CR099.
- Ledger records corrected: the entry status lines of D-005 (Dropped), D-017 and D-019 (Paid) now match their own text and the summary table. D-018 is Paid by TS2's 2026-09-21 decision, and has the Resolution it never had.
- No action: DS7.TS4's gate item (the gate was deleted by D3) and its savepoint mutant (trigger not fired); DS6.TS5's display_code nullability (the Workbench is retired and its tables have no reader); DS7.US3's --threshold formatting (TypeScript's rendering is the contract now).
- Carried with a durable home: CR096, CR097, CR098 and CR099 in the refinement index. F20 until the production clone takes the CV22 release, with its closing check at item 7 of US3's inherited.md. The other US3 items are in inherited.md. D-026 and D-027 are in the ledger.

## Debt Decision

defer

## Defer Reason

Nothing TS5 introduced is left unpaid. What stays carried belongs to later work, and each item has a durable home with its own trigger: the CRs in the refinement index, F20 and the rest of US3's inheritance in inherited.md, D-026 and D-027 in the ledger.

## Revisit Trigger

US3's Pull, which reads inherited.md (F20's closing check is item 7); the CV22 release gate, which re-checks F20; each CR's own planning.

## Missing Decision

- none
