# Validation — CV22.DS6.TS3

## Status

Passed

## Automated Checks

- npm run typecheck && npm run lint && npm test (ts/) — 327 tests, all pass

Checks status: passed

## E2E

Decision: required

Evidence: GitHub Actions run 29837561016 on push 1ab56db: test(3.10), test(3.12), ts(macos-latest), ts(ubuntu-latest), and parity jobs all green. ts jobs include bootstrapConcurrency.test.ts spawning 8 real child processes racing bootstrapDatabase() on the same fresh path; parity job's Real-DB-copy parity + separately-run ts/parity/bootstrap_custody_parity.ts (pragma discipline, schema-structural equivalence vs Python oracle, idempotency, 8-process concurrency race) all PASS locally and structurally covered by the same CI matrix.

## Navigator Validation

Route: Run: node ts/parity/bootstrap_custody_parity.ts (redacted PASS/FAIL per check) and node --test ts/test/db/bootstrap*.test.ts; or inspect GitHub Actions run 29837561016 on the mirror-ts-core branch.

Navigator accepted: yes

Expected observation: bootstrap_custody_parity.ts reports PASS for pragma discipline, schema-structural equivalence, idempotency, and the 8-process concurrency race; node:test reports 10/10 new tests passing; CI shows all 5 jobs green on push 1ab56db.

Pass condition: All four proof points PASS and CI is green across test/ts/parity jobs on the pushed commit.

Fail condition: Any pragma missing, any structural schema diff against the Python oracle, a winner-count other than expected in the concurrency race (duplicate _migrations rows or incomplete ledger), or any CI job red.

## Missing Evidence

- none
