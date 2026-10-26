# Validation — CV9.DS9.TS1

## Status

Passed

## Automated Checks

- npm test: 3544 tests, 3541 passed, 0 failed, 3 skipped
- npm run typecheck: clean
- npm run lint: clean apart from one pre-existing warning (testTempHomes.test.ts)
- checkDocLinks and checkRetiredSurfaces (files staged): clean
- frozen runtime-status and runtime-diagnose goldens pass unedited

Checks status: passed

## E2E

Decision: required

Evidence: Re-measurement at 4a74f098, two sets of seven eval --all runs per model ($0.25): Luna and Haiku at MEMORY_EXTRACTION_REASONING=none pass all six blocking probes 14/14 with real answers and none of their 1,428 calls is cut off; Luna keeps every fix and improves two; Haiku loses conversation-summary (6/7 -> 4/14), accepted as measured; the control's tags-exclude-noise drift accepted. Evidence: evidence/2026-10-26-reasoning-off/README.md

## Navigator Validation

Route: From the clone's root: node bin/mirror.js runtime version, then runtime status three ways (unset, none, off), runtime diagnose with off and without, title_tags on Haiku at none in a scratch MIRROR_HOME with its --history line, and the evidence README

Navigator accepted: yes

Expected observation: Unset leaves the status line as today; none shows reasoning=none; off shows reasoning=invalid (off) and a diagnose finding; Haiku at none answers the injection probe with a real title, 7/7, and its record carries reasoning=none at v4

Pass condition: Steps 0 to 3 as expected and the comparison's criteria met or decided by the Navigator

Fail condition: Reasoning still spent at none, a candidate rejecting the field, a blocking probe failing or passing vacuously, an unnamed cut-off, an unset setting changing a body or the status line, or an invalid value failing a call

## Missing Evidence

- none
<!-- ariad-seal sha256:b74e73ca48e052853eaec3c6eef3f2503ffbbe502022a398c5b2ee61478f6f3c — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
