# Done — CV22.DS9.US2

## Status

Done

## History Action

Seven commits on mirror-ts-core: 9d5a5c8d (D1, Python fixed first + conscious oracle re-baseline), 2dd1aa62 (oracle frozen), 24e92297 (one encoder, PyFloat), 138af0c3 (five deterministic tools), bf017a8b (two provider-crossing tools), 0c4fa249 (the memories --search defect + CR086), a36a7a8d (registry wired, two-engine transcript), 73e5546c (validation scripts and evidence), plus the docs-alignment commit that follows this checkpoint. Not yet pushed.

## Roadmap Update

US2 index marked Done with what was delivered and the four deferred findings; DS9 package to 2/4 with a sequence correction naming TS2 before TS1; CV22 index status line and DS9 row; DS8.US1 inbound correction; CR086 captured against RS010 with Current Focus untouched; worklog entry.

## Next Recommendation

Pull CV22.DS9.TS2, not TS1. US2's D12 inverted the remaining order: the server opens read-only and records no llm_calls row for an agent search, so TS1's wallet guard has nothing to count until TS2 settles how this server opens its database — read-only with no spend accounting, a backup-gated open at 399ms/49.3MB per launch, or a ledger-only writable open. TS2 also owns the manifest flip and D5's launcher revert. No release boundary — CV22 releases once, at the end.

## Missing Done

- none
