# Validation — CV21.DS5.TS1

## Status

Passed

## Automated Checks

- checkDocLinks clean; smoke_npm_package 70/0; smoke_claude_plugin: steps 1-2 pass, step 3 is CR142 (machine-specific, pre-existing); npm test 3330 pass, 0 fail, 3 skipped; route.sh static 4/0

Checks status: passed

## E2E

Decision: required

Evidence: 15 first headless turns plus 5 retries, 3 form turns, and 3 login probes on claude 2.1.296 (claude-opus-5-5), codex 0.163.0, agy 1.4.2, grok 1.0.62 (grok-4.7), from the shipped package in scratch homes with the inert canaried skill; every turn's tool calls classified so a find by disk search does not count. Grok 5 turns US$ 0.22. Table in evidence/table.tsv; summary in test-guide.md.

## Navigator Validation

Route: bash route.sh setup, probe, shape-a, shape-b, shape-c; live <rt> <shape> per listed cell after the three scratch logins; the decision rule applied to the table and (b) accepted by the Navigator on 2026-10-19; static; clean; untouched (by mtime on this pass: the first route version deleted its own baseline; corrected)

Navigator accepted: yes

Expected observation: Three shape tables with every cell readable; (b) listed and found on all four runtimes, (c) attached everywhere and reaching no model, (a) three roots none of which reaches all four; decisions.md entry and the CV21 index reworded; the real configuration unchanged

Pass condition: One shape chosen by the rule stated before the table, accepted by the Navigator; the records written; checkDocLinks clean; no write to the real configuration

Fail condition: A cell the reader could not read; a choice the table does not support; a change to the real configuration; a credential left in a cell

## Missing Evidence

- none
<!-- ariad-seal sha256:ac9cefe588c6df3a2694acc4503262d0f862932b8144662b32d50164478c1866 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
