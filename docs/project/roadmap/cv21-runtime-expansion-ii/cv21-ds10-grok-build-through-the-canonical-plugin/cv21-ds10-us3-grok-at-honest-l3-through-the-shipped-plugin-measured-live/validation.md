# Validation — CV21.DS10.US3

## Status

Passed

## Automated Checks

- node ts/scripts/checkDocLinks.ts clean; no product code changed

Checks status: passed

## E2E

Decision: required

Evidence: grok 1.0.62, through US1's two printed steps. Headless R0/R1/R2 (grok-4.7, no tools): the transport invariant UNKNOWN without the rule and 'Preserve every marked block verbatim before commentary.' with it; canaries emitted at SessionStart (systemMessage + additionalContext) and per turn, never seen; each session logged grok_build with the reply carrying its promptId, Stop 2 for 1 turn with no extra row, close 213-225 ms after SessionEnd, backup written, close_tail_pending 1, no LLM call at the close, finish: Finished deferred close tails: 1. TUI (the Navigator, three screenshots): the canary systemMessage on screen, /mm-mirror -> ◇ financial in 34 s, four turns logged with promptIds, the question logged without its form, 25 mm-* advertised, close 259 ms after SessionEnd, tail finished with title/summary/tags. untouched: 109 entries unchanged, no grok_build row in any real Mirror database. Grok USD 0.139 headless; Mirror USD 0.00077.

## Navigator Validation

Route: From the story package: bash route.sh setup; bash route.sh headless (the Driver ran it); bash route.sh tui (the Navigator ran it, 2026-10-18 19:16-19:22 UTC); bash route.sh check tui; finish tui; untouched

Navigator accepted: yes

Expected observation: R0 UNKNOWN / R1 the invariant answered / NONE on the canaries; every session grok_build with paired promptIds and a silent session-end Stop; the close inside 1.5 s with the backup and the flag; the tail finished at the next start; in the TUI the canary on screen, the ◇ answer, the question logged without its form, 25 skills advertised

Pass condition: every check line green across R0, R1, R2, and the TUI; untouched green

Fail condition: a known invariant in R0, UNKNOWN in R1, a canary quoted, a missing or doubled row, a close outside the bound, a tail not finished, or any real configuration changed

## Missing Evidence

- none
<!-- ariad-seal sha256:620b27487e4ce38a87ace46ca8981bfece07267c17a66188a1f2ae34e185e571 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
