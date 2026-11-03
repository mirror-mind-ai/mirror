[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR174 — Getting Started's measured-on versions are not held to the parity matrix

## Problem

The contract's parity matrix is the single authority for runtime parity, and
`ts/test/scripts/runtimeParityDocs.test.ts` holds the other runtime docs to it — but
only by names, levels, and the link: every doc names the five runtimes, every matrix row
carries a level, version, binary, record, and date, the architecture's levels match the
matrix's, and README, Getting Started, and REFERENCE link it. Getting Started's "What
each runtime gives you" table also gives each runtime a version and a date ("Measured
on"), and nothing compares them with the matrix's `Version` and `Measured` columns.

CV9.DS8.TS7 wrote the two to agree (Pi 1.4.0, Claude Code 2.1.310, Codex 0.164.0,
agy 1.4.7, all 2026-10-25; Grok Build 1.0.62, 2026-10-18). Before it they had already
drifted, with every check green: Getting Started read Pi's 2026-10-22 and agy 1.4.2
after US5 and TS6 had moved the matrix to 2026-10-25 and agy 1.4.7. The next story that
re-measures a runtime can leave the page behind the same way.

## Expected Behavior

`runtimeParityDocs.test.ts` fails when a Getting Started row's "Measured on" names a
version or a date other than the matrix row's for that runtime, and the failure names
the runtime and both values.

## Impact

Low: no runtime behavior changes. A user-facing page can state a stale measurement after
a re-measure, and nothing says so.

## Plan Or Decision

Captured, unassigned, 2026-10-25, from CV9.DS8.TS7's Debt Review, where the Navigator
deferred it: the fix is under `ts/`, outside that docs-only story. A few lines in the
existing test: read Getting Started's table under its heading as `tableUnder` already
reads the architecture's, and compare each row's version and date with the matrix row's.
The matrix's `Version` cell can carry more than the number (Grok Build's
`1.0.62 (1474f9cbdd91)`, agy's `agy 1.4.7`), so the comparison reads the version number.
**Revisit:** the next story that re-measures a runtime and moves its matrix row.

## Evidence

[TS7's test guide](../../roadmap/cv9-mirror-1-0/cv9-ds8-one-doorman-mirror-s-context-before-the-model-on-every-runtime/cv9-ds8-ts7-written-where-a-user-reads-it/test-guide.md#debt-review-candidate),
"Debt Review Candidate"; the guard's four tests in
`ts/test/scripts/runtimeParityDocs.test.ts`; TS7's Getting Started commit (`a5f97ee4`),
whose diff shows the Pi and Antigravity rows behind the matrix before it.

## Outcome

Pending: captured, not planned.
