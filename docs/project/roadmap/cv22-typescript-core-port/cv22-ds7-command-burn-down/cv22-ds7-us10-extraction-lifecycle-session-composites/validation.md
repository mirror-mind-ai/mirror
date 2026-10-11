# Validation — CV22.DS7.US10

## Status

Passed

## Automated Checks

- cd ts && npm test && npm run typecheck && npm run lint — 1215 tests, clean
- uv run pytest tests/ -q --ignore=tests/live — 2829 passed (one pre-existing local-only web-server subprocess test; CI green)
- uv run python scripts/check_oracle_drift.py — clean
- seven goldens regeneration-stable on 3.10 and 3.12 in CI (gate extended this story)
- write_parity.py: close_tail (17 rows), session_composites (47 rows), journey_repair_apply, plus the four DS4/US5 probes — all match on the demo copy, in CI

Checks status: passed

## E2E

Decision: required

Evidence: ts/parity/conversation_lifecycle_smoke.ts: 64 checks through the real front door on a disposable home — hooks over stdin, close tail under replay, maintenance twice (re-run adds zero ledger rows), session-less backfill, switch, session-end-pi, Codex backfill, diagnose/repair, redaction sweep, kill switch; green locally and in the CI parity job on Linux

## Navigator Validation

Route: node --no-warnings ts/parity/conversation_lifecycle_smoke.ts; the same lifecycle by hand on a kept home (stdout, rows, ledger, front-door log routes, both revert controls); then write_parity.py --probe close_tail | session_composites | journey_repair_apply on the demo copy

Navigator accepted: yes

Expected observation: 64 PASS lines and 'all checks passed'; each probe match: true with equal hashes; front-door log route=ts for all 15 subcommands (repair-journeys --apply: python) and route=python under MIRROR_TS_CONVERSATION_LOGGER=0; observed 2026-09-07 by the Navigator, with the fail condition proven by one mutated stub token

Pass condition: all smoke checks pass; all three lifecycle probes match; the Navigator accepts the two recorded qualifications — repair-journeys --apply stays on Python until DS7.TS1 ports backup, and the TS ledger is unpriced (cost_usd NULL) until DS8 — ACCEPTED 2026-09-07

Fail condition: any FAIL line in the smoke, any probe hash divergence, any subcommand routing to python under the replay gate, or a qualification the Navigator refuses

## Missing Evidence

- none
