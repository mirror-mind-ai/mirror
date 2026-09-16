# Validation — CV22.DS7.US8

## Status

Passed

## Automated Checks

- ts: npm test 2215 pass, tsc and biome clean, .pi typecheck clean
- python: pytest unit+integration 2761 pass, ruff clean
- builder_lifecycle_smoke 331/331 through the real front door with no gate; conversation_lifecycle_smoke 203 checks
- write probes builder_cursor_state, builder_artifacts (CI, demo copy) and builder_load (real-corpus copy): match
- scripts/smoke_builder_real_copy.sh: 8 events diff-clean on real-database copies and scratch clones, harness proven to bite
- oracle drift, skill command parity, doc links, Claude plugin sync: clean; CI green on all five jobs at 2a597fc5 and 2eac05ff

Checks status: passed

## E2E

Decision: required

Evidence: Navigator route steps 1-6 (test-guide.md): read-only leaves byte-identical on the real home; live load on two real-database copies identical on all four faces; full lifecycle on copies diff-clean; revert identical with Python in the log; backup restored into a scratch home and loaded; live Pi Builder session verified in front-door.log with build ts leaf= lines, a build python line for a Workbench leaf, no fell_back, no argument text

## Navigator Validation

Route: steps 1-3 and 6 run 2026-09-16 and accepted by the Navigator; step 4 backup, restore drill, dry run, plan-item and approve-plan through the TS front door; step 5 run by the Navigator in a fresh Pi session

Navigator accepted: yes

Expected observation: identical streams and cursor bytes on both engines; build ts leaf= in the log; the real cursor advancing on TypeScript

Pass condition: diff-clean at every step, real cursor advancing on TS, no fell_back, no argument text

Fail condition: any surface or cursor-byte difference, any fell_back, any argument text in the log, any TS answer for a Workbench leaf

## Missing Evidence

- none
