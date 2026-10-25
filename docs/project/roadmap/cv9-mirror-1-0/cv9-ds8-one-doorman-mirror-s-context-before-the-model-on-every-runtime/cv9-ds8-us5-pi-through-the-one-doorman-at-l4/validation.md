# Validation — CV9.DS8.US5

## Status

Passed

## Automated Checks

- npm test 3510/3507 pass 0 fail (3 skipped pre-existing); typecheck clean; lint 1 pre-existing warning; git diff --check; checkSkillCommandParity, checkPackContents, checkDocLinks, checkRetiredSurfaces clean; new tests red-then-green: mirrorLoggerExtension (28), ranker semantic, doorman threshold, operatingMode provenance, commands guessed-stamp refusal, logger first-prompt persona

Checks status: passed

## E2E

Decision: required

Evidence: Navigator walk 2 on the installed Pi 1.4.0 in the checkout, 2026-10-25: 11 rows pass (test-guide.md); walk 1 found two defects (registration guard vs Pi dedupe; first-prompt logger erasing persona), both fixed; semantic threshold 0.4 confirmed by the walk's logged scores

## Navigator Validation

Route: test-guide.md Navigator Validation: explicit turn, no-score follow-up, domain change, sticky voice, Builder switch, unprompted question then doorman turn, /new, /resume, named-session commands, from outside the tree; embeddings read between turns

Navigator accepted: yes

Expected observation: Explicit turn delivers the folder once and signs; follow-ups keep the voice and re-route by domain; Builder switch ends deltas; unprompted question marks the session and the next turn is a doorman turn; no block in messages

Pass condition: All rows on the installed Pi, in the checkout and from outside it

Fail condition: A double load, a missing signature, a Builder turn as the mirror, an unmarked session, the block logged

## Missing Evidence

- none
<!-- ariad-seal sha256:ffc85a4c9bf1d7164c1d3857a6784014a3310911c40735d343e589c46e0b3607 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
