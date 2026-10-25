# Review — CV9.DS8.TS7

## Status

Reviewed

## Debt Findings

- CR174: Getting Started's 'Measured on' versions and dates are not held to the parity matrix; runtimeParityDocs checks names, levels, and the link only, and the two had drifted before TS7 (Pi's date, agy 1.4.2). The fix is a few lines under ts/, outside this docs-only story.
- The contract's CLI Reference shows --query <q> as required on the 'mirror mirror load --context-only' line; the route reads it as optional, and its only hook caller, agy's pre-1.4.7 path, passes none. Pre-existing; TS7 kept the line.
- Settled, not debt: Getting Started's shared sentence leaves memories out, as accepted at Validation, because TS6's agy walk did not record them. Revisit when an Antigravity walk records memories delivered.

## Debt Decision

defer

## Defer Reason

Neither affects a user today: CR174's fix is code outside this docs-only story, and the CLI Reference bracket would reopen accepted work for one token. Navigator decision, 2026-10-25.

## Revisit Trigger

CR174: the next story that re-measures a runtime and moves its matrix row (tracked in RS010). CLI Reference --query: the removal of agy's pre-1.4.7 path, when the matrix's floor for agy reaches 1.4.7, or the next edit to the CLI Reference.

## Missing Decision

- none
<!-- ariad-seal sha256:4d2dc596cea17049211226beec409f53999279e11fed626df5bf3dd260f502f4 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
