# Debt Review — CV23.DS2

## Status

review:defer

## Summary

DS2 introduced no kernel debt: one shared store owns locking, receipts, merge, rollback, and inspection; all producers will reuse it. Carry forward D-014, an unrelated pre-existing web test timing defect found by the full-suite gate: its 2-second polling budget is below the observed 3.3-second runtime-diagnose subprocess. Revisit when runtime-diagnose execution, web polling, or that test harness changes, or if CI reports the same failure. Windows uses filelock's native process exclusion and documents strongest-supported directory durability without claiming POSIX directory fsync.

## Child Work Packages

- CV23.DS2.TS1
- CV23.DS2.TS2
- CV23.DS2.TS3
- CV23.DS2.US1

## Boundary

No push or release action is authorized by this checkpoint.
