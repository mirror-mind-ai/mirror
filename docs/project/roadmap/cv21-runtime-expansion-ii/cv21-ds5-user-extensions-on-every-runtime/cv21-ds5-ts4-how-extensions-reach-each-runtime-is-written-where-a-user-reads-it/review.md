# Review — CV21.DS5.TS4

## Status

Reviewed

## Debt Findings

- (1) Paid in Refactor, 2026-10-22: the contract listed the wiring and reinstall commands twice, in US2's per-home plugin section and in TS4's table, and one copy had already drifted (the missing mkdir -p). The section's two bullets now keep their own facts and point to the table; the table's four plugin-runtime rows are the contract's only extension-command lines. checkDocLinks clean, route.sh static 14 passed.
- (2) Deferred: nothing ties the docs' commands to the code. wiring.test.ts pins extensionPluginWiringSteps and extensionPluginReinstallCommand, but no test reads the contract's table or the authoring guide's step-7 block.
- Found, not this story's debt: the project spells Pi's skills /mm-<skill> where Pi 1.3.0 registers /skill:<name>, and the authoring guide's step 7a lost two dashes; captured as CR159 (RS010), one Change Request by the Navigator's decision.

## Debt Decision

defer

## Defer Reason

The commands have not changed since US2 (2026-10-19), and the plan review judged a test matching the docs to the code premature while DS11 consolidates these surfaces into the parity matrix.

## Revisit Trigger

The next change to extensionPluginWiringSteps, extensionPluginReinstallCommand, or the install report's plugin block; or DS11 building the parity matrix; whichever comes first.

## Missing Decision

- none
<!-- ariad-seal sha256:937857845446572ce738de4a5a86e26b0027fe64b4a2fc8e2ae381bc2808b00a — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
