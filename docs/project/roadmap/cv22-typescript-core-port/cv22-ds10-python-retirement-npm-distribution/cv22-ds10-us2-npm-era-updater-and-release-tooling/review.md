# Review — CV22.DS10.US2

## Status

Reviewed

## Debt Findings

- Handoff review by the panel (engineer, quality-assurance, devops-engineer, security-engineer, database-architect) found five items. D-025 (medium, correctness): runtime migrate prints 'Migrate result: nothing pending' and exits 0 when ensureMigratedOnOpen DECLINED the work (deferredToPython), so an update can report a passing migrate stage on a database with pending migrations — honest today because Python can still apply it, fatal after TS5 when there is nothing to defer to. D-026 (low): the pipeline is implemented twice, once per install kind, in one 622-line module, contradicting the design's own claim that only 'apply' differs. D-027 (low): nothing writes the package update-channel file, so a package user cannot select a channel persistently. Paid now, not deferred: the migrate render points a standalone caller at runtime backup, since outside the pipeline its only pre-state is a fixed-name snapshot overwritten each run; and the test guide was reconciled with the artifact after it was found to name FIVE test files that do not exist and to claim a dev-role refusal neither engine has.

## Debt Decision

defer

## Defer Reason

D-025 belongs with TS5, which is already rewriting what 'pending' can mean when only one engine remains; paying it before that change would encode a two-engine assumption the next story removes. D-026 and D-027 belong with US3, which gives the package path its registry behavior and its published package — the point at which the two halves would actually drift and a channel becomes selectable. The two documentation defects were paid immediately rather than carried, because a guide that misdescribes its own artifact is the defect this story exists to stop repeating.

## Revisit Trigger

D-025 at CV22.DS10.TS5 planning, BEFORE the Python migration engine is deleted — a blocker for that story, not a nice-to-have. D-026 and D-027 at CV22.DS10.US3 planning, when the package strategy gains registry behavior.

## Missing Decision

- none
