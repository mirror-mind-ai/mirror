# Validation — CV9.DS9.TS2

## Status

Passed

## Automated Checks

- sample.mjs --check: same draw; 25 ended with at least 4 messages; 16/8 with the cap of 5
- replay.mjs --assert-arms: 335 traced calls, none on another model or setting
- judge.mjs --check: every label mapping inverts; 30 of 30 verdicts valid; prompt hash frozen after the pilot
- score.mjs --check-no-rows: 0 rows naming a candidate or the judge in either home
- score.mjs --check-content: passed on every committed file
- checkDocLinks and checkRetiredSurfaces (files staged): clean

Checks status: passed

## E2E

Decision: required

Evidence: Replay of 24 production-home conversations through the product's functions (Flash Lite as shipped; Luna and Haiku at reasoning none; one process per arm), no surface failed after retries; Kimi K3.1 Pro judged blind, self-consistency 0.83; the Navigator's blind calibration agreed 0.55, below the plan's 0.60, so the judge does not stand; both signals favor Haiku. Spend $3.90. Evidence: evidence/2026-10-26-replay/README.md

## Navigator Validation

Route: Rank the six calibration conversations blind before any result; read the evidence README; skim ~/mirror-ts2-replay/review.md with the models revealed; see the content and no-row checks in the evidence

Navigator accepted: yes

Expected observation: A result traceable from rubric to ranks to rule, the Navigator's calibration beside it, no content in committed evidence, nothing written to either home

Pass condition: Minimums met, the judge's standing decided by the plan's thresholds, evidence content-free, no row written; the stop decided by the Navigator

Fail condition: A surface below its minimum, an arm calling another model, content in committed evidence, or a row written to a home

## Missing Evidence

- none
<!-- ariad-seal sha256:3603b9fe572a64bf521ea84e60607c6916f5b9bc2908e9449a707b81035c37b1 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
