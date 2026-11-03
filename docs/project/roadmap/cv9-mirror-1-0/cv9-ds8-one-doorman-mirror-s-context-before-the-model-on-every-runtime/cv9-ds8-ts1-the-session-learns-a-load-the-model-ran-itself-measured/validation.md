# Validation — CV9.DS8.TS1

## Status

Passed

## Automated Checks

- no product code changed; npm test unchanged (3,462 passed at da645f04's tree); node ts/scripts/checkDocLinks.ts clean

Checks status: passed

## E2E

Decision: required

Evidence: route.sh on the installed Pi 1.4.0, Claude Code 2.1.310, Codex 0.164.0 in scratch cells: Pi P2 (MIRROR_SESSION_ID arrives, conversation bound, mirror_active unwritten as predicted) and P1 (rewrite, flag written); Claude Code CLAUDE_CODE_SESSION_ID in the Bash tool and the hook's env, equal to the hook's session row; Codex CODEX_SESSION_ID under exec and in the Navigator's TUI turn, equal to the codex row. untouched 3/3; clean removed the scratch dir

## Navigator Validation

Route: The rows in the story's Outcome table, re-printed by route.sh read from the probe log, the transcripts, the Stop payloads, and runtime_sessions; the Navigator ran the Claude login and the Codex TUI turn and pasted its env

Navigator accepted: yes

Expected observation: per runtime, each fact as a row with expected, observed, and source, and one mechanism per runtime decided in DS8's package

Pass condition: every row backed by a log; the mechanisms backed by rows

Fail condition: a claimed fact with no log behind it, or a step that did not run

## Missing Evidence

- none
<!-- ariad-seal sha256:9b52ab4d2a28473bad0b3da9c358d3546e598fb12be5c2c57a40fb1eafa67c8b — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
