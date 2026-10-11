# Review — CV22.DS6.TS3

## Status

Reviewed

## Debt Findings

- The DS2 'delegate to Python to bootstrap a missing database' stopgap (routing.ts + firstRun.test.ts) was deliberately NOT flipped in this story, even though its CI gate (A4 green on real CI) is now met. Flipping the front door is a distinct, separately-scoped change (routing behavior + test assertion change), not a natural extension of the lock/pragma capability this story delivered. It is tracked as a named follow-up, not silently dropped.

## Debt Decision

defer

## Defer Reason

Navigator explicitly chose to keep TS3 scoped to delivering and proving the bootstrap capability, not to also flip runtime routing in the same story — smaller, cleaner review boundary, and the flip deserves its own acceptance behavior/test-guide rather than riding in on TS3's.

## Revisit Trigger

Before CV22.DS6 (the parent Delivery Story) is marked Done, since its own Done Condition requires the DS2 new-database-bootstrap delegation to Python to be removed. Revisit as an explicit follow-up story (or as part of closing DS6) once TS3 is Done.

## Missing Decision

- none
