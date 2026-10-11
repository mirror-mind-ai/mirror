# Done — CV22.DS10.TS2

## Status

Done

## History Action

Seven commits on mirror-ts-core (8bc3a31a..8e22309d), pushed and green: delete the bridge with its replacement; shim template + D-018 + docs + cutoff + gate; retire the parity claims the deletion made impossible; pay the Debt Review items; worklog; then two CI fixes. Plus 90ada85 in the automation repo migrating the three extensions, CI green there. Both branches clean and in sync with origin. Tests workflow green at HEAD on Python 3.10/3.12, ubuntu, macos, and parity - including the new 'Extension suites need no interpreter' guard on Linux; Docs workflow green at 3b7737a0, the last commit matching its path filter.

## Roadmap Update

DS10 index: TS2 row marked Done 2026-09-21, status 3/8, Extension Compatibility-Host Deletion Gate marked satisfied and noting the install-time register(api) import the gate never named. Zero Python gate row rewritten: TS2 converted the dispatch tree to five Node commands and one sh script; six inert bodies reassigned to TS5 because their bytes are graded by Python-recorded goldens and the fixture dies with its oracle. TS2 story index records the option-3 decision, the two inventory corrections, and both Debt Review resolutions. Burn-down ledger updated for the context runtime, the dispatch family, and the 40-case corpus disposition. decisions.md carries D-018. pending-cutoffs.md carries the cutoff the refusal message points at. Worklog entry added. CR092 and CR093 captured against RS010 with Current Focus preserved.

## Next Recommendation

Pull CV22.DS10.TS3 - the eval harness transfer to ts/evals/ - which is next in DS10's approved order after TS2. Two things to carry into it: this story's repeated lesson that the authored gate names one layer and the inventory finds more (it held four times here), and the fact that TS3 inherits the same oracle-coupling constraint, since the eval harness is Python that grades Python. No release boundary: CV22 releases once, when the migration is complete.

## Missing Done

- none
