# Review — CV9.DS9.TS1

## Status

Reviewed

## Debt Findings

- D1: the measurement scripts exist in two copies as evidence outside the eval harness (baseline, TS1); TS2 would make a third
- D2: the llm_calls ledger cannot attribute calls to a reasoning setting
- D3: Flash Lite is rate-limited upstream (HTTP 429 on 31% of eval attempts; one production reception rate_limit)
- D4: tags-exclude-noise and shadow-touch-vague-discomfort are unstable on Flash Lite; recorded, the playbook's n>=5 step covers noise
- D5: the control rule (more than one run in seven, on rates) flagged a single failure once rate limits shrank the clean runs; lesson carried to TS2's plan
- D6: a validation route can reach the wrong install (a bare mirror is the released package in the Navigator's shell); fixed in TS1's route, the development guide gets one sentence during Coherence

## Debt Decision

defer

## Defer Reason

Every finding has an owner later in DS9 or is recorded: D1 goes to TS2's plan (whether tracing becomes an eval-harness feature), D2 and D3 to US3, D4 and D5 are recorded in TS1's evidence and carried into TS2's plan; D6 is process alignment done in Coherence

## Revisit Trigger

TS2's Plan (D1, D5) and US3's Plan (D2, D3)

## Missing Decision

- none
<!-- ariad-seal sha256:4629934b3038963c541e7ee2db817d67458e0c947f80d717bdb99ff593763c8c — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
