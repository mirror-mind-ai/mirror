# Done — CV22.DS9.TS1

## Status

Done

## History Action

Six commits on mirror-ts-core: 099daf57 (record the other paid tool, attribute both), faa26a37 (decide spend from the ledger, not the process), 8faa749b (guard the boundary, not the tools), 3a80cffc (cross-process proof and the Navigator's probe), 59942810 (stop the refusal from teaching the bypass it exists to prevent), plus evidence, CR capture, and roadmap/worklog closure. CI green at 59942810 on all five jobs including macOS. No tag, no release, no stable promotion -- CV22 releases once, when the migration is complete.

## Roadmap Update

CV22.DS9 closes at 4/4: its index header and the TS1 candidate row record D2 and D9 as answered; the CV22 index header and DS9 row say the Delivery Story is done and name DS10 as the last one; the TS1 package is complete (index, plan, test-guide, validation, review, coherence) with Status Done. Both DS9 riders are closed with the AI-19 deviation stated -- one global surface rate, not per tool. docs/process/worklog.md records the milestone. The refinement field gained CR087 (journey_status shape, from D9) and CR088 (Python's unrecorded attachment embedding), and CR084 gained its first unprompted CI reproduction. configuration.md and REFERENCE.md document MIRROR_TS_MCP_GUARDS and its tunables; US1's threat model records items 1-3 as owned, including what the caps do not do.

## Next Recommendation

Pull CV22.DS10 -- Python retirement and npm distribution, the last Delivery Story in CV22 and the one that turns every port into a deletion. It is a convergence gate rather than a port: the web-console retirement gate, the extension compatibility-host deletion gate, TS5's projection cutover as its first act, the runtime update path redesigned for npm, and only then the deletion of src/memory/ and the package rename. Two inputs travel to it from DS9: CR088 asks whether Python's ledger omission is worth fixing in a surface DS10 deletes, and the manifest's launcher is a file DS10 replaces with the npm entry point. Before pulling, the Navigator should decide whether DS10 is planned at Delivery Story level or story by story, since it ends in a release boundary -- the only one CV22 has.

## Missing Done

- none
