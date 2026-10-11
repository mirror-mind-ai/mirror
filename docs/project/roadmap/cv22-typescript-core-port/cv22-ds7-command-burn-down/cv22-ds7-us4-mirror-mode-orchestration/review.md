# Review — CV22.DS7.US4

## Status

Reviewed

## Debt Findings

- Matching installed Python extension context providers still require an explicit complete-command Python fallback; CV22.DS7.TS2 owns a finite TS compatibility contract and fallback removal before DS7 can complete.

## Debt Decision

defer

## Defer Reason

Navigator previously selected the bounded extension-free US4 path rather than a permanent TS-to-Python bridge; keeping the fallback visible preserves provider correctness while TS2 defines convergence.

## Revisit Trigger

Pull CV22.DS7.TS2, and in all cases before declaring CV22.DS7 complete.

## Missing Decision

- none
