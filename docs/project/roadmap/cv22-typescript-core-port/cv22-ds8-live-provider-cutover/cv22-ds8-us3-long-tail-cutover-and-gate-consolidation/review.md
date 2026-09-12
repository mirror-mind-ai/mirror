# Review — CV22.DS8.US3

## Status

Reviewed

## Debt Findings

- Four items, all tracked and none blocking. (1) The two cultivation scan leaves are not live: their prompts were never ported, split into CV22.DS8.TS2, refused by name in routing.ts so the dependency cannot be forgotten. (2) CR078, captured during validation: consult spends ~13s of a 14.7s command polling for its own generation cost -- faithful parity with Python, not a port defect, and it needs a measurement before a fix. (3) Two cosmetic inconsistencies recorded in validation.md and not fixed mid-validation: soul harvest save reverts with a reason string unlike its siblings, and the live smoke rounds sub-microcent totals to $0.000000. (4) Not this story's, found in passing and reported to the Navigator uncaptured: welcome.test.ts's status-line test flakes under full-suite load because composeWelcome spawns git with a 2s spawnSync timeout -- the same wall-clock-budget shape as CR058, and a pre-existing unused constant in routing.ts still carries a lint warning I restored rather than silently renamed.

## Debt Decision

defer

## Defer Reason

Nothing here is load-bearing for the eight leaves this story flipped, and each item already has a home: TS2 owns the scan prompts, CR078 owns the consult poll and asks for a measurement first, and the two cosmetic items are one-line sweeps that belong to whatever next edits those files. Paying them now would mean touching the cultivation prompt path and the smoke script immediately after a validated cutover, for no behavioral gain.

## Revisit Trigger

When CV22.DS8.TS2 lands and flips group C: that change touches propose.ts, the smoke's scan probes, and the cultivation route reasons, so the two cosmetic items are sweepable in the same commit and the burn-down ledger's replay-gated table is emptied in the same act. CR078 revisits on its own measurement, independently of TS2.

## Missing Decision

- none
